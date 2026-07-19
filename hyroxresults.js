/* ================================================================
   OCTA. hyroxresults.js — Race results + Race planner (Week 3 Phase 3 v2)
   Requires perf.js (perfTimeSelects/perfReadTime, MONTH_NAMES) loaded first.
   Athlete Stats tab:
   - "Race results" card: paste TrainRox result URL -> import one race;
     list with ★ (exactly one = planner reference); Edit mode per race;
     manual entry fallback.
   - "Race planner" card: Actual (reference race) vs Target vs Delta,
     rows = pace/km (8.7km run+roxzone) + the 8 stations.
   Coach athlete view: both cards read-only.
================================================================ */

const RR_STATIONS = [
  ['ski','Ski erg'], ['sled_push','Sled push'], ['sled_pull','Sled pull'],
  ['burpees','Burpees'], ['row','Row'], ['farmers','Farmers carry'],
  ['lunges','Lunges'], ['wallballs','Wall balls'],
];
const RACE_KM = 8.7;
let myResults=[], myTargets={};

/* ---------- time math ---------- */
function rrSec(v){
  if(!v) return null;
  const p=String(v).split(':').map(Number);
  if(p.some(isNaN)) return null;
  return p.length===3? p[0]*3600+p[1]*60+p[2] : p.length===2? p[0]*60+p[1] : null;
}
function rrFmt(sec){
  if(sec==null) return '—';
  const neg=sec<0; sec=Math.round(Math.abs(sec));
  const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
  const core = h>0? h+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')
                  : m+':'+String(s).padStart(2,'0');
  return (neg?'−':'')+core;
}
function rrDelta(sec){
  if(sec==null) return '';
  if(Math.round(sec)===0) return '0:00';
  return (sec>0?'+':'−')+rrFmt(Math.abs(sec));
}

/* ---------- data ---------- */
async function rrFetchAll(athleteId){
  const q=athleteId?('&athlete_id='+athleteId):'';
  const d=await api('/api/workouts?action=results'+q);
  return d.results||[];
}
function rrReference(results){ return results.find(r=>r.is_reference)||null; }
function rrActualPaceSec(ref){
  const run=rrSec((ref.splits||{}).run_total), rox=rrSec((ref.splits||{}).roxzone);
  if(run==null||rox==null) return null;
  return (run+rox)/RACE_KM;
}

/* ================================================================
   RACE RESULTS CARD
================================================================ */
function rrListHTML(results, editable){
  const sorted=[...results].sort((a,b)=>(b.race_date||b.created_at||'')<(a.race_date||a.created_at||'')?-1:1);
  return `
    ${editable?`
    <div class="rr-import">
      <input id="rrUrl" class="text-input" type="url" placeholder="https://www.trainrox.com/results/…" style="margin-bottom:0">
      <button class="btn-slim" onclick="rrImport()">Import</button>
    </div>
    <div class="hint" style="margin-top:6px">Find your race on trainrox.com and paste the result page URL. ★ marks your planner reference race.</div>
    <div id="rrImportMsg" class="save-msg" style="text-align:left"></div>`:''}
    <div id="rrList">
    ${sorted.length? sorted.map(r=>`
      <div class="race-row">
        ${editable?`<button class="rr-star ${r.is_reference?'on':''}" title="Set as planner reference" onclick="rrSetRef('${r.id}')">★</button>`
                  :(r.is_reference?'<span class="rr-star on" style="cursor:default">★</span>':'<span style="width:26px;display:inline-block"></span>')}
        <div class="race-row-main">
          <div class="race-row-name">${esc(r.race_name||'Race')}</div>
          <div class="race-row-meta">${r.race_date?fmtDay(r.race_date):''}${r.division?' · '+esc(r.division):''} · ${esc(r.total_time||'')}${r.source==='trainrox'?' · TrainRox':''}</div>
        </div>
        ${editable?`<button class="mini-btn" onclick="rrEdit('${r.id}')">Edit</button>
        <button class="mini-btn" onclick="rrDeleteResult('${r.id}')">✕</button>`:''}
      </div>`).join('')
    : '<div class="hint">No race results yet — paste your TrainRox result URL above.</div>'}
    </div>
    ${editable?`<div id="rrForm"></div>
    <button id="rrManualBtn" class="mini-btn" style="margin-top:12px" onclick="rrOpenForm(null)">+ Add result manually</button>`:''}`;
}

