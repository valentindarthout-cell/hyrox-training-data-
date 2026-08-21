/* ================================================================
   OCTA. tracks-plan.js — Group programming v2 (lanes)
   Model: one plan block belongs to exactly ONE track (track_ids = [id]).
   Multi-track creation makes independent copies per lane.
   Requires app.js loaded first (globals: api, esc, cap, todayStr, addDays,
   mondayOf, parseDate, fmtShort, fmtDay, PHASES, SPLIT_COLORS, STATIONS,
   normalizeBlocks, blockColor, lighten, intOrNull, coachAthletes,
   wkTemplates, libFilters, DUR_RANGES, modalityOptions, #sidePanel).
================================================================ */

const TRACK_COLORS=['#0f0f0e','#60a5fa','#34d399','#fbbf24','#f97316','#ef4444','#a78bfa','#c8a96a'];
let coachTracks=[], planBlocks=[], planWeek=mondayOf(todayStr());
let laneCollapsed = JSON.parse(localStorage.getItem('octa_lanes_collapsed')||'{}');
let rosterTrackFilter = null;

async function loadTracks(){
  try{ const d=await api('/api/workouts?action=tracks'); coachTracks=d.tracks||[]; }
  catch(e){ coachTracks=[]; }
}
function trackById(id){ return coachTracks.find(t=>t.id===id)||null; }
function blockTrackId(b){ return (b.track_ids&&b.track_ids[0])||null; }
function trackAthleteCount(trackId){
  return (coachAthletes||[]).filter(a=>(a.track_ids||[]).includes(trackId)).length;
}

/* ================================================================
   COACH SETTINGS — Tracks card
================================================================ */
function renderTracksCard(){
  const anchor=document.getElementById('csName');
  if(!anchor) return;
  let host=document.getElementById('tracksCardHost');
  if(!host){
    anchor.closest('.section-card').insertAdjacentHTML('afterend',
      '<div class="section-card"><div class="section-label">Athlete tracks</div><div id="tracksCardHost"></div></div>');
    host=document.getElementById('tracksCardHost');
  }
  loadTracks().then(()=>trackListHTML(host));
}
function trackListHTML(host){
  host.innerHTML=`
    ${coachTracks.length? coachTracks.map(t=>`
      <div class="race-row">
        <span class="track-dot" style="background:${t.color||'#999'}"></span>
        <div class="race-row-main"><div class="race-row-name">${esc(t.name)}</div></div>
        <button class="mini-btn" onclick="trackDelete('${t.id}')">✕</button>
      </div>`).join('')
      : '<div class="hint">No tracks yet — e.g. Elite, Open, Running focus, Strength focus.</div>'}
    <div class="rr-import" style="margin-top:12px">
      <input id="newTrackName" class="text-input" type="text" placeholder="New track name" style="margin-bottom:0">
      <button class="btn-slim" onclick="trackAdd()">Add</button>
    </div>
    <div class="pill-row" id="newTrackColors" style="margin-top:10px">
      ${TRACK_COLORS.map((c,i)=>`<button class="track-swatch ${i===0?'sel':''}" data-c="${c}" style="background:${c}" onclick="pickTrackColor(this)"></button>`).join('')}
    </div>
    <div id="trackMsg" class="save-msg" style="text-align:left"></div>`;
}
let newTrackColor=TRACK_COLORS[0];
function pickTrackColor(el){
  newTrackColor=el.dataset.c;
  document.querySelectorAll('#newTrackColors .track-swatch').forEach(b=>b.classList.toggle('sel',b===el));
}
async function trackAdd(){
  const name=document.getElementById('newTrackName').value.trim();
  const msg=document.getElementById('trackMsg');
  if(!name){ msg.textContent='Give the track a name.'; return; }
  try{
    const d=await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'save-track',name,color:newTrackColor,position:coachTracks.length})});
    if(d.track) coachTracks.push(d.track);
    trackListHTML(document.getElementById('tracksCardHost'));
  }catch(e){ msg.textContent=e.message; }
}
async function trackDelete(id){
  try{
    await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'delete-track',id})});
    coachTracks=coachTracks.filter(t=>t.id!==id);
    trackListHTML(document.getElementById('tracksCardHost'));
  }catch(e){}
}

