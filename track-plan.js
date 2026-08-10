/* ================================================================
   OCTA. tracks-plan.js — Group programming Part A
   Requires app.js loaded first (uses api, esc, cap, todayStr, addDays,
   mondayOf, parseDate, SPLIT_COLORS, normalizeBlocks, blockColor, lighten,
   modalityOptions, intOrNull, STATIONS, the #sidePanel container).
   Injects:
   - "Tracks" card into coach Settings
   - Track tag pills into coach athlete view (next to CRM)
   - "Week plan" (core week) section at top of the Programming tab
================================================================ */

const TRACK_COLORS=['#0f0f0e','#60a5fa','#34d399','#fbbf24','#f97316','#ef4444','#a78bfa','#c8a96a'];
let coachTracks=[], planBlocks=[], planWeek=mondayOf(todayStr());

async function loadTracks(){
  try{ const d=await api('/api/workouts?action=tracks'); coachTracks=d.tracks||[]; }
  catch(e){ coachTracks=[]; }
}
function trackById(id){ return coachTracks.find(t=>t.id===id)||null; }

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
   PROGRAMMING TAB — Week plan (core week)
================================================================ */
function renderWeekPlan(){
  const prog=document.getElementById('coachProg');
  if(!prog) return;
  let host=document.getElementById('weekPlanHost');
  if(!host){
    prog.insertAdjacentHTML('afterbegin',
      `<div class="section-card" id="weekPlanCard">
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
  loadTracks().then(loadPlanWeek);
}
function shiftPlanWeek(n){ planWeek=addDays(planWeek,7*n); loadPlanWeek(); }
async function loadPlanWeek(){
  document.getElementById('planWeekLabel').textContent=fmtShort(planWeek)+' – '+fmtShort(addDays(planWeek,6));
  try{
    const d=await api(`/api/workouts?action=blocks&start=${planWeek}&end=${addDays(planWeek,6)}`);
    planBlocks=d.blocks||[];
  }catch(e){ planBlocks=[]; }
  paintPlanGrid();
}
function paintPlanGrid(){
  const host=document.getElementById('weekPlanHost');
  const dows=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  host.innerHTML='<div class="cal-grid">'+[0,1,2,3,4,5,6].map(i=>{
    const ds=addDays(planWeek,i);
    const todays=planBlocks.filter(b=>b.date===ds);
    return `<div class="cal-day ${ds===todayStr()?'today':''}" onclick="pbNewForDay('${ds}')">
      <div class="cd-head">${dows[i]} ${parseDate(ds).getDate()}</div>
      ${todays.map(b=>{
        const col=SPLIT_COLORS[b.workout_type]||'#888';
        return `<div class="cal-wk" style="background:${col}" onclick="event.stopPropagation();pbEdit('${b.id}')">
          ${esc(b.title||'Workout')}
          <span class="cw-status">${b.duration_min? b.duration_min+"' · ":''}${(b.track_ids||[]).map(id=>{
            const t=trackById(id); return t? `<span class="cw-track" style="background:${t.color}">${esc(t.name)}</span>` : '';
          }).join(' ')||'No tracks'}</span>
        </div>`;
      }).join('')}
    </div>`;
  }).join('')+'</div>'+
  (coachTracks.length? '' : '<div class="hint" style="margin-top:10px">Create tracks in Settings and tag your athletes to start group programming.</div>');
}

/* ---------- block editor (reuses #sidePanel) ---------- */
let pb=null;
function pbNewForDay(date){
  pb={ id:null, date, title:'', workout_type:'hyrox', duration_min:60,
       blocks:normalizeBlocks([]), stations:{}, subtypes:[],
       track_ids: coachTracks.map(t=>t.id),      // preselected: all tracks
       excluded_athletes:[] };
  pbOpen();
}
function pbEdit(id){
  const b=planBlocks.find(x=>x.id===id); if(!b) return;
  pb=JSON.parse(JSON.stringify(b));
  pb.blocks=normalizeBlocks(pb.blocks);
  pbOpen();
}
function pbOpen(){
  document.getElementById('spTitle').textContent=(pb.id?'':'New — ')+fmtDay(pb.date);
  const body=document.getElementById('spBody');
  body.innerHTML=`
    <input id="pbTitle" class="text-input" type="text" placeholder="Workout title" value="${esc(pb.title||'')}">
    <div class="pill-row" style="margin-bottom:12px">
      ${['hyrox','endurance','strength'].map(t=>`<button class="pill pb-type ${pb.workout_type===t?'active':''}" data-t="${t}" onclick="pbSetType('${t}')">${t==='hyrox'?'Hyrox / Mix':cap(t)}</button>`).join('')}
    </div>
    <div class="section-sublabel">Tracks — who gets this workout</div>
    <div class="pill-row wrap" id="pbTracks"></div>
    <div class="metric-field" style="max-width:140px;margin:12px 0"><label>Duration min</label>
      <input id="pbDuration" type="number" inputmode="numeric" value="${pb.duration_min??60}"></div>
    <div id="pbBlocks"></div>
    <div class="section-card"><div class="section-label">Station volumes</div>
      <div class="hyrox-grid" id="pbStations"></div></div>
    <div class="sp-actions">
      <button class="btn-slim" onclick="pbSave()">${pb.id?'Save — updates all athletes':'Create for tracks'}</button>
      ${pb.id?'<button class="btn-slim danger" onclick="pbDelete()">Delete block</button>':''}
      <div id="pbMsg" class="save-msg" style="margin:0;text-align:left"></div>
    </div>
    <div class="hint" style="margin-top:8px">Athletes who already marked this workout done keep their version. Individually edited copies stay individual.</div>`;
  pbPaintTracks(); pbPaintBlocks(); pbPaintStations();
  document.getElementById('sidePanel').classList.add('open');
}
function pbSetType(t){
  pb.workout_type=t; pb.subtypes=[];
  document.querySelectorAll('.pb-type').forEach(b=>b.classList.toggle('active',b.dataset.t===t));
  pbPaintBlocks();
}
function pbPaintTracks(){
  document.getElementById('pbTracks').innerHTML=coachTracks.length? coachTracks.map(t=>{
    const on=(pb.track_ids||[]).includes(t.id);
    return `<button class="pill" style="${on?`background:${t.color};color:#fff;border-color:${t.color};`:''}"
      onclick="pbToggleTrack('${t.id}')">${esc(t.name)}</button>`;
  }).join('') : '<div class="hint">No tracks yet — create them in Settings.</div>';
}
function pbToggleTrack(id){
  pb.track_ids=pb.track_ids||[];
  const i=pb.track_ids.indexOf(id);
  if(i>-1) pb.track_ids.splice(i,1); else pb.track_ids.push(id);
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
async function pbSave(){
  const msg=document.getElementById('pbMsg');
  pb.title=document.getElementById('pbTitle').value;
  pb.duration_min=intOrNull(document.getElementById('pbDuration').value);
  if(!(pb.track_ids||[]).length){ msg.textContent='Select at least one track.'; return; }
  msg.textContent='Saving…';
  try{
    const d=await api('/api/workouts',{method:'POST',body:JSON.stringify({ action:'save-block', ...pb })});
    msg.textContent='Saved — assigned to '+d.athletes+' athlete'+(d.athletes===1?'':'s');
    setTimeout(()=>{ document.getElementById('sidePanel').classList.remove('open'); loadPlanWeek(); },900);
  }catch(e){ msg.textContent=e.message; }
}
async function pbDelete(){
  try{
    await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'delete-block',id:pb.id})});
    document.getElementById('sidePanel').classList.remove('open');
    loadPlanWeek();
  }catch(e){}
}