function renderRaceResults(){
  const statsContent=document.getElementById('statsContent');
  if(!statsContent) return;
  let host=document.getElementById('rrHost');
  if(!host){
    statsContent.insertAdjacentHTML('afterend',
      '<div class="section-card"><div class="section-label">Race results</div><div id="rrHost"><div class="empty-state">Loading…</div></div></div>'+
      '<div class="section-card"><div class="section-label">Race planner</div><div id="rrPlannerHost"></div></div>');
    host=document.getElementById('rrHost');
  }
  Promise.all([rrFetchAll(), Promise.resolve(profile.race_targets||{})]).then(([rs,tg])=>{
    myResults=rs; myTargets=tg||{};
    host.innerHTML=rrListHTML(myResults,true);
    renderPlanner(true);
  }).catch(e=>{ host.innerHTML='<div class="hint">'+e.message+'</div>'; });
}

function renderCoachRaceResults(athlete){
  const perfCard=document.getElementById('caPerfHost')?.closest('.section-card');
  const anchor=perfCard || document.getElementById('caCalendar')?.closest('.section-card');
  if(!anchor) return;
  let host=document.getElementById('caRrHost');
  if(!host){
    anchor.insertAdjacentHTML('afterend',
      '<div class="section-card"><div class="section-label">Race results</div><div id="caRrHost"><div class="empty-state">Loading…</div></div></div>'+
      '<div class="section-card"><div class="section-label">Race planner</div><div id="caRrPlannerHost"></div></div>');
    host=document.getElementById('caRrHost');
  }
  Promise.all([
    rrFetchAll(athlete.id),
    api(`/api/coach?action=performance&athlete_id=${athlete.id}`).then(d=>(d.performance||{}).race_targets||{}).catch(()=>({}))
  ]).then(([rs,tg])=>{
    host.innerHTML=rrListHTML(rs,false);
    renderPlannerInto('caRrPlannerHost', rs, tg, false);
  }).catch(e=>{ host.innerHTML='<div class="hint">'+e.message+'</div>'; });
}

/* ---------- import ---------- */
async function rrImport(){
  const url=document.getElementById('rrUrl').value.trim();
  const msg=document.getElementById('rrImportMsg');
  if(!url){ msg.textContent='Paste your TrainRox result URL.'; return; }
  msg.textContent='Reading the race…';
  let data;
  try{ data=await api('/api/hyresult?url='+encodeURIComponent(url)); }
  catch(e){ msg.textContent=e.message; return; }
  const r=data.result;
  const dup=myResults.some(x=>x.race_name===r.race_name && x.total_time===r.total_time);
  if(dup){ msg.textContent='This race is already imported.'; return; }
  try{
    const saved=await api('/api/workouts',{method:'POST',body:JSON.stringify({
      action:'save-result', source:'trainrox',
      race_name:r.race_name, race_date:r.race_date, division:r.division,
      total_time:r.total_time, splits:r.splits||{},
      is_reference: myResults.length===0   // first import auto-becomes the reference
    })});
    if(saved.result) myResults.push(saved.result);
    document.getElementById('rrUrl').value='';
    document.getElementById('rrHost').innerHTML=rrListHTML(myResults,true);
    renderPlanner(true);
  }catch(e){ msg.textContent=e.message; }
}