/* ================================================================
   COACH ATHLETE VIEW — track tagging
================================================================ */
function renderAthleteTracks(athlete){
  const crmNotes=document.getElementById('crmNotes');
  if(!crmNotes) return;
  let host=document.getElementById('athTracksHost');
  if(!host){
    crmNotes.insertAdjacentHTML('beforebegin',
      '<div class="section-sublabel">Tracks</div><div class="pill-row wrap" id="athTracksHost"></div>');
    host=document.getElementById('athTracksHost');
  }
  const paint=()=>{
    host.innerHTML=coachTracks.length? coachTracks.map(t=>{
      const on=(athlete.track_ids||[]).includes(t.id);
      return `<button class="pill" style="${on?`background:${t.color};color:#fff;border-color:${t.color};`:''}"
        onclick="athToggleTrack('${t.id}')">${esc(t.name)}</button>`;
    }).join('') : '<div class="hint">Create tracks in Settings first.</div>';
  };
  if(coachTracks.length) paint(); else loadTracks().then(paint);
  window._athTracksPaint=paint;
  window._athTracksAthlete=athlete;
}
async function athToggleTrack(trackId){
  const athlete=window._athTracksAthlete;
  athlete.track_ids=athlete.track_ids||[];
  const i=athlete.track_ids.indexOf(trackId);
  if(i>-1) athlete.track_ids.splice(i,1); else athlete.track_ids.push(trackId);
  window._athTracksPaint();
  try{
    await api('/api/coach',{method:'POST',body:JSON.stringify({action:'set-tracks',athlete_id:athlete.id,track_ids:athlete.track_ids})});
  }catch(e){}
}

/* ================================================================
   ROSTER — track filter + chips (overrides app.js loadAthletes)
================================================================ */
async function loadAthletes(){
  const list=document.getElementById('athleteList');
  list.innerHTML='<div class="empty-state">Loading…</div>';
  try{
    const d=await api('/api/coach?action=athletes');
    coachAthletes=d.athletes||[];
  }catch(e){ list.innerHTML='<div class="empty-state">Could not load athletes.</div>'; return; }
  if(!coachTracks.length) await loadTracks();
  paintRoster();
}
function paintRoster(){
  const list=document.getElementById('athleteList');
  // filter pills above the grid
  let bar=document.getElementById('rosterTrackBar');
  if(!bar){
    list.insertAdjacentHTML('beforebegin','<div class="pill-row wrap" id="rosterTrackBar" style="margin-bottom:12px"></div>');
    bar=document.getElementById('rosterTrackBar');
  }
  bar.innerHTML = coachTracks.length
    ? `<button class="pill ${rosterTrackFilter===null?'active':''}" onclick="setRosterFilter(null)">All</button>`+
      coachTracks.map(t=>`<button class="pill" style="${rosterTrackFilter===t.id?`background:${t.color};color:#fff;border-color:${t.color};`:''}"
        onclick="setRosterFilter('${t.id}')">${esc(t.name)}</button>`).join('')
    : '';
  const shown=(coachAthletes||[]).filter(a=>!rosterTrackFilter || (a.track_ids||[]).includes(rosterTrackFilter));
  if(!coachAthletes.length){
    list.innerHTML=`<div class="empty-state">No athletes yet.<br>Share your invite code — they enter it in their Settings.</div>`;
    return;
  }
  if(!shown.length){ list.innerHTML='<div class="empty-state">No athletes in this track.</div>'; return; }
  list.innerHTML=shown.map(a=>{
    const i=coachAthletes.indexOf(a);
    const st=(a.crm&&a.crm.status)||'active';
    const fullName=[a.first_name,a.last_name].filter(Boolean).join(' ') || a.email;
    const chips=(a.track_ids||[]).map(id=>{
      const t=trackById(id); return t? `<span class="cw-track" style="background:${t.color}">${esc(t.name)}</span>` : '';
    }).join(' ');
    return `<div class="athlete-card" onclick="openAthlete(${i})">
      <div class="an">${esc(fullName)}</div>
      <div class="am">${a.last_session?'Last session '+fmtShort(a.last_session):'No sessions yet'}
        ${a.race_name?'<br>'+esc(a.race_name)+(a.race_date?' · '+fmtShort(a.race_date):''):''}</div>
      <div style="margin-top:8px">${chips}</div>
      <span class="as ${st}">${st}</span>
    </div>`;
  }).join('');
}
function setRosterFilter(id){ rosterTrackFilter=id; paintRoster(); }

/* ================================================================
   PROGRAMMING TAB — Week plan as LANES (one row per track)
================================================================ */
function renderWeekPlan(){
  const prog=document.getElementById('coachProg');
  if(!prog) return;
  let host=document.getElementById('weekPlanHost');
  if(!host){
    const tipHtml = localStorage.getItem('octa_prog_tip_seen') ? '' :
      '<div class="onb-tip" id="onbProgTip">'
      + '<button class="onb-tip-close" onclick="onbDismissProgTip()">\u2715</button>'
      + 'Two ways to build a workout: save it to your <b>Library</b> below to reuse it across weeks and tracks, or click straight into a <b>lane cell</b> above for a one-off session for just that track.'
      + '</div>';
    prog.insertAdjacentHTML('afterbegin',
      `<div class="section-card" id="weekPlanCard">
        ${tipHtml}
        <div class="coach-toolbar" style="margin-bottom:10px">
          <div class="section-label" style="margin:0">Week plan</div>
          <div style="display:flex;align-items:center;gap:8px">
            <button class="strip-arrow" onclick="shiftPlanWeek(-1)">‹</button>
            <span id="planWeekLabel" class="stats-period-label" style="font-size:11px">—</span>
            <button class="strip-arrow" onclick="shiftPlanWeek(1)">›</button>
          </div>
        </div>
        <div id="weekPlanHost"></div>
      </div>`);
    host=document.getElementById('weekPlanHost');
  }
  const boot=async()=>{
    await loadTracks();
    if(!coachTracks.length){
      // safety net: auto-create the General track
      try{
        const d=await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'save-track',name:'General',color:TRACK_COLORS[0],position:0})});
        if(d.track) coachTracks=[d.track];
      }catch(e){}
    }
    if(!(coachAthletes||[]).length){
      try{ const d=await api('/api/coach?action=athletes'); coachAthletes=d.athletes||[]; }catch(e){}
    }
    loadPlanWeek();
  };
  boot();
}
function shiftPlanWeek(n){ planWeek=addDays(planWeek,7*n); loadPlanWeek(); }
function onbDismissProgTip(){
  localStorage.setItem('octa_prog_tip_seen','1');
  document.getElementById('onbProgTip')?.remove();
}
async function loadPlanWeek(){
  document.getElementById('planWeekLabel').textContent=fmtShort(planWeek)+' – '+fmtShort(addDays(planWeek,6));
  try{
    const d=await api(`/api/workouts?action=blocks&start=${planWeek}&end=${addDays(planWeek,6)}`);
    planBlocks=d.blocks||[];
  }catch(e){ planBlocks=[]; }
  paintLanes();
}
function paintLanes(){
  const host=document.getElementById('weekPlanHost');
  const dows=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const untagged=(coachAthletes||[]).filter(a=>!(a.track_ids||[]).length);
  let html='';
  if(untagged.length){
    html+=`<div class="lane-warning">${untagged.length} athlete${untagged.length>1?'s have':' has'} no track and receive${untagged.length>1?'':'s'} no group workouts.
      <button class="mini-btn" onclick="assignUntaggedToFirst()">Add to ${esc(coachTracks[0]?coachTracks[0].name:'General')}</button></div>`;
  }
  html+=`<div class="lane-daysrow"><span class="lane-headspace"></span>${dows.map((d,i)=>`<span class="lane-dayhead ${addDays(planWeek,i)===todayStr()?'today':''}">${d} ${parseDate(addDays(planWeek,i)).getDate()}</span>`).join('')}</div>`;
  html+=coachTracks.map(t=>{
    const collapsed=!!laneCollapsed[t.id];
    const laneBlocks=planBlocks.filter(b=>blockTrackId(b)===t.id);
    return `<div class="lane">
      <div class="lane-head">
        <span class="track-dot" style="background:${t.color}"></span>
        <span class="lane-name">${esc(t.name)}</span>
        <span class="lane-count">${trackAthleteCount(t.id)}</span>
        <span class="lane-phase" onclick="lanePhaseMenu('${t.id}',this)" title="Week phase">${laneWeekPhase(t.id)||'Phase ▾'}</span>
        <button class="lane-toggle" onclick="toggleLane('${t.id}')">${collapsed?'▸':'▾'}</button>
      </div>
      ${collapsed?'':`<div class="lane-cells">
        ${[0,1,2,3,4,5,6].map(i=>{
          const ds=addDays(planWeek,i);
          const cells=laneBlocks.filter(b=>b.date===ds);
          return `<div class="lane-cell ${ds===todayStr()?'today':''}" onclick="pbNewForLane('${ds}','${t.id}')">
            ${cells.map(b=>{
              const col=SPLIT_COLORS[b.workout_type]||'#888';
              const fb=b._feedback;
              const avgDiff = fb && fb.diffCount>0 ? (fb.diffSum/fb.diffCount).toFixed(1) : null;
              const badge = fb && fb.done>0
                ? '<span class="lw-fb">'+fb.done+' done'+(avgDiff?' \u00b7 RPE '+avgDiff:'')+(fb.liked>0?' \u00b7 \u2665'+fb.liked:'')+'</span>'
                : '';
              return `<div class="lane-wk" style="background:${col}" onclick="event.stopPropagation();pbEdit('${b.id}')">
                ${esc(b.title||'Workout')}${b.duration_min?`<span class="lw-dur">${b.duration_min}'</span>`:''}${badge}
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}
      </div>`}
    </div>`;
  }).join('');
  host.innerHTML=html;
}
function toggleLane(id){
  laneCollapsed[id]=!laneCollapsed[id];
  localStorage.setItem('octa_lanes_collapsed', JSON.stringify(laneCollapsed));
  paintLanes();
}
async function assignUntaggedToFirst(){
  const t=coachTracks[0]; if(!t) return;
  const untagged=(coachAthletes||[]).filter(a=>!(a.track_ids||[]).length);
  for(const a of untagged){
    a.track_ids=[t.id];
    try{ await api('/api/coach',{method:'POST',body:JSON.stringify({action:'set-tracks',athlete_id:a.id,track_ids:a.track_ids})}); }catch(e){}
  }
  paintLanes();
}

/* ---------- per-lane week phase ---------- */
const laneWeekPhases={};   // cache: trackId+week -> label
function laneWeekPhase(trackId){ return laneWeekPhases[trackId+planWeek]||null; }
function lanePhaseMenu(trackId, el){
  const existing=document.getElementById('lanePhasePop');
  if(existing) existing.remove();
  const rect=el.getBoundingClientRect();
  document.body.insertAdjacentHTML('beforeend',
    `<div id="lanePhasePop" class="qa-pop" style="top:${rect.bottom+6+window.scrollY}px;left:${Math.max(10,rect.left-40)}px">
      ${PHASES.map(p=>`<button class="pill" onclick="setLanePhase('${trackId}','${p}')">${p}</button>`).join('')}
      <button class="pill" onclick="setLanePhase('${trackId}',null)">Clear</button>
    </div>`);
  setTimeout(()=>document.addEventListener('click', closeLanePop, {once:true}),0);
}
function closeLanePop(e){
  const pop=document.getElementById('lanePhasePop');
  if(pop && !pop.contains(e.target)) pop.remove();
}
async function setLanePhase(trackId, label){
  document.getElementById('lanePhasePop')?.remove();
  laneWeekPhases[trackId+planWeek]=label;
  paintLanes();
  const laneAthletes=(coachAthletes||[]).filter(a=>(a.track_ids||[]).includes(trackId));
  for(const a of laneAthletes){
    try{ await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'week-label',athlete_id:a.id,week_start:planWeek,label})}); }catch(e){}
  }
}

/* ================================================================
   BLOCK EDITOR (single-track model)
================================================================ */
let pb=null;
function pbNewForLane(date, trackId){
  pb={ id:null, date, title:'', workout_type:'hyrox', duration_min:60,
       blocks:normalizeBlocks([]), stations:{}, subtypes:[],
       track_ids:[trackId], excluded_athletes:[], _multiTracks:[trackId] };
  pbOpen();
}
function pbEdit(id){
  const b=planBlocks.find(x=>x.id===id); if(!b) return;
  pb=JSON.parse(JSON.stringify(b));
  pb.blocks=normalizeBlocks(pb.blocks);
  pbOpen();
}
function pbOpen(){
  const isNew=!pb.id;
  const tid=blockTrackId(pb), tr=trackById(tid);
  document.getElementById('spTitle').textContent=(isNew?'New — ':'')+fmtDay(pb.date);
  const body=document.getElementById('spBody');
  body.innerHTML=`
    <input id="pbTitle" class="text-input" type="text" placeholder="Workout title" value="${esc(pb.title||'')}">
    <div class="pill-row" style="margin-bottom:12px">
      ${['hyrox','endurance','strength'].map(t=>`<button class="pill pb-type ${pb.workout_type===t?'active':''}" data-t="${t}" onclick="pbSetType('${t}')">${t==='hyrox'?'Hyrox / Mix':cap(t)}</button>`).join('')}
    </div>
    ${isNew
      ? `<div class="section-sublabel">Tracks — create a copy in each selected lane</div>
         <div class="pill-row wrap" id="pbTracks"></div>`
      : `<div class="section-sublabel">Lane</div>
         <div>${tr?`<span class="cw-track" style="background:${tr.color};font-size:10px;padding:4px 12px">${esc(tr.name)}</span>`:''}</div>`}
    <div class="metric-field" style="max-width:140px;margin:12px 0"><label>Duration min</label>
      <input id="pbDuration" type="number" inputmode="numeric" value="${pb.duration_min??60}"></div>
    <div id="pbBlocks"></div>
    <div class="section-card"><div class="section-label">Station volumes</div>
      <div class="hyrox-grid" id="pbStations"></div></div>
    <div class="sp-actions" style="flex-wrap:wrap">
      <button class="btn-slim" onclick="pbSave()">${isNew?'Create':'Save'}</button>
      ${!isNew?`
        <button class="btn-slim secondary" onclick="pbPushToLanes()">Push to other lanes</button>
        <button class="btn-slim secondary" onclick="pbCopyMenu(this)">Copy ▾</button>
        <button class="btn-slim danger" onclick="pbDelete()">Delete</button>`:''}
      <div id="pbMsg" class="save-msg" style="margin:0;text-align:left;flex-basis:100%"></div>
    </div>
    ${!isNew?'<div class="hint" style="margin-top:8px">Done athletes keep their version. Individually edited copies stay individual. Push overwrites other lanes\u2019 same-day workout content.</div>':''}`;
  if(isNew) pbPaintTracks();
  pbPaintBlocks(); pbPaintStations();
  document.getElementById('sidePanel').classList.add('open');
}
function pbSetType(t){
  pb.workout_type=t; pb.subtypes=[];
  document.querySelectorAll('.pb-type').forEach(b=>b.classList.toggle('active',b.dataset.t===t));
  pbPaintBlocks();
}
function pbPaintTracks(){
  const el=document.getElementById('pbTracks'); if(!el) return;
  el.innerHTML=coachTracks.map(t=>{
    const on=(pb._multiTracks||[]).includes(t.id);
    return `<button class="pill" style="${on?`background:${t.color};color:#fff;border-color:${t.color};`:''}"
      onclick="pbToggleTrack('${t.id}')">${esc(t.name)}</button>`;
  }).join('');
}
function pbToggleTrack(id){
  pb._multiTracks=pb._multiTracks||[];
  const i=pb._multiTracks.indexOf(id);
  if(i>-1) pb._multiTracks.splice(i,1); else pb._multiTracks.push(id);
  pbPaintTracks();
}
function pbPaintBlocks(){
  document.getElementById('pbBlocks').innerHTML=pb.blocks.map((b,i)=>{
    return `<div class="blk" style="background:${lighten(SPLIT_COLORS[pb.workout_type]||'#888',0.92)};border-color:var(--hair)">
      <label style="color:${blockColor(pb.workout_type,'Main')}">${b.name}</label>
      <textarea oninput="pb.blocks[${i}].text=this.value">${esc(b.text)}</textarea>
    </div>`;
  }).join('');
}
function pbPaintStations(){
  const fields=[{k:'run_km',label:'Run km'},{k:'compromised_run_km',label:'Compromised run km'}]
    .concat(STATIONS.map(s=>({k:s.k,label:s.label+' '+s.unit})));
  document.getElementById('pbStations').innerHTML=fields.map(f=>`<div class="metric-field"><label>${f.label}</label>
    <input type="number" step="0.1" value="${pb.stations[f.k]??''}" oninput="pb.stations['${f.k}']=this.value===''?null:parseFloat(this.value)"></div>`).join('');
}
function pbContent(){
  return { title:pb.title, workout_type:pb.workout_type, duration_min:pb.duration_min,
           objective:pb.objective||null, blocks:pb.blocks, stations:pb.stations, subtypes:pb.subtypes||[] };
}
async function pbSave(){
  const msg=document.getElementById('pbMsg');
  pb.title=document.getElementById('pbTitle').value;
  pb.duration_min=intOrNull(document.getElementById('pbDuration').value);
  msg.textContent='Saving…';
  try{
    if(pb.id){
      await api('/api/workouts',{method:'POST',body:JSON.stringify({
        action:'save-block', id:pb.id, date:pb.date, ...pbContent(),
        track_ids:pb.track_ids, excluded_athletes:pb.excluded_athletes||[]
      })});
    }else{
      const targets=pb._multiTracks||[];
      if(!targets.length){ msg.textContent='Select at least one track.'; return; }
      let total=0;
      for(const tid of targets){
        const d=await api('/api/workouts',{method:'POST',body:JSON.stringify({
          action:'save-block', date:pb.date, ...pbContent(),
          track_ids:[tid], excluded_athletes:[]
        })});
        total+=d.athletes||0;
      }
      msg.textContent='Created in '+targets.length+' lane'+(targets.length>1?'s':'')+' — '+total+' athlete'+(total===1?'':'s');
      setTimeout(()=>{ document.getElementById('sidePanel').classList.remove('open'); loadPlanWeek(); },1000);
      return;
    }
    msg.textContent='Saved';
    setTimeout(()=>{ document.getElementById('sidePanel').classList.remove('open'); loadPlanWeek(); },700);
  }catch(e){ msg.textContent=e.message; }
}
async function pbPushToLanes(){
  const msg=document.getElementById('pbMsg');
  pb.title=document.getElementById('pbTitle').value;
  pb.duration_min=intOrNull(document.getElementById('pbDuration').value);
  const myTrack=blockTrackId(pb);
  const siblings=planBlocks.filter(b=>b.date===pb.date && b.id!==pb.id && blockTrackId(b)!==myTrack);
  if(!siblings.length){ msg.textContent='No other lanes have a workout on this day.'; return; }
  msg.textContent='Pushing…';
  try{
    for(const s of siblings){
      await api('/api/workouts',{method:'POST',body:JSON.stringify({
        action:'save-block', id:s.id, date:s.date, ...pbContent(),
        track_ids:s.track_ids, excluded_athletes:s.excluded_athletes||[]
      })});
    }
    msg.textContent='Pushed to '+siblings.length+' lane'+(siblings.length>1?'s':'');
    setTimeout(()=>loadPlanWeek(),800);
  }catch(e){ msg.textContent=e.message; }
}
function pbCopyMenu(el){
  document.getElementById('lanePhasePop')?.remove();
  const rect=el.getBoundingClientRect();
  const dows=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  document.body.insertAdjacentHTML('beforeend',
    `<div id="lanePhasePop" class="qa-pop" style="top:${rect.bottom+6+window.scrollY}px;left:${Math.max(10,rect.left-120)}px">
      <div class="qa-pop-label">Copy to day (same lane)</div>
      ${dows.map((d,i)=>`<button class="pill" onclick="pbCopyTo('${addDays(planWeek,i)}',null)">${d}</button>`).join('')}
      <div class="qa-pop-label">Copy to next week</div>
      <button class="pill" onclick="pbCopyTo('${addDays(pb?pb.date:todayStr(),7)}',null)">Same day next week</button>
      <div class="qa-pop-label">Copy to track (same day)</div>
      ${coachTracks.filter(t=>t.id!==blockTrackId(pb)).map(t=>`<button class="pill" onclick="pbCopyTo(null,'${t.id}')">${esc(t.name)}</button>`).join('')||'<span class="hint">No other tracks</span>'}
    </div>`);
  setTimeout(()=>document.addEventListener('click', closeLanePop, {once:true}),0);
}
async function pbCopyTo(date, trackId){
  document.getElementById('lanePhasePop')?.remove();
  const msg=document.getElementById('pbMsg');
  pb.title=document.getElementById('pbTitle').value;
  pb.duration_min=intOrNull(document.getElementById('pbDuration').value);
  msg.textContent='Copying…';
  try{
    const d=await api('/api/workouts',{method:'POST',body:JSON.stringify({
      action:'save-block', date: date||pb.date, ...pbContent(),
      track_ids: trackId? [trackId] : pb.track_ids, excluded_athletes:[]
    })});
    msg.textContent='Copied — '+(d.athletes||0)+' athlete'+(d.athletes===1?'':'s');
    setTimeout(()=>loadPlanWeek(),800);
  }catch(e){ msg.textContent=e.message; }
}
async function pbDelete(){
  try{
    await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'delete-block',id:pb.id})});
    document.getElementById('sidePanel').classList.remove('open');
    loadPlanWeek();
  }catch(e){}
}

/* ================================================================
   LIBRARY — quick-add popup (overrides app.js renderLibrary)
================================================================ */
function renderLibrary(){
  const list=document.getElementById('wkList');
  const q=(document.getElementById('libSearch').value||'').toLowerCase().trim();
  const filtered=wkTemplates.filter(t=>{
    if(libFilters.type && t.workout_type!==libFilters.type) return false;
    if(libFilters.dur!=null){
      const [lo,hi]=DUR_RANGES[libFilters.dur];
      const d=t.duration_min||0;
      if(!(d>=lo && (hi===999? true : d<=hi))) return false;
    }
    if(libFilters.mods.length && !libFilters.mods.every(m=>(t.subtypes||[]).includes(m))) return false;
    if(q){
      const hay=((t.title||'')+' '+normalizeBlocks(t.blocks).map(b=>b.text).join(' ')).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  if(!wkTemplates.length){ list.innerHTML='<div class="empty-state">No workouts yet — create your first or generate one with AI.</div>'; return; }
  if(!filtered.length){ list.innerHTML='<div class="empty-state">Nothing matches these filters.</div>'; return; }
  list.innerHTML=filtered.map(t=>{
    const i=wkTemplates.indexOf(t);
    const col=SPLIT_COLORS[t.workout_type]||'#999';
    const fb=t._feedback;
    const avgDiff = fb && fb.diffCount>0 ? (fb.diffSum/fb.diffCount).toFixed(1) : null;
    const likePct = fb && fb.done>0 ? Math.round(100*fb.liked/fb.done) : null;
    const fbLine = fb && fb.done>0
      ? '<br><span class="wk-fb">'+fb.done+' done'+(avgDiff?' \u00b7 RPE '+avgDiff:'')+(likePct!=null?' \u00b7 \u2665'+likePct+'% ('+fb.liked+'/'+fb.done+')':'')+'</span>'
      : '';
    return `<div class="athlete-card wk-card" style="border-left-color:${col}" onclick="qaOpen(${i})">
      <div class="an"><span class="type-dot" style="background:${col}"></span>${esc(t.title||'Untitled')}</div>
      <div class="am">${t.workout_type==='hyrox'?'Hyrox / Mix':cap(t.workout_type||'')} · ${t.duration_min||'—'} min${(t.subtypes||[]).length?'<br>'+t.subtypes.slice(0,3).join(' · '):''}${fbLine}</div>
    </div>`;
  }).join('');
}
let qa={idx:null, day:null, tracks:[]};
function qaOpen(i){
  const t=wkTemplates[i]; if(!t) return;
  qa={idx:i, day:null, tracks:coachTracks.map(x=>x.id)};
  document.getElementById('qaModal')?.remove();
  const dows=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  document.body.insertAdjacentHTML('beforeend',
    `<div id="qaModal" class="strava-modal" style="display:flex">
      <div class="strava-sheet">
        <div class="strava-sheet-head">
          <div class="section-label" style="margin:0">${esc(t.title||'Workout')}</div>
          <button class="mini-btn" onclick="document.getElementById('qaModal').remove()">Close</button>
        </div>
        <div class="section-sublabel">Day — week of ${fmtShort(planWeek)}</div>
        <div class="pill-row wrap" id="qaDays">
          ${dows.map((d,i2)=>`<button class="pill" data-d="${addDays(planWeek,i2)}" onclick="qaPickDay(this)">${d} ${parseDate(addDays(planWeek,i2)).getDate()}</button>`).join('')}
        </div>
        <div class="section-sublabel">Tracks</div>
        <div class="pill-row wrap" id="qaTracks"></div>
        <div class="sp-actions">
          <button class="btn-slim" onclick="qaAdd()">Add to plan</button>
          <button class="btn-slim secondary" onclick="qaEditTemplate()">Edit template</button>
          <div id="qaMsg" class="save-msg" style="margin:0;text-align:left"></div>
        </div>
      </div>
    </div>`);
  qaPaintTracks();
}
function qaPickDay(el){
  qa.day=el.dataset.d;
  document.querySelectorAll('#qaDays .pill').forEach(b=>b.classList.toggle('active',b===el));
}
function qaPaintTracks(){
  document.getElementById('qaTracks').innerHTML=coachTracks.map(t=>{
    const on=qa.tracks.includes(t.id);
    return `<button class="pill" style="${on?`background:${t.color};color:#fff;border-color:${t.color};`:''}"
      onclick="qaToggleTrack('${t.id}')">${esc(t.name)}</button>`;
  }).join('');
}
function qaToggleTrack(id){
  const i=qa.tracks.indexOf(id);
  if(i>-1) qa.tracks.splice(i,1); else qa.tracks.push(id);
  qaPaintTracks();
}
function qaEditTemplate(){
  document.getElementById('qaModal').remove();
  editTemplate(qa.idx);
}
async function qaAdd(){
  const msg=document.getElementById('qaMsg');
  const t=wkTemplates[qa.idx];
  if(!qa.day){ msg.textContent='Pick a day.'; return; }
  if(!qa.tracks.length){ msg.textContent='Pick at least one track.'; return; }
  msg.textContent='Adding…';
  try{
    let total=0;
    for(const tid of qa.tracks){
      const d=await api('/api/workouts',{method:'POST',body:JSON.stringify({
        action:'save-block', date:qa.day,
        title:t.title, workout_type:t.workout_type, duration_min:t.duration_min,
        objective:t.objective||null, blocks:t.blocks||[], stations:t.stations||{}, subtypes:t.subtypes||[],
        track_ids:[tid], excluded_athletes:[], template_id:t.id
      })});
      total+=d.athletes||0;
    }
    msg.textContent='Added to '+qa.tracks.length+' lane'+(qa.tracks.length>1?'s':'')+' — '+total+' athlete'+(total===1?'':'s');
    setTimeout(()=>{ document.getElementById('qaModal')?.remove(); loadPlanWeek(); },1000);
  }catch(e){ msg.textContent=e.message; }
}