/* ---------- single-star reference ---------- */
async function rrSetRef(id){
  try{
    await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'set-reference',id})});
    myResults.forEach(r=>r.is_reference=(r.id===id));
    document.getElementById('rrHost').innerHTML=rrListHTML(myResults,true);
    renderPlanner(true);
  }catch(e){}
}
async function rrDeleteResult(id){
  try{
    await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'delete-result',id})});
    myResults=myResults.filter(r=>r.id!==id);
    document.getElementById('rrHost').innerHTML=rrListHTML(myResults,true);
    renderPlanner(true);
  }catch(e){}
}

/* ---------- edit / manual form ---------- */
let rrDraft=null;
function rrOpenForm(id){
  const src = id? myResults.find(r=>r.id===id) : null;
  rrDraft = src? JSON.parse(JSON.stringify(src))
    : { id:null, race_name:'', race_date:null, division:null, total_time:null, splits:{} };
  const btn=document.getElementById('rrManualBtn'); if(btn) btn.style.display='none';
  const sp=rrDraft.splits||{};
  document.getElementById('rrForm').innerHTML=`
    <div class="race-form">
      <input id="rrfName" class="text-input" type="text" placeholder="Race name" value="${esc(rrDraft.race_name||'')}">
      <div class="section-sublabel">Date</div>
      ${rrDateSelects('rrfDate', rrDraft.race_date)}
      <input id="rrfDivision" class="text-input" type="text" placeholder="Division (e.g. HYROX PRO MEN)" value="${esc(rrDraft.division||'')}" style="margin-top:12px">
      <div class="section-sublabel">Total time</div>
      ${perfTimeSelects('rrfTotal', rrDraft.total_time, true)}
      <div class="section-sublabel">Running total & Roxzone</div>
      <div class="perf-grid">
        <div class="perf-field"><label>Running total</label>${perfTimeSelects('rrf_run_total', sp.run_total, false)}</div>
        <div class="perf-field"><label>Roxzone</label>${perfTimeSelects('rrf_roxzone', sp.roxzone, false)}</div>
      </div>
      <div class="section-sublabel">Stations</div>
      <div class="perf-grid">
        ${RR_STATIONS.map(([k,label])=>`<div class="perf-field"><label>${label}</label>${perfTimeSelects('rrf_'+k, sp[k], false)}</div>`).join('')}
      </div>
      <div class="sp-actions">
        <button class="btn-slim" onclick="rrSaveForm()">Save result</button>
        <button class="btn-slim secondary" onclick="rrCancelForm()">Cancel</button>
        <div id="rrfMsg" class="save-msg" style="margin:0;text-align:left"></div>
      </div>
    </div>`;
}
function rrEdit(id){ rrOpenForm(id); }
function rrCancelForm(){
  rrDraft=null;
  document.getElementById('rrForm').innerHTML='';
  const btn=document.getElementById('rrManualBtn'); if(btn) btn.style.display='inline-block';
}
function rrDateSelects(idBase, value){
  let d=null,m=null,y=null;
  if(value){ const p=value.split('-'); y=parseInt(p[0]); m=parseInt(p[1]); d=parseInt(p[2]); }
  const dayOpts=Array.from({length:31},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===d?'selected':''}>${n}</option>`).join('');
  const monOpts=MONTH_NAMES.map((n,i)=>`<option value="${i+1}" ${i+1===m?'selected':''}>${n}</option>`).join('');
  const curY=new Date().getFullYear();
  const yearOpts=Array.from({length:8},(_,i)=>curY-i).map(n=>`<option value="${n}" ${n===y?'selected':''}>${n}</option>`).join('');
  return `<div class="dob-selects">
    <select id="${idBase}_d"><option value="">DD</option>${dayOpts}</select>
    <select id="${idBase}_m"><option value="">MM</option>${monOpts}</select>
    <select id="${idBase}_y"><option value="">YYYY</option>${yearOpts}</select>
  </div>`;
}
function rrDateRead(idBase){
  const d=document.getElementById(idBase+'_d').value, m=document.getElementById(idBase+'_m').value, y=document.getElementById(idBase+'_y').value;
  if(!d||!m||!y) return null;
  return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}
async function rrSaveForm(){
  const msg=document.getElementById('rrfMsg');
  rrDraft.race_name=document.getElementById('rrfName').value.trim();
  rrDraft.race_date=rrDateRead('rrfDate');
  rrDraft.division=document.getElementById('rrfDivision').value.trim()||null;
  rrDraft.total_time=perfReadTime('rrfTotal', true);
  const splits={};
  const rt=perfReadTime('rrf_run_total', false); if(rt) splits.run_total=rt;
  const rx=perfReadTime('rrf_roxzone', false); if(rx) splits.roxzone=rx;
  RR_STATIONS.forEach(([k])=>{
    const v=perfReadTime('rrf_'+k, false);
    if(v) splits[k]=v;
  });
  rrDraft.splits=splits;
  if(!rrDraft.race_name || !rrDraft.total_time){ msg.textContent='Race name and total time are required.'; return; }
  msg.textContent='Saving…';
  try{
    if(rrDraft.id){
      await api('/api/workouts',{method:'POST',body:JSON.stringify({
        action:'update-result', id:rrDraft.id,
        race_name:rrDraft.race_name, race_date:rrDraft.race_date, division:rrDraft.division,
        total_time:rrDraft.total_time, splits:rrDraft.splits
      })});
      const i=myResults.findIndex(r=>r.id===rrDraft.id);
      if(i>-1) myResults[i]={...myResults[i], ...rrDraft};
    }else{
      const saved=await api('/api/workouts',{method:'POST',body:JSON.stringify({
        action:'save-result', source:'manual',
        race_name:rrDraft.race_name, race_date:rrDraft.race_date, division:rrDraft.division,
        total_time:rrDraft.total_time, splits:rrDraft.splits,
        is_reference: myResults.length===0
      })});
      if(saved.result) myResults.push(saved.result);
    }
    rrCancelForm();
    document.getElementById('rrHost').innerHTML=rrListHTML(myResults,true);
    renderPlanner(true);
  }catch(e){ msg.textContent=e.message; }
}

/* ================================================================
   RACE PLANNER
================================================================ */
function plannerRows(ref, targets){
  const paceActual=rrActualPaceSec(ref);
  const rows=[];
  rows.push({
    key:'pace', label:'Pace /km · '+RACE_KM+'km run + roxzone',
    actualSec:paceActual, targetSec:rrSec(targets.pace),
    isPace:true
  });
  RR_STATIONS.forEach(([k,label])=>{
    rows.push({ key:k, label,
      actualSec:rrSec((ref.splits||{})[k]), targetSec:rrSec(targets[k]), isPace:false });
  });
  return rows;
}
function plannerTotals(rows){
  let actual=0, target=0, complete=true;
  rows.forEach(r=>{
    const a=r.isPace? (r.actualSec!=null? r.actualSec*RACE_KM : null) : r.actualSec;
    const t=r.isPace? (r.targetSec!=null? r.targetSec*RACE_KM : null) : r.targetSec;
    if(a==null||t==null){ complete=false; return; }
    actual+=a; target+=t;
  });
  return complete? { actual, target, delta: target-actual } : null;
}
function renderPlanner(editable){
  renderPlannerInto('rrPlannerHost', myResults, myTargets, editable);
}
function renderPlannerInto(hostId, results, targets, editable){
  const host=document.getElementById(hostId);
  if(!host) return;
  const ref=rrReference(results);
  if(!ref){
    host.innerHTML='<div class="hint">Import a race and mark it ★ to unlock the planner.</div>';
    return;
  }
  // prefill: any missing target defaults to the actual value
  const tg={...targets};
  const rows=plannerRows(ref, tg);
  let prefilled=false;
  rows.forEach(r=>{
    if(r.targetSec==null && r.actualSec!=null){
      const v=rrFmt(r.isPace? Math.round(r.actualSec) : r.actualSec);
      tg[r.key]=v; r.targetSec=rrSec(v);
      prefilled=true;
    }
  });
  if(editable && prefilled) myTargets=tg;

  const totals=plannerTotals(rows);
  host.innerHTML=`
    <div class="planner-head">
      <div class="planner-ref">${esc(ref.race_name||'Reference race')} · official ${esc(ref.total_time||'')}</div>
    </div>
    <table class="planner-table">
      <tr>
        <th></th>
        <th>Actual<br><b>${totals?rrFmt(totals.actual):'—'}</b></th>
        <th>Target<br><b>${totals?rrFmt(totals.target):'—'}</b></th>
        <th>Delta<br><b class="${totals&&totals.delta<0?'good':totals&&totals.delta>0?'bad':''}">${totals?rrDelta(totals.delta):'—'}</b></th>
      </tr>
      ${rows.map(r=>{
        const deltaSec = (r.actualSec!=null&&r.targetSec!=null)
          ? (r.isPace? (r.targetSec-r.actualSec)*RACE_KM : r.targetSec-r.actualSec) : null;
        return `<tr>
          <td class="pl-label">${r.label}</td>
          <td class="pl-val">${r.actualSec!=null? rrFmt(Math.round(r.actualSec))+(r.isPace?'/km':'') : '—'}</td>
          <td class="pl-val">${editable
            ? plannerTimeSelect(r.key, tg[r.key])
            : (r.targetSec!=null? rrFmt(r.targetSec)+(r.isPace?'/km':'') : '—')}</td>
          <td class="pl-val pl-delta ${deltaSec!=null&&deltaSec<0?'good':deltaSec!=null&&deltaSec>0?'bad':''}">${deltaSec!=null?rrDelta(deltaSec):'—'}</td>
        </tr>`;
      }).join('')}
    </table>
    ${editable?`
    <div class="sp-actions">
      <button class="btn-slim" onclick="plannerSave()">Save targets</button>
      <div id="plannerMsg" class="save-msg" style="margin:0;text-align:left"></div>
    </div>`:''}`;
}
function plannerTimeSelect(key, value){
  let m=0,s=0;
  const sec=rrSec(value);
  if(sec!=null){ m=Math.floor(sec/60); s=Math.round(sec%60); }
  const mOpts=Array.from({length:60},(_,i)=>`<option value="${i}" ${i===m?'selected':''}>${i}</option>`).join('');
  const sOpts=Array.from({length:60},(_,i)=>`<option value="${i}" ${i===s?'selected':''}>${String(i).padStart(2,'0')}</option>`).join('');
  return `<span class="pl-time"><select id="plt_${key}_m" onchange="plannerChange()">${mOpts}</select>:<select id="plt_${key}_s" onchange="plannerChange()">${sOpts}</select></span>`;
}
function plannerChange(){
  ['pace'].concat(RR_STATIONS.map(([k])=>k)).forEach(k=>{
    const mEl=document.getElementById('plt_'+k+'_m');
    if(!mEl) return;
    const m=parseInt(mEl.value)||0, s=parseInt(document.getElementById('plt_'+k+'_s').value)||0;
    myTargets[k]=m+':'+String(s).padStart(2,'0');
  });
  renderPlanner(true);
}
async function plannerSave(){
  const msg=document.getElementById('plannerMsg');
  msg.textContent='Saving…';
  try{
    await api('/api/profile',{method:'PUT',body:JSON.stringify({ race_targets: myTargets })});
    profile.race_targets=myTargets;
    msg.textContent='Targets saved';
    setTimeout(()=>{ const m=document.getElementById('plannerMsg'); if(m) m.textContent=''; },2000);
  }catch(e){ msg.textContent=e.message; }
}
