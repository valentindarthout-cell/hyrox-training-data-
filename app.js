/* ================================================================
   HYROX TRAINING DATA — v2 app.js
   Tabs: Log · Stats · Share · Settings
================================================================ */

/* ---------------- constants ---------------- */
const PHASES = ['Base','Build','Peak','Taper','General prep','Race'];
const DIVISIONS = ['Solo Pro','Solo Open','Pro Doubles','Open Doubles','Mixed Doubles'];
const ENDURANCE_MODS = ['Run','Echo bike','Bike outdoor','Bike indoor','Ski erg','Row erg','Stair Stepper','Treadmill','Elliptical'];
const HYROX_FOCUSES = ['Simulation','Station work','Compromised run','Sled work','Erg work','Technique','Strength endurance'];
const STRENGTH_FOCUSES = ['Full body','Lower body','Upper body','Strength endurance','Wall balls','Sled push','Sled pull','Grip work','Farmers carry','Core','Burpees'];
const ZONE_COLORS = ['#60a5fa','#34d399','#fbbf24','#f97316','#ef4444'];
const SPLIT_COLORS = {endurance:'#60a5fa',hyrox:'#fbbf24',strength:'#ef4444'};
const STATIONS = [
  {k:'ski_erg_m',   label:'Ski erg',    unit:'m'},
  {k:'sled_push_m', label:'Sled push',  unit:'m'},
  {k:'sled_pull_m', label:'Sled pull',  unit:'m'},
  {k:'burpees_reps',label:'Burpees',    unit:'reps'},
  {k:'row_erg_m',   label:'Row erg',    unit:'m'},
  {k:'farmers_m',   label:'Farmers',    unit:'m'},
  {k:'lunges_m',    label:'Lunges',     unit:'m'},
  {k:'wallballs_reps',label:'Wall balls',unit:'reps'},
];

/* ---------------- state ---------------- */
let profile = null;
let selectedDate = todayStr();
let weekStart = mondayOf(selectedDate);
let daySessions = [];                 // session objects for selected date
let dayPhys = {};                     // physiology for selected date
let datesWithData = new Set();
let lastPhys = null;                  // most recent physiology (for prefill)
let importTarget = null;              // session index awaiting AI import
let statsPeriod = 'week';
let statsAnchor = todayStr();
let sharePeriod = 'day';
let shareAnchor = todayStr();
let shareData = null;
let shareToggles = {};

/* ---------------- date helpers ---------------- */
function todayStr(){ const d=new Date(); return isoDate(d); }
function isoDate(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function parseDate(s){ const p=s.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
function addDays(s,n){ const d=parseDate(s); d.setDate(d.getDate()+n); return isoDate(d); }
function mondayOf(s){ const d=parseDate(s); const dow=(d.getDay()+6)%7; d.setDate(d.getDate()-dow); return isoDate(d); }
function fmtDay(s){ const d=parseDate(s); return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}).toUpperCase(); }
function fmtShort(s){ const d=parseDate(s); return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}); }
function daysUntil(s){ const ms=parseDate(s)-parseDate(todayStr()); return Math.round(ms/86400000); }

/* ---------------- api helper ---------------- */
async function api(path, opts){
  opts = opts || {};
  opts.headers = Object.assign({'Content-Type':'application/json','Authorization':'Bearer '+getToken()}, opts.headers||{});
  const res = await fetch(path, opts);
  if(res.status===401){ logout(); throw new Error('unauthorized'); }
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||'Request failed');
  return data;
}

/* ================================================================
   BOOT
================================================================ */
async function enterApp(){
  document.getElementById('authScreen').style.display='none';
  document.getElementById('app').style.display='block';
  buildSettingsPills();
  try{
    const p = await api('/api/profile');
    profile = p.profile || {};
    if(p.body){ profile._weight=p.body.weight_kg; profile._height=p.body.height_cm; }
    fillSettings();
  }catch(e){ profile = {}; }
  await loadDay(selectedDate);
  await refreshWeekDots();
  checkStravaStatus();
  loadTrailing();          // streak + level (last 84 days)
  maybeStartWizard();
}
if(getToken()) enterApp();

/* ================================================================
   TAB NAV
================================================================ */
function switchTab(tab){
  ['log','stats','share','settings'].forEach(t=>{
    document.getElementById('view'+cap(t)).style.display = t===tab?'block':'none';
    document.getElementById('nav'+cap(t)).classList.toggle('active', t===tab);
  });
  if(tab==='stats') loadStats();
  if(tab==='share') loadShare();
  if(tab==='settings') maybeAutoFillZones();
}
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

/* ================================================================
   WEEK STRIP
================================================================ */
function renderWeekStrip(){
  const strip = document.getElementById('weekStrip');
  const monthEl = document.getElementById('stripMonth');
  const mid = addDays(weekStart,3);
  monthEl.textContent = parseDate(mid).toLocaleDateString('en-GB',{month:'short',year:'numeric'}).toUpperCase();
  let html='';
  const dows=['M','T','W','T','F','S','S'];
  for(let i=0;i<7;i++){
    const ds=addDays(weekStart,i);
    const cls=['ws-day'];
    if(ds===selectedDate) cls.push('selected');
    if(ds===todayStr()) cls.push('today');
    if(datesWithData.has(ds)) cls.push('has-data');
    html+=`<div class="${cls.join(' ')}" onclick="selectDay('${ds}')">
      <div class="ws-dow">${dows[i]}</div>
      <div class="ws-num">${parseDate(ds).getDate()}</div>
      <div class="ws-dot"></div></div>`;
  }
  strip.innerHTML=html;
}
function shiftWeek(n){ weekStart=addDays(weekStart,7*n); renderWeekStrip(); refreshWeekDots(); }
function goToday(){ selectDay(todayStr()); }
async function selectDay(ds){
  selectedDate=ds; weekStart=mondayOf(ds);
  await loadDay(ds); refreshWeekDots();
}
async function refreshWeekDots(){
  try{
    const d = await api(`/api/get-data?start=${weekStart}&end=${addDays(weekStart,6)}`);
    (d.sessions||[]).forEach(s=>datesWithData.add(s.session_date));
    (d.physiology||[]).forEach(p=>datesWithData.add(p.day));
  }catch(e){}
  renderWeekStrip();
}

/* ================================================================
   DAY LOAD / SESSION EDITOR
================================================================ */
function blankSession(){
  return {name:'',workout_type:'endurance',subtypes:[],duration_min:'',volume:'',pace:'',
    avg_hr:'',kcal:'',rpe:'',workout_desc:'',zones:[0,0,0,0,0],
    stations:{}, compromised_run_km:''};
}

async function loadDay(ds){
  renderWeekStrip();
  daySessions=[]; dayPhys={};
  try{
    const d = await api(`/api/get-data?start=${ds}&end=${ds}`);
    (d.sessions||[]).sort((a,b)=>a.session_index-b.session_index).forEach(row=>{
      daySessions.push({
        name:row.name||'', workout_type:row.workout_type||'endurance',
        subtypes:row.subtypes||[], duration_min:row.duration_min??'',
        volume:row.volume??'', pace:row.pace||'', avg_hr:row.avg_hr??'',
        kcal:row.kcal??'', rpe:row.rpe??'', workout_desc:row.workout_desc||'',
        zones:[row.zone1||0,row.zone2||0,row.zone3||0,row.zone4||0,row.zone5||0],
        stations:{ski_erg_m:row.ski_erg_m??'',sled_push_m:row.sled_push_m??'',sled_pull_m:row.sled_pull_m??'',
          burpees_reps:row.burpees_reps??'',row_erg_m:row.row_erg_m??'',farmers_m:row.farmers_m??'',
          lunges_m:row.lunges_m??'',wallballs_reps:row.wallballs_reps??''},
        compromised_run_km:row.compromised_run_km??'',
        strava_id:row.strava_id||null
      });
    });
    dayPhys = (d.physiology||[])[0] || {};
    if(d.lastPhysiology) lastPhys = d.lastPhysiology;
  }catch(e){}
  if(daySessions.length===0) daySessions=[blankSession()];
  renderSessions();
  fillPhysiology();
}

function addSession(){
  if(daySessions.length>=3) return;
  daySessions.push(blankSession());
  renderSessions();
}
function removeSession(i){
  daySessions.splice(i,1);
  if(daySessions.length===0) daySessions=[blankSession()];
  renderSessions();
}

function renderSessions(){
  const wrap=document.getElementById('sessionsWrap');
  wrap.innerHTML = daySessions.map((s,i)=>sessionHTML(s,i)).join('');
  document.getElementById('addSessionBtn').style.display = daySessions.length<3?'block':'none';
  daySessions.forEach((s,i)=>{ autoPace(i); updateZoneUI(i); maybeAutoRpe(i); });
  updateSaveState();
}

function sessionHTML(s,i){
  const flags=modalityFlags(s);
  let subOptions=[], subLabel='Modality', multi=false;
  if(s.workout_type==='endurance'){ subOptions=ENDURANCE_MODS; }
  else if(s.workout_type==='hyrox'){ subOptions=HYROX_FOCUSES; subLabel='Focus'; multi=true; }
  else { subOptions=STRENGTH_FOCUSES; subLabel='Focus'; multi=true; }

  const volUnit = flags.isStair?'steps':'km';
  const paceInfo = paceMeta(flags);

  let metricFields = `
    <div class="metric-field"><label>Duration min</label>
      <input type="number" inputmode="numeric" value="${esc(s.duration_min)}" oninput="upd(${i},'duration_min',this.value)"></div>`;
  if(s.workout_type==='endurance'){
    metricFields += `
    <div class="metric-field"><label>Volume ${volUnit}</label>
      <input type="number" inputmode="decimal" step="0.01" value="${esc(s.volume)}" oninput="upd(${i},'volume',this.value)"></div>
    <div class="metric-field"><label>${paceInfo.label}</label>
      <input id="pace_${i}" type="text" inputmode="${paceInfo.manual?'numeric':'text'}" value="${esc(s.pace)}"
        ${paceInfo.manual?`oninput="upd(${i},'pace',this.value)"`:'readonly'} placeholder="${paceInfo.ph}"></div>`;
  }
  metricFields += `
    <div class="metric-field"><label>Avg HR bpm</label>
      <input type="number" inputmode="numeric" value="${esc(s.avg_hr)}" oninput="upd(${i},'avg_hr',this.value)"></div>
    <div class="metric-field"><label>Active kcal</label>
      <input type="number" inputmode="numeric" value="${esc(s.kcal)}" oninput="upd(${i},'kcal',this.value)"></div>
    <div class="metric-field"><label>RPE /10</label>
      <input id="rpe_${i}" class="${s._rpeAuto?'rpe-auto':''}" type="number" inputmode="numeric" min="1" max="10" value="${esc(s.rpe)}" oninput="upd(${i},'rpe',this.value)"></div>`;

  let hyroxBlock='';
  if(s.workout_type==='hyrox'){
    hyroxBlock = `<div class="section-sublabel">Stations</div><div class="hyrox-grid">`+
      STATIONS.map(st=>`
        <div class="metric-field"><label>${st.label} ${st.unit}</label>
          <input type="number" inputmode="numeric" value="${esc(s.stations[st.k])}" oninput="updStation(${i},'${st.k}',this.value)"></div>`).join('')+
      `<div class="metric-field"><label>Compromised run km</label>
        <input type="number" inputmode="decimal" step="0.1" value="${esc(s.compromised_run_km)}" oninput="upd(${i},'compromised_run_km',this.value)"></div>
      </div>`;
  }

  const zoneRows=[0,1,2,3,4].map(z=>`
    <div class="zone-row">
      <div class="zone-tag" style="color:${ZONE_COLORS[z]}">Z${z+1}</div>
      <div class="zone-bar-track"><div id="zfill_${i}_${z}" class="zone-bar-fill z${z+1}"></div></div>
      <div class="zone-stepper">
        <button onclick="stepZone(${i},${z},-5)">−</button>
        <span id="zval_${i}_${z}">${s.zones[z]}%</span>
        <button onclick="stepZone(${i},${z},5)">+</button>
      </div>
    </div>`).join('');

  return `<div class="section-card" id="session_${i}">
    <div class="session-head">
      <div class="session-title">Session ${i+1}</div>
      <div class="session-actions">
        <button class="mini-btn" onclick="startImport(${i})">AI import</button>
        <button class="mini-btn" onclick="openPasteModal(${i})">Paste</button>
        <button class="mini-btn" onclick="openStravaModal(${i})">Strava</button>
        ${daySessions.length>1?`<button class="mini-btn" onclick="removeSession(${i})">Remove</button>`:''}
      </div>
    </div>
    <input class="text-input" type="text" placeholder="Session name" value="${esc(s.name)}" oninput="upd(${i},'name',this.value)">
    <div class="section-sublabel">Type</div>
    <div class="pill-row">
      ${['endurance','hyrox','strength'].map(t=>`<button class="pill ${s.workout_type===t?'active':''}" onclick="setType(${i},'${t}')">${t==='hyrox'?'Hyrox / Mix':cap(t)}</button>`).join('')}
    </div>
    <div class="section-sublabel">${subLabel}</div>
    <div class="pill-row wrap">
      ${subOptions.map(o=>`<button class="pill ${s.subtypes.includes(o)?'active':''}" onclick="toggleSub(${i},'${o.replace(/'/g,"\\'")}',${multi})">${o}</button>`).join('')}
    </div>
    <div class="metric-grid">${metricFields}</div>
    ${hyroxBlock}
    <textarea id="desc_${i}" class="text-input" style="margin-top:12px" placeholder="Workout description (optional)" oninput="upd(${i},'workout_desc',this.value)">${esc(s.workout_desc)}</textarea>
    ${s.workout_type==='hyrox'?`<button class="mini-btn" style="margin-top:8px" onclick="extractFromText(${i})">Extract stations from text</button>`:''}
    <div class="zones-block">
      <div class="section-sublabel">HR zones (optional)</div>
      ${zoneRows}
      <span id="ztotal_${i}" class="zone-total">0%</span>
    </div>
  </div>`;
}

function esc(v){ return v===null||v===undefined?'':String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function upd(i,k,v){
  daySessions[i][k]=v;
  if(['duration_min','volume'].includes(k)) autoPace(i);
  if(k==='rpe'){
    daySessions[i]._rpeAuto=false;
    const el=document.getElementById('rpe_'+i); if(el) el.classList.remove('rpe-auto');
  }
}
function updStation(i,k,v){ daySessions[i].stations[k]=v; }
function setType(i,t){ const s=daySessions[i]; s.workout_type=t; s.subtypes=[]; s.pace=''; renderSessions(); }
function toggleSub(i,o,multi){
  const s=daySessions[i];
  if(multi){
    const idx=s.subtypes.indexOf(o);
    if(idx>-1) s.subtypes.splice(idx,1); else s.subtypes.push(o);
  }else{
    s.subtypes = s.subtypes[0]===o ? [] : [o];
    s.pace='';
  }
  renderSessions();
}

/* --------- modality + pace --------- */
function modalityFlags(s){
  const subs=s.subtypes||[];
  return {
    isBike:subs.some(x=>['Bike outdoor','Bike indoor'].includes(x)),
    isEchoBike:subs.includes('Echo bike'),
    isErg:subs.some(x=>['Ski erg','Row erg'].includes(x)),
    isStair:subs.includes('Stair Stepper'),
    isRun:subs.some(x=>['Run','Treadmill'].includes(x)),
    isElliptical:subs.includes('Elliptical'),
  };
}
function paceMeta(f){
  if(f.isEchoBike||f.isElliptical) return {label:'Watts',ph:'e.g. 210',manual:true,unit:'watts'};
  if(f.isErg) return {label:'Pace /500m',ph:'auto',manual:false,unit:'/500m'};
  if(f.isBike) return {label:'Pace /km',ph:'auto',manual:false,unit:'/km'};
  if(f.isStair) return {label:'Steps/min',ph:'auto',manual:false,unit:'steps/min'};
  return {label:'Pace min/km',ph:'auto',manual:false,unit:'min/km'};
}
function autoPace(i){
  const s=daySessions[i]; if(s.workout_type!=='endurance') return;
  const f=modalityFlags(s); const meta=paceMeta(f);
  if(meta.manual) return;
  const dur=parseFloat(s.duration_min), vol=parseFloat(s.volume);
  let out='';
  if(dur>0 && vol>0){
    if(f.isStair){ out=Math.round(vol/dur)+''; }
    else if(f.isErg){
      const secPer500 = (dur*60)/((vol*1000)/500);
      if(secPer500>=60 && secPer500<180) out=mmss(secPer500);
    }else{
      out=mmss((dur/vol)*60);
    }
  }
  s.pace=out;
  const el=document.getElementById('pace_'+i);
  if(el && !meta.manual) el.value=out;
}
function mmss(totalSec){
  const m=Math.floor(totalSec/60), s=Math.round(totalSec%60);
  return m+':'+String(s===60?0:s).padStart(2,'0');
}

/* --------- zones --------- */
function stepZone(i,z,delta){
  const s=daySessions[i];
  s.zones[z]=Math.max(0,Math.min(100,(s.zones[z]||0)+delta));
  updateZoneUI(i); maybeAutoRpe(i); updateSaveState();
}
/* RPE = weighted zone intensity: (Z1·2 + Z2·4 + Z3·6 + Z4·8 + Z5·10)/100
   Overrides: Z5 ≥ 10% → min 9 · Z4+Z5 ≥ 40% → min 7 · floor 3.
   Fills only when zones total 100% and RPE is empty or was auto-set. */
function autoRpeFromZones(z){
  if(z.reduce((a,b)=>a+b,0)!==100) return null;
  let r=Math.round((z[0]*2+z[1]*4+z[2]*6+z[3]*8+z[4]*10)/100);
  if(z[4]>=10) r=Math.max(r,9);
  else if(z[3]+z[4]>=40) r=Math.max(r,7);
  return Math.min(Math.max(r,3),10);
}
function maybeAutoRpe(i){
  const s=daySessions[i];
  const wasManual = s.rpe!=='' && s.rpe!=null && !s._rpeAuto;
  if(wasManual) return;
  const auto=autoRpeFromZones(s.zones);
  const el=document.getElementById('rpe_'+i);
  if(auto!=null){
    s.rpe=auto; s._rpeAuto=true;
    if(el){ el.value=auto; el.classList.add('rpe-auto'); }
  }else if(s._rpeAuto){
    s.rpe=''; s._rpeAuto=false;
    if(el){ el.value=''; el.classList.remove('rpe-auto'); }
  }
}
function updateZoneUI(i){
  const s=daySessions[i];
  const total=s.zones.reduce((a,b)=>a+b,0);
  s.zones.forEach((v,z)=>{
    const fill=document.getElementById(`zfill_${i}_${z}`);
    const val=document.getElementById(`zval_${i}_${z}`);
    if(fill) fill.style.width=v+'%';
    if(val) val.textContent=v+'%';
  });
  const t=document.getElementById('ztotal_'+i);
  if(t){ t.textContent=total+'%'; t.className='zone-total'+(total===100?' ok':(total>100?' over':'')); }
}
function zonesValid(s){
  const total=s.zones.reduce((a,b)=>a+b,0);
  return total===0 || total===100;
}

/* ================================================================
   PHYSIOLOGY
================================================================ */
function fillPhysiology(){
  const src = Object.keys(dayPhys).length && dayPhys.day ? dayPhys : (lastPhys||{});
  const isPrefill = !(dayPhys && dayPhys.day);
  document.getElementById('sleepVal').textContent = src.sleep_hours!=null?Number(src.sleep_hours).toFixed(1):'7.5';
  setReadiness(isPrefill ? null : (src.readiness||null), true);
  document.getElementById('hrvInput').value = isPrefill?'':(src.hrv??'');
  document.getElementById('rhrInput').value = src.resting_hr??'';
  document.getElementById('kcalIntake').value = src.kcal_intake??'';
  document.getElementById('mP').value = src.protein_pct??'';
  document.getElementById('mC').value = src.carbs_pct??'';
  document.getElementById('mF').value = src.fat_pct??'';
  onHrvInput(); renderMacroGrams();
}
function stepSleep(d){
  const el=document.getElementById('sleepVal');
  let v=parseFloat(el.textContent)||7.5;
  v=Math.max(0,Math.min(14,v+d));
  el.textContent=v.toFixed(1);
}
let readinessVal=null;
function setReadiness(v,silent){
  readinessVal=v;
  document.querySelectorAll('#readinessPills .pill').forEach(p=>p.classList.toggle('active',p.dataset.v===v));
}
function onHrvInput(){
  const v=parseInt(document.getElementById('hrvInput').value);
  const el=document.getElementById('hrvStatus');
  if(!v||!profile||profile.hrv_low==null||profile.hrv_high==null){ el.textContent=''; el.className='hrv-status'; return; }
  const ok=v>=profile.hrv_low && v<=profile.hrv_high;
  el.textContent = ok?'Balanced':'Unbalanced';
  el.className = 'hrv-status '+(ok?'balanced':'unbalanced');
}
function macroPcts(){
  return [parseInt(document.getElementById('mP').value)||0,
          parseInt(document.getElementById('mC').value)||0,
          parseInt(document.getElementById('mF').value)||0];
}
function renderMacroGrams(){
  const kcal=parseInt(document.getElementById('kcalIntake').value)||0;
  const [p,c,f]=macroPcts();
  const sum=p+c+f;
  const g=document.getElementById('macroGrams'), w=document.getElementById('macroWarn');
  if(kcal>0 && sum>0){
    g.textContent=`≈ P ${Math.round(kcal*p/100/4)} g · C ${Math.round(kcal*c/100/4)} g · F ${Math.round(kcal*f/100/9)} g`;
  }else g.textContent='';
  w.textContent = (sum>0 && sum!==100)?`Macros total ${sum}% — must equal 100%`:'';
  updateSaveState();
}
function updateSaveState(){
  const zonesOK = daySessions.every(zonesValid);
  const [p,c,f]=macroPcts(); const msum=p+c+f;
  const macrosOK = msum===0||msum===100;
  const btn=document.getElementById('saveDayBtn');
  btn.disabled = !(zonesOK && macrosOK);
}

/* ================================================================
   SAVE DAY
================================================================ */
async function saveDay(){
  const msg=document.getElementById('saveMsg');
  msg.textContent='Saving…';
  const [p,c,f]=macroPcts();
  const kcal=parseInt(document.getElementById('kcalIntake').value)||null;
  const body={
    date:selectedDate,
    sessions: daySessions.filter(s=>s.name||s.duration_min||s.volume).map((s,idx)=>({
      session_index:idx+1, name:s.name||null, workout_type:s.workout_type,
      subtypes:s.subtypes, duration_min:intOrNull(s.duration_min),
      volume:numOrNull(s.volume), volume_unit:modalityFlags(s).isStair?'steps':'km',
      pace:s.pace||null, pace_unit:paceMeta(modalityFlags(s)).unit,
      avg_hr:intOrNull(s.avg_hr), kcal:intOrNull(s.kcal), rpe:intOrNull(s.rpe),
      workout_desc:s.workout_desc||null,
      zone1:s.zones[0]||null, zone2:s.zones[1]||null, zone3:s.zones[2]||null,
      zone4:s.zones[3]||null, zone5:s.zones[4]||null,
      ski_erg_m:intOrNull(s.stations.ski_erg_m), sled_push_m:intOrNull(s.stations.sled_push_m),
      sled_pull_m:intOrNull(s.stations.sled_pull_m), burpees_reps:intOrNull(s.stations.burpees_reps),
      row_erg_m:intOrNull(s.stations.row_erg_m), farmers_m:intOrNull(s.stations.farmers_m),
      lunges_m:intOrNull(s.stations.lunges_m), wallballs_reps:intOrNull(s.stations.wallballs_reps),
      compromised_run_km:numOrNull(s.compromised_run_km),
      strava_id:s.strava_id||null
    })),
    physiology:{
      sleep_hours:parseFloat(document.getElementById('sleepVal').textContent)||null,
      readiness:readinessVal,
      hrv:intOrNull(document.getElementById('hrvInput').value),
      resting_hr:intOrNull(document.getElementById('rhrInput').value),
      kcal_intake:kcal, protein_pct:p||null, carbs_pct:c||null, fat_pct:f||null
    }
  };
  try{
    await api('/api/save-day',{method:'POST',body:JSON.stringify(body)});
    msg.textContent='Saved';
    datesWithData.add(selectedDate);
    lastPhys = Object.assign({}, body.physiology);
    renderWeekStrip();
    setTimeout(()=>msg.textContent='',2000);
  }catch(e){ msg.textContent='Could not save — '+e.message; }
}
function intOrNull(v){ const n=parseInt(v); return isNaN(n)?null:n; }
function numOrNull(v){ const n=parseFloat(v); return isNaN(n)?null:n; }

/* ================================================================
   AI IMPORT
================================================================ */
function startImport(i){ importTarget=i; document.getElementById('importFile').click(); }
async function handleImportFile(ev){
  const file=ev.target.files[0]; ev.target.value='';
  if(!file||importTarget==null) return;
  const i=importTarget;
  const msg=document.getElementById('saveMsg');
  msg.textContent='Reading screenshot…';
  const b64=await new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result.split(',')[1]);
    r.onerror=rej; r.readAsDataURL(file);
  });
  try{
    const data=await api('/api/ai',{method:'POST',body:JSON.stringify({mode:'screenshot',
      image:b64, media_type:file.type||'image/png', workout_type:daySessions[i].workout_type
    })});
    const s=daySessions[i], x=data.extracted||{};
    if(x.name) s.name=x.name;
    if(x.duration_min!=null) s.duration_min=x.duration_min;
    if(x.distance_km!=null) s.volume=x.distance_km;
    if(x.avg_hr!=null) s.avg_hr=x.avg_hr;
    if(x.calories!=null) s.kcal=x.calories;
    if(x.workout_description) s.workout_desc=x.workout_description;
    if(Array.isArray(x.zones)&&x.zones.length===5){
      let z=x.zones.map(v=>Math.round((v||0)/5)*5);
      let diff=100-z.reduce((a,b)=>a+b,0);
      if(Math.abs(diff)<=15){ const mi=z.indexOf(Math.max(...z)); z[mi]+=diff; }
      if(z.reduce((a,b)=>a+b,0)===100) s.zones=z;
    }
    if(s.workout_type==='hyrox'){
      const map={ski_erg_m:'ski_erg_m',sled_push_m:'sled_push_m',sled_pull_m:'sled_pull_m',
        burpees_reps:'burpees_reps',row_erg_m:'row_erg_m',farmers_m:'farmers_m',
        lunges_m:'lunges_m',wallballs_reps:'wallballs_reps'};
      Object.keys(map).forEach(k=>{ if(x[k]!=null) s.stations[k]=x[k]; });
      if(x.compromised_run_km!=null) s.compromised_run_km=x.compromised_run_km;
    }
    renderSessions();
    msg.textContent='Imported — review and adjust';
    setTimeout(()=>msg.textContent='',2500);
  }catch(e){ msg.textContent='Import failed — '+e.message; }
  importTarget=null;
}

/* ================================================================
   STRAVA
================================================================ */
async function checkStravaStatus(){
  const el=document.getElementById('stravaStatus'), btn=document.getElementById('stravaBtn');
  if(!el) return;
  try{
    const d=await api('/api/strava?action=status');
    if(d.connected){ el.textContent='Strava connected'; btn.textContent='Reconnect Strava'; }
    else { el.textContent='Not connected'; btn.textContent='Connect Strava'; }
  }catch(e){ el.textContent=''; }
}
function connectStrava(){
  window.location.href = '/api/strava-connect?token='+encodeURIComponent(getToken());
}
async function bulkImport(days){
  const msg=document.getElementById('bulkMsg');
  msg.textContent=`Importing last ${days} days from Strava…`;
  try{
    const d=await api('/api/strava?action=bulk&days='+days);
    if(d.message){ msg.textContent=d.message; }
    else{
      msg.textContent=`Imported ${d.imported} session${d.imported===1?'':'s'}`+
        (d.skipped?` · ${d.skipped} skipped (already imported or day full)`:'');
    }
    datesWithData.clear();
    await loadDay(selectedDate);
    await refreshWeekDots();
  }catch(e){ msg.textContent='Import failed — '+e.message; }
}
async function fetchStravaZones(){
  const msg=document.getElementById('zonesMsg');
  msg.textContent='Fetching from Strava…';
  try{
    const d=await api('/api/strava?action=zones');
    const b=d.boundaries||{};
    if(b.hr_z1_max!=null) document.getElementById('hrz1').value=b.hr_z1_max;
    if(b.hr_z2_max!=null) document.getElementById('hrz2').value=b.hr_z2_max;
    if(b.hr_z3_max!=null) document.getElementById('hrz3').value=b.hr_z3_max;
    if(b.hr_z4_max!=null) document.getElementById('hrz4').value=b.hr_z4_max;
    msg.textContent='Filled from Strava — review and save';
    setTimeout(()=>msg.textContent='',3000);
  }catch(e){ msg.textContent=e.message; }
}
let autoZoneAttempted=false;
async function maybeAutoFillZones(){
  if(autoZoneAttempted) return;
  const allEmpty = ['hrz1','hrz2','hrz3','hrz4'].every(id=>!document.getElementById(id).value);
  if(!allEmpty) return;
  autoZoneAttempted=true;
  try{
    const st=await api('/api/strava?action=status');
    if(!st.connected) return;
    await fetchStravaZones();
  }catch(e){}
}
(function checkStravaRedirect(){
  const p=new URLSearchParams(location.search);
  if(p.has('strava')){
    history.replaceState({},'',location.pathname);
  }
})();

let stravaTarget=null;
async function openStravaModal(i){
  stravaTarget=i;
  const modal=document.getElementById('stravaModal'), list=document.getElementById('stravaList');
  modal.style.display='flex';
  list.innerHTML='<div class="empty-state">Loading activities…</div>';
  try{
    const d=await api('/api/strava?action=list');
    if(!d.activities||!d.activities.length){ list.innerHTML='<div class="empty-state">No recent Strava activities. Connect Strava in Settings first.</div>'; return; }
    list.innerHTML=d.activities.map(a=>`
      <div class="strava-item">
        <div class="strava-item-main">
          <div class="strava-item-name">${esc(a.name)}</div>
          <div class="strava-item-meta">${a.type} · ${fmtShort((a.date||'').slice(0,10))} · ${a.distance_km?a.distance_km+' km · ':''}${a.duration_min?a.duration_min+' min':''}</div>
        </div>
        <button class="mini-btn" onclick="importStravaActivity(${a.id})">Import</button>
      </div>`).join('');
  }catch(e){ list.innerHTML=`<div class="empty-state">${e.message}</div>`; }
}
function closeStravaModal(){ document.getElementById('stravaModal').style.display='none'; stravaTarget=null; }
async function importStravaActivity(id){
  if(stravaTarget==null) return;
  const list=document.getElementById('stravaList');
  list.innerHTML='<div class="empty-state">Importing…</div>';
  try{
    const d=await api('/api/strava?action=detail&id='+id);
    const x=d.session||{}, s=daySessions[stravaTarget];
    s.workout_type='endurance';
    if(x.subtypes&&x.subtypes.length) s.subtypes=x.subtypes;
    if(x.name) s.name=x.name;
    if(x.duration_min!=null) s.duration_min=x.duration_min;
    if(x.distance_km!=null) s.volume=x.distance_km;
    if(x.avg_hr!=null) s.avg_hr=x.avg_hr;
    if(x.calories!=null) s.kcal=x.calories;
    if(x.workout_description) s.workout_desc=x.workout_description;
    if(Array.isArray(x.zones) && x.zones.length===5 && x.zones.reduce((a,b)=>a+b,0)===100){
      s.zones = x.zones;
    }
    if(x.session_date && x.session_date!==selectedDate){
      // activity is from a different day than the one currently open — still fill it in, athlete can re-save on the right day
    }
    renderSessions();
    closeStravaModal();
    const msg=document.getElementById('saveMsg');
    msg.textContent='Imported from Strava — review and adjust'; setTimeout(()=>msg.textContent='',2500);
  }catch(e){ list.innerHTML=`<div class="empty-state">${e.message}</div>`; }
}

/* ================================================================
   HYROX TEXT EXTRACTION
================================================================ */
async function extractFromText(i){
  const text=(document.getElementById('desc_'+i)||{}).value || daySessions[i].workout_desc;
  if(!text||!text.trim()){ return; }
  const msg=document.getElementById('saveMsg');
  msg.textContent='Reading workout text…';
  try{
    const d=await api('/api/ai',{method:'POST',body:JSON.stringify({mode:'text',text})});
    const x=d.extracted||{}, s=daySessions[i];
    const map=['ski_erg_m','sled_push_m','sled_pull_m','burpees_reps','row_erg_m','farmers_m','lunges_m','wallballs_reps'];
    map.forEach(k=>{ if(x[k]!=null) s.stations[k]=x[k]; });
    if(x.compromised_run_km!=null) s.compromised_run_km=x.compromised_run_km;
    renderSessions();
    msg.textContent='Stations filled — review and adjust'; setTimeout(()=>msg.textContent='',2500);
  }catch(e){ msg.textContent='Could not read the text — '+e.message; }
}

/* ================================================================
   ONBOARDING WIZARD
================================================================ */
function maybeStartWizard(){
  const p=new URLSearchParams(location.search);
  const resuming = localStorage.getItem('htd_wiz')==='1' && p.get('strava')==='connected';
  if(resuming){
    history.replaceState({},'',location.pathname);
    showWizard(); wizGoto(2); wizRunImport();
    return;
  }
  if(profile && profile.onboarded===false) { showWizard(); wizGoto(1); }
}
function showWizard(){
  document.getElementById('wizard').style.display='flex';
  const pills=document.getElementById('wizTargetPills');
  if(!pills.innerHTML){
    pills.innerHTML=[3,4,5,6].map(n=>`<button class="pill ${n===4?'active':''}" data-n="${n}" onclick="wizPickTarget(${n})">${n} days</button>`).join('');
  }
}
let wizTarget=4;
function wizPickTarget(n){
  wizTarget=n;
  document.querySelectorAll('#wizTargetPills .pill').forEach(b=>b.classList.toggle('active',+b.dataset.n===n));
}
function wizGoto(n){
  [1,2,3].forEach(i=>document.getElementById('wizStep'+i).style.display=i===n?'block':'none');
}
function wizConnectStrava(){
  localStorage.setItem('htd_wiz','1');
  connectStrava();
}
async function wizRunImport(){
  const bar=document.getElementById('wizBar');
  const feed=document.getElementById('wizFeed');
  bar.style.width='18%';
  const drift=setInterval(()=>{
    const w=parseFloat(bar.style.width)||18;
    if(w<82) bar.style.width=(w+4)+'%';
  },700);
  let d=null;
  try{ d=await api('/api/strava?action=bulk&days=30'); }catch(e){}
  clearInterval(drift);
  bar.style.width='100%';
  const items=(d&&d.items)||[];
  if(items.length){
    let i=0;
    const tick=setInterval(()=>{
      if(i>=items.length||i>=8){ clearInterval(tick); setTimeout(()=>wizGoto(3),900); return; }
      const it=items[i++];
      feed.insertAdjacentHTML('beforeend',
        `<div class="wiz-feed-item"><b>${esc(it.name||cap(it.type))}</b> — ${fmtShort(it.date)}</div>`);
    },350);
  }else{
    feed.innerHTML='<div class="wiz-feed-item">No recent activities found — you can log manually or import later from Settings.</div>';
    setTimeout(()=>wizGoto(3),1600);
  }
}
async function finishWizard(){
  const raceName=document.getElementById('wizRaceName').value.trim();
  const raceDate=document.getElementById('wizRaceDate').value;
  try{
    await api('/api/profile',{method:'PUT',body:JSON.stringify({
      onboarded:true, streak_target:wizTarget,
      race_name:raceName||null, race_date:raceDate||null,
      training_phase:profile.training_phase||null,
      race_divisions:profile.race_divisions||[]
    })});
  }catch(e){}
  profile.onboarded=true; profile.streak_target=wizTarget;
  if(raceName) profile.race_name=raceName;
  if(raceDate) profile.race_date=raceDate;
  localStorage.removeItem('htd_wiz');
  document.getElementById('wizard').style.display='none';
  datesWithData.clear();
  await loadDay(selectedDate);
  await refreshWeekDots();
  loadTrailing();
  fillSettings();
}

/* ================================================================
   STREAK + LEVEL (rolling 84 days)
================================================================ */
const LEVELS=[
  {min:15, name:'Elite'},
  {min:11, name:'Performance'},
  {min:8,  name:'Competitor'},
  {min:5,  name:'Committed'},
  {min:0,  name:'Foundation'},
];
let athleteLevel=null, athleteStreak=0;
async function loadTrailing(){
  const end=todayStr(), start=addDays(mondayOf(end),-7*12);
  let d;
  try{ d=await api(`/api/get-data?start=${start}&end=${end}`); }catch(e){ return; }
  const sessions=d.sessions||[];
  // group by week (Mon-based)
  const weekDays={}, weekMin={};
  sessions.forEach(s=>{
    const w=mondayOf(s.session_date);
    (weekDays[w]=weekDays[w]||new Set()).add(s.session_date);
    weekMin[w]=(weekMin[w]||0)+(s.duration_min||0);
  });
  // level: avg weekly hours over the 12 full trailing weeks
  const weeks=[];
  for(let i=0;i<12;i++) weeks.push(addDays(mondayOf(end),-7*(11-i)));
  const avgH=weeks.reduce((a,w)=>a+(weekMin[w]||0),0)/12/60;
  athleteLevel=LEVELS.find(l=>avgH>=l.min).name;
  // streak: consecutive weeks meeting target, counting current week if already met
  const target=profile.streak_target||4;
  const curWeek=mondayOf(end);
  let streak=0;
  if((weekDays[curWeek]||new Set()).size>=target) streak++;
  let w=addDays(curWeek,-7);
  while((weekDays[w]||new Set()).size>=target){ streak++; w=addDays(w,-7); }
  athleteStreak=streak;
  renderStreakChip();
}
function renderStreakChip(){
  const el=document.getElementById('streakChip');
  if(!el) return;
  if(athleteLevel==null){ el.style.display='none'; return; }
  const parts=[];
  if(athleteStreak>0) parts.push(`<b>${athleteStreak}-week streak</b>`);
  parts.push(`<b>${athleteLevel}</b>`);
  el.innerHTML=parts.join('<span class="dot"></span>');
  el.style.display='flex';
  // sunday recap nudge
  if(new Date().getDay()===0 && !document.getElementById('sundayNudge')){
    el.insertAdjacentHTML('afterend',
      `<button id="sundayNudge" class="ghost-btn" style="margin-top:2px" onclick="switchTab('share');setSharePeriod('week')">Your week is ready to share →</button>`);
  }
}
function levelTag(){
  return athleteLevel? `<span class="c-level">${athleteLevel}</span>` : '';
}

/* ================================================================
   PASTE WORKOUT (Fitr / coach programs)
================================================================ */
let pasteTarget=null;
function openPasteModal(i){
  pasteTarget=i;
  document.getElementById('pasteText').value='';
  document.getElementById('pasteMsg').textContent='';
  document.getElementById('pasteModal').style.display='flex';
}
function closePasteModal(){ document.getElementById('pasteModal').style.display='none'; pasteTarget=null; }
async function runPasteExtract(){
  if(pasteTarget==null) return;
  const text=document.getElementById('pasteText').value;
  const msg=document.getElementById('pasteMsg');
  if(!text.trim()){ msg.textContent='Paste the workout first.'; return; }
  msg.textContent='Reading workout…';
  const i=pasteTarget, s=daySessions[i];
  try{
    const d=await api('/api/ai',{method:'POST',body:JSON.stringify({mode:'text',text,workout_type:s.workout_type})});
    const x=d.extracted||{};
    if(x.name) s.name=x.name;
    if(x.duration_min!=null) s.duration_min=x.duration_min;
    if(x.distance_km!=null && s.workout_type==='endurance') s.volume=x.distance_km;
    if(x.workout_description) s.workout_desc=x.workout_description;
    if(s.workout_type==='hyrox'){
      ['ski_erg_m','sled_push_m','sled_pull_m','burpees_reps','row_erg_m','farmers_m','lunges_m','wallballs_reps'].forEach(k=>{
        if(x[k]!=null) s.stations[k]=x[k];
      });
      if(x.compromised_run_km!=null) s.compromised_run_km=x.compromised_run_km;
    }
    renderSessions();
    closePasteModal();
    const sm=document.getElementById('saveMsg');
    sm.textContent='Session filled — review and adjust'; setTimeout(()=>sm.textContent='',2500);
  }catch(e){ msg.textContent='Could not read it — '+e.message; }
}

/* ================================================================
   STATS ENGINE
================================================================ */
function periodRange(period, anchor){
  if(period==='week'){ const s=mondayOf(anchor); return [s,addDays(s,6)]; }
  if(period==='month'){
    const d=parseDate(anchor);
    const s=new Date(d.getFullYear(),d.getMonth(),1);
    const e=new Date(d.getFullYear(),d.getMonth()+1,0);
    return [isoDate(s),isoDate(e)];
  }
  if(period==='year'){
    const d=parseDate(anchor);
    return [d.getFullYear()+'-01-01', d.getFullYear()+'-12-31'];
  }
  return [document.getElementById('rangeStart').value||todayStr(),
          document.getElementById('rangeEnd').value||todayStr()];
}
function shiftAnchor(period, anchor, n){
  if(period==='week') return addDays(anchor,7*n);
  const d=parseDate(anchor);
  if(period==='month'){ d.setMonth(d.getMonth()+n); return isoDate(d); }
  if(period==='year'){ d.setFullYear(d.getFullYear()+n); return isoDate(d); }
  return anchor;
}
function periodLabel(period,start,end){
  if(period==='day') return fmtDay(start);
  if(period==='week') return fmtShort(start)+' – '+fmtShort(end)+' '+parseDate(end).getFullYear();
  if(period==='month') return parseDate(start).toLocaleDateString('en-GB',{month:'long',year:'numeric'}).toUpperCase();
  if(period==='year') return String(parseDate(start).getFullYear());
  return fmtShort(start)+' – '+fmtShort(end);
}

function computeStats(sessions, physiology, start, end){
  const st={
    totalMin:0, zoneMin:[0,0,0,0,0], splitMin:{endurance:0,hyrox:0,strength:0},
    runKm:0, compKm:0, runZoneMin:[0,0,0,0,0],
    endExMin:0, endExKm:0,
    stations:{}, kcalOut:0, sessionCount:sessions.length,
    sleepVals:[], rpeVals:[], kcalDays:new Set(), perDayMin:{}, perDayRunKm:{}
  };
  STATIONS.forEach(x=>st.stations[x.k]=0);
  sessions.forEach(s=>{
    const dur=s.duration_min||0;
    st.totalMin+=dur;
    st.splitMin[s.workout_type]=(st.splitMin[s.workout_type]||0)+dur;
    const zones=[s.zone1,s.zone2,s.zone3,s.zone4,s.zone5];
    if(zones.some(z=>z>0)) zones.forEach((z,idx)=>st.zoneMin[idx]+=dur*(z||0)/100);
    if(s.kcal){ st.kcalOut+=s.kcal; }
    st.kcalDays.add(s.session_date);
    if(s.rpe) st.rpeVals.push(s.rpe);
    st.perDayMin[s.session_date]=(st.perDayMin[s.session_date]||0)+dur;

    const subs=s.subtypes||[];
    const isRunMod=subs.some(x=>['Run','Treadmill'].includes(x));
    if(s.workout_type==='endurance'){
      const volKm = s.volume_unit==='steps'?0:(parseFloat(s.volume)||0);
      if(isRunMod){
        st.runKm+=volKm;
        st.perDayRunKm[s.session_date]=(st.perDayRunKm[s.session_date]||0)+volKm;
        if(zones.some(z=>z>0)) zones.forEach((z,idx)=>st.runZoneMin[idx]+=dur*(z||0)/100);
      }else{
        st.endExMin+=dur; st.endExKm+=volKm;
        if(subs.includes('Ski erg')) st.stations.ski_erg_m+=volKm*1000;
        if(subs.includes('Row erg')) st.stations.row_erg_m+=volKm*1000;
      }
    }
    if(s.workout_type==='hyrox'){
      STATIONS.forEach(x=>{ st.stations[x.k]+= (s[x.k]||0); });
      const comp=parseFloat(s.compromised_run_km)||0;
      st.compKm+=comp; st.runKm+=comp;
      st.perDayRunKm[s.session_date]=(st.perDayRunKm[s.session_date]||0)+comp;
      st.endExKm += ((s.ski_erg_m||0)+(s.row_erg_m||0))/1000;
    }
  });
  physiology.forEach(p=>{ if(p.sleep_hours!=null) st.sleepVals.push(Number(p.sleep_hours)); });
  st.avgSleep = st.sleepVals.length? st.sleepVals.reduce((a,b)=>a+b,0)/st.sleepVals.length : null;
  st.avgRpe = st.rpeVals.length? st.rpeVals.reduce((a,b)=>a+b,0)/st.rpeVals.length : null;
  st.avgKcalDay = st.kcalDays.size? Math.round(st.kcalOut/st.kcalDays.size) : null;
  st.compPct = st.runKm>0? Math.round(st.compKm/st.runKm*100) : 0;
  return st;
}
function hm(min){
  min=Math.round(min);
  const h=Math.floor(min/60), m=min%60;
  return h>0? h+'h '+String(m).padStart(2,'0') : m+' min';
}

/* --------- stats view --------- */
function setStatsPeriod(p){
  statsPeriod=p;
  document.querySelectorAll('.period-pill').forEach(b=>b.classList.toggle('active',b.dataset.p===p));
  document.getElementById('customRange').style.display = p==='custom'?'flex':'none';
  document.getElementById('statsPeriodNav').style.display = p==='custom'?'none':'flex';
  if(p!=='custom') loadStats();
}
function shiftStatsPeriod(n){ statsAnchor=shiftAnchor(statsPeriod,statsAnchor,n); loadStats(); }

/* stacked single-line chart for stats (items: [{label,value,color}]) */
function statStackedLine(items){
  const tot=items.reduce((a,x)=>a+x.value,0);
  if(tot<=0) return '';
  const segs=items.map(x=>x.value>0?`<div class="s-zline-seg" style="width:${x.value/tot*100}%;background:${x.color}"></div>`:'').join('');
  const lbls=items.map(x=>{const p=Math.round(x.value/tot*100);return p>0?`<span style="color:${x.color}">${x.label} ${p}%</span>`:''}).join('');
  return `<div class="s-zline">${segs}</div><div class="s-zline-lbls">${lbls}</div>`;
}

async function loadStats(){
  const [start,end]=periodRange(statsPeriod,statsAnchor);
  document.getElementById('statsPeriodLabel').textContent=periodLabel(statsPeriod,start,end);
  const wrap=document.getElementById('statsContent');
  wrap.innerHTML='<div class="empty-state">Loading…</div>';
  let d;
  try{ d=await api(`/api/get-data?start=${start}&end=${end}`); }
  catch(e){ wrap.innerHTML='<div class="empty-state">Could not load data.</div>'; return; }
  const sessions=d.sessions||[], phys=d.physiology||[];
  if(sessions.length===0 && phys.length===0){
    wrap.innerHTML='<div class="empty-state">No training logged in this period yet.</div>'; return;
  }
  const st=computeStats(sessions,phys,start,end);

  // previous equivalent period for comparison deltas
  let prev=null;
  if(statsPeriod!=='custom'){
    const spanDays=Math.round((parseDate(end)-parseDate(start))/86400000)+1;
    const pStart=addDays(start,-spanDays), pEnd=addDays(start,-1);
    try{
      const pd=await api(`/api/get-data?start=${pStart}&end=${pEnd}`);
      if((pd.sessions||[]).length) prev=computeStats(pd.sessions||[],pd.physiology||[],pStart,pEnd);
    }catch(e){}
  }
  const delta=(cur,pv)=>{
    if(prev==null||pv==null||pv===0||cur==null) return '';
    const pct=Math.round((cur-pv)/pv*100);
    if(pct===0) return '';
    return `<span class="stat-delta ${pct>0?'up':'down'}">${pct>0?'↑':'↓'} ${Math.abs(pct)}%</span>`;
  };

  const tiles=[
    {v:hm(st.totalMin)+delta(st.totalMin,prev&&prev.totalMin), l:'Total training time'},
    {v:st.sessionCount+delta(st.sessionCount,prev&&prev.sessionCount), l:'Sessions'},
    {v:st.runKm.toFixed(1)+'<small>km</small>'+delta(st.runKm,prev&&prev.runKm), l:`Run volume · ${st.compPct}% compromised`},
    {v:st.endExKm.toFixed(1)+'<small>km</small>'+delta(st.endExKm,prev&&prev.endExKm), l:'Endurance excl. run · '+hm(st.endExMin)},
    st.avgKcalDay!=null?{v:st.avgKcalDay+'<small>kcal</small>'+delta(st.avgKcalDay,prev&&prev.avgKcalDay), l:'Avg active kcal / day'}:null,
    st.avgSleep!=null?{v:st.avgSleep.toFixed(1)+'<small>h</small>'+delta(st.avgSleep,prev&&prev.avgSleep), l:'Avg sleep'}:null,
  ].filter(Boolean);

  let html=`<div class="stat-hero">${tiles.map(t=>`<div class="stat-tile"><div class="v">${t.v}</div><div class="l">${t.l}</div></div>`).join('')}</div>`;

  // 1 — training split (stacked line)
  const spTot=st.splitMin.endurance+st.splitMin.hyrox+st.splitMin.strength;
  if(spTot>0){
    html+=`<div class="section-card"><div class="chart-title">Training split</div>`+
      statStackedLine([
        {label:'Endurance',value:st.splitMin.endurance,color:SPLIT_COLORS.endurance},
        {label:'Hyrox',value:st.splitMin.hyrox,color:SPLIT_COLORS.hyrox},
        {label:'Strength',value:st.splitMin.strength,color:SPLIT_COLORS.strength},
      ])+`</div>`;
  }

  // 2 — overall time in zones (stacked line)
  const zTot=st.zoneMin.reduce((a,b)=>a+b,0);
  if(zTot>0){
    html+=`<div class="section-card"><div class="chart-title">Time in zones</div>`+
      statStackedLine(st.zoneMin.map((m,z)=>({label:'Z'+(z+1),value:m,color:ZONE_COLORS[z]})))+`</div>`;
  }

  // 3 — run zones (stacked line)
  const rzTot=st.runZoneMin.reduce((a,b)=>a+b,0);
  if(rzTot>0){
    html+=`<div class="section-card"><div class="chart-title">Run — time in zones</div>`+
      statStackedLine(st.runZoneMin.map((m,z)=>({label:'Z'+(z+1),value:m,color:ZONE_COLORS[z]})))+`</div>`;
  }

  // 4 — hyrox stations: all 8, race order, ranked bars
  {
    const maxSt=Math.max(...STATIONS.map(x=>st.stations[x.k]),1);
    const anySt=STATIONS.some(x=>st.stations[x.k]>0);
    if(anySt){
      html+=`<div class="section-card"><div class="chart-title">Hyrox stations</div>`+
        STATIONS.map(x=>{
          const v=st.stations[x.k]||0;
          return `<div class="station-row">
            <div class="station-name">${x.label}</div>
            <div class="station-track"><div class="station-fill" style="width:${Math.max(v/maxSt*100, v>0?2:0)}%"></div></div>
            <div class="station-val">${fmtNum(v)}<small>${x.unit}</small></div>
          </div>`;
        }).join('')+`</div>`;
    }
  }

  // 6 — daily pulse (load + physiology per day)
  html+=pulseChartHTML(sessions,phys,start,end);

  wrap.innerHTML=html;
}

/* ---- daily pulse chart: bars = min/day, RPE max on top, dots = HRV / readiness / resting HR ---- */
const READY_COLORS={drained:'#ef4444',steady:'#fbbf24',primed:'#34d399'};
/* bar shade: light grey (easy) -> near-black (hard), monochrome */
function rpeShade(rpe){
  if(!rpe) return '#e7e5df';                    // rest / no RPE: faint
  const t=Math.min(Math.max((rpe-1)/9,0),1);    // 1..10 -> 0..1
  const from=[217,215,209], to=[15,15,14];
  const c=from.map((f,i)=>Math.round(f+(to[i]-f)*t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function pulseChartHTML(sessions,phys,start,end){
  const perDayMin={}, perDayRpe={};
  sessions.forEach(s=>{
    perDayMin[s.session_date]=(perDayMin[s.session_date]||0)+(s.duration_min||0);
    if(s.rpe) perDayRpe[s.session_date]=Math.max(perDayRpe[s.session_date]||0,s.rpe);
  });
  const physByDay={};
  phys.forEach(p=>{ physByDay[p.day]=p; });

  const spanDays=Math.round((parseDate(end)-parseDate(start))/86400000)+1;
  const weekly = spanDays>62;   // year & long custom ranges aggregate weekly

  // resting HR baseline = period average
  const rhrVals=phys.filter(p=>p.resting_hr!=null).map(p=>Number(p.resting_hr));
  const rhrAvg=rhrVals.length? rhrVals.reduce((a,b)=>a+b,0)/rhrVals.length : null;
  const hrvOK=v=>profile&&profile.hrv_low!=null&&profile.hrv_high!=null&&v!=null
    ? (v>=profile.hrv_low&&v<=profile.hrv_high?'#34d399':'#f97316') : '#e2e0da';
  const rhrColor=v=>{
    if(v==null||rhrAvg==null) return '#e2e0da';
    if(v<=rhrAvg) return '#34d399';
    if(v<=rhrAvg+5) return '#fbbf24';
    return '#f97316';
  };

  let cols=[];
  if(!weekly){
    for(let i=0;i<spanDays;i++){
      const ds=addDays(start,i);
      const p=physByDay[ds]||{};
      cols.push({
        lbl: spanDays<=7 ? ['M','T','W','T','F','S','S'][(parseDate(ds).getDay()+6)%7] : String(parseDate(ds).getDate()),
        min:perDayMin[ds]||0, rpe:perDayRpe[ds]||null,
        dots:[hrvOK(p.hrv!=null?Number(p.hrv):null),
              p.readiness?READY_COLORS[p.readiness]||'#e2e0da':'#e2e0da',
              rhrColor(p.resting_hr!=null?Number(p.resting_hr):null)]
      });
    }
  }else{
    let ws=mondayOf(start), wi=1;
    while(ws<=end){
      let min=0,rpe=0,hrvSum=0,hrvN=0;
      for(let i=0;i<7;i++){
        const ds=addDays(ws,i);
        min+=perDayMin[ds]||0;
        if(perDayRpe[ds]) rpe=Math.max(rpe,perDayRpe[ds]);
        const p=physByDay[ds];
        if(p&&p.hrv!=null){ hrvSum+=Number(p.hrv); hrvN++; }
      }
      cols.push({ lbl:'W'+wi, min, rpe:rpe||null,
        dots:[hrvOK(hrvN?hrvSum/hrvN:null)] });   // weekly mode: HRV only (weekly average)
      ws=addDays(ws,7); wi++;
    }
  }
  if(!cols.some(c=>c.min>0||c.dots.some(d=>d!=='#e2e0da'))) return '';

  const max=Math.max(...cols.map(c=>c.min),1);
  const inner=cols.map(c=>`<div class="pulse-col">
      <div class="pulse-hours">${c.min>0?(c.min/60).toFixed(1):''}</div>
      <div class="pulse-barwrap"><div class="pulse-bar" style="height:${Math.max(2,Math.round(c.min/max*100))}%;background:${rpeShade(c.rpe)}"></div></div>
      <div class="pulse-lbl">${c.lbl}</div>
      <div class="pulse-dots">${c.dots.map(d=>`<div class="pulse-dot" style="background:${d}"></div>`).join('')}</div>
      <div class="pulse-rpe">${c.rpe||''}</div>
    </div>`).join('');

  const legend = weekly
    ? `<div class="pulse-legend"><span><i style="background:#34d399"></i>HRV balanced</span><span><i style="background:#f97316"></i>HRV unbalanced</span><span>Bar shade = intensity · top = hours · bottom = max RPE</span></div>`
    : `<div class="pulse-legend"><span><i style="background:#34d399"></i>Good</span><span><i style="background:#fbbf24"></i>Mid</span><span><i style="background:#f97316"></i>Off</span><span>Dots: HRV · Readiness · Resting HR</span><span>Bar shade = intensity · top = hours · bottom = max RPE</span></div>`;

  return `<div class="section-card"><div class="chart-title">Daily load & recovery</div>
    <div class="pulse-scroll"><div class="pulse-chart" style="min-width:${cols.length>14?cols.length*13:0}px">${inner}</div></div>${legend}</div>`;
}
function fmtNum(n){ n=Math.round(n); return n>=10000? (n/1000).toFixed(1)+'k' : String(n); }

function bucketize(period,start,end,perDay){
  const out=[];
  if(period==='week'){
    const dows=['M','T','W','T','F','S','S'];
    for(let i=0;i<7;i++){ const ds=addDays(start,i); out.push({l:dows[i], v:perDay[ds]||0}); }
  }else if(period==='month'){
    let ws=mondayOf(start), wi=1;
    while(ws<=end){
      let v=0; for(let i=0;i<7;i++){ v+=perDay[addDays(ws,i)]||0; }
      out.push({l:'W'+wi, v}); ws=addDays(ws,7); wi++;
    }
  }else{
    const y=parseDate(start).getFullYear();
    const mons=['J','F','M','A','M','J','J','A','S','O','N','D'];
    for(let m=0;m<12;m++){
      let v=0;
      Object.keys(perDay).forEach(ds=>{ const d=parseDate(ds); if(d.getFullYear()===y&&d.getMonth()===m) v+=perDay[ds]; });
      out.push({l:mons[m], v});
    }
  }
  return out;
}

/* ================================================================
   SHARE — IG CARDS
================================================================ */
function setSharePeriod(p){
  sharePeriod=p; shareToggles={}; shareDayCard='day';
  document.querySelectorAll('.share-pill').forEach(b=>b.classList.toggle('active',b.dataset.p===p));
  loadShare();
}
function shiftSharePeriod(n){
  shareAnchor = sharePeriod==='day'? addDays(shareAnchor,n) : shiftAnchor(sharePeriod,shareAnchor,n);
  loadShare();
}

async function loadShare(){
  const [start,end]= sharePeriod==='day'? [shareAnchor,shareAnchor] : periodRange(sharePeriod,shareAnchor);
  document.getElementById('sharePeriodLabel').textContent=periodLabel(sharePeriod,start,end);
  let d;
  try{ d=await api(`/api/get-data?start=${start}&end=${end}`); }
  catch(e){ document.getElementById('card').innerHTML='<div class="empty-state" style="color:rgba(255,255,255,.5)">Could not load.</div>'; return; }
  shareData={sessions:d.sessions||[], phys:d.physiology||[], start, end};
  renderShareCard();
}

function toggleShare(key){ shareToggles[key]=!shareToggles[key]; renderShareCard(); }

/* ---- card style system ---- */
const FONT_SWATCHES=['#FFFFFF','#0F0F0E','#F4EFE6','#C9C5BB','#C8A96A'];
let cardStyle=localStorage.getItem('htd_card_style')||'glass';
let cardInk=localStorage.getItem('htd_card_ink')||'#FFFFFF';
function setCardStyle(s){
  cardStyle=s; localStorage.setItem('htd_card_style',s);
  applyCardStyle(); renderShareCard();
}
function setCardInk(c){
  cardInk=c; localStorage.setItem('htd_card_ink',c);
  applyCardStyle(); renderShareCard();
}
function hexToRgba(hex,a){
  const h=hex.replace('#','');
  const r=parseInt(h.substr(0,2),16),g=parseInt(h.substr(2,2),16),b=parseInt(h.substr(4,2),16);
  return `rgba(${r},${g},${b},${a})`;
}
function applyCardStyle(){
  const card=document.getElementById('card');
  document.getElementById('styleGlass').classList.toggle('active',cardStyle==='glass');
  document.getElementById('styleClear').classList.toggle('active',cardStyle==='clear');
  const sw=document.getElementById('fontSwatches');
  sw.style.display=cardStyle==='clear'?'flex':'none';
  sw.innerHTML=FONT_SWATCHES.map(c=>`<button class="swatch ${c===cardInk?'active':''}" style="background:${c}" onclick="setCardInk('${c}')"></button>`).join('');
  card.className=cardStyle;
  const ink = cardStyle==='glass' ? '#F2F0EC' : cardInk;
  card.style.setProperty('--ci-hi',ink);
  card.style.setProperty('--ci-mid',hexToRgba(ink,.62));
  card.style.setProperty('--ci-low',hexToRgba(ink,.36));
  card.style.setProperty('--ci-faint',hexToRgba(ink,.22));
  card.style.setProperty('--ci-line',hexToRgba(ink,.12));
  card.style.setProperty('--ci-track',hexToRgba(ink,.1));
}

let shareDayCard='day';   // 'day' or session array index
function renderShareCard(){
  const card=document.getElementById('card');
  const togWrap=document.getElementById('shareToggles');
  const picker=document.getElementById('dayCardPicker');
  applyCardStyle();
  if(!shareData){ card.innerHTML=''; return; }
  const {sessions,phys,start,end}=shareData;
  if(sessions.length===0){
    card.innerHTML='<div style="text-align:center;color:var(--ci-mid);font-size:12px;padding:40px 0">Nothing logged in this period.</div>';
    togWrap.innerHTML=''; picker.style.display='none'; return;
  }
  if(sharePeriod==='day'){
    picker.style.display='flex';
    picker.innerHTML=[`<button class="pill ${shareDayCard==='day'?'active':''}" onclick="pickDayCard('day')">Day</button>`]
      .concat(sessions.map((s,i)=>`<button class="pill ${shareDayCard===i?'active':''}" onclick="pickDayCard(${i})">Session ${i+1}</button>`)).join('');
    if(shareDayCard==='day'||sessions.length===1&&shareDayCard>=sessions.length) renderDaySummaryCard(card,togWrap,sessions,start);
    else renderSessionCard(card,togWrap,sessions[shareDayCard]||sessions[0],start);
  }else{
    picker.style.display='none';
    renderPeriodCard(card,togWrap,sessions,phys,start,end);
  }
}
function pickDayCard(v){ shareDayCard=v; shareToggles={}; renderShareCard(); }

function metaLine(){
  const bits=[];
  if(profile.training_phase && profile.training_phase!=='Race') bits.push(profile.training_phase);
  if(profile.race_name){
    bits.push(profile.race_name);
    if(profile.race_divisions&&profile.race_divisions.length) bits.push(profile.race_divisions.join(' · '));
    if(profile.race_date){ const du=daysUntil(profile.race_date); if(du>=0) bits.push(du+' days out'); }
  }
  return bits.join('<span class="sep">·</span>');
}
function logoImg(){
  return profile.logo_url? `<img class="c-logo" src="${profile.logo_url}" crossorigin="anonymous">` : '';
}
/* single-line stacked zone bar */
function zoneLineBar(zoneArr){
  const tot=zoneArr.reduce((a,b)=>a+b,0);
  if(tot<=0) return '';
  const segs=zoneArr.map((v,z)=>v>0?`<div class="c-zline-seg" style="width:${v/tot*100}%;background:${ZONE_COLORS[z]}"></div>`:'').join('');
  const lbls=zoneArr.map((v,z)=>{const p=Math.round(v/tot*100);return p>0?`<span style="color:${ZONE_COLORS[z]}">Z${z+1} ${p}%</span>`:''}).join('');
  return `<div class="c-zline">${segs}</div><div class="c-zline-lbls">${lbls}</div>`;
}

/* ---- DAY SUMMARY CARD (compact: totals + one-line zones) ---- */
function renderDaySummaryCard(card,togWrap,sessions,dateStr){
  togWrap.innerHTML='';
  const totMin=sessions.reduce((a,s)=>a+(s.duration_min||0),0);
  const runKm=sessions.reduce((a,s)=>{
    let k=0;
    if(s.workout_type==='endurance'&&(s.subtypes||[]).some(x=>['Run','Treadmill'].includes(x))&&s.volume_unit!=='steps') k+=parseFloat(s.volume)||0;
    k+=parseFloat(s.compromised_run_km)||0; return a+k;
  },0);
  const kcal=sessions.reduce((a,s)=>a+(s.kcal||0),0);
  const dz=[0,0,0,0,0];
  sessions.forEach(s=>{ const zs=[s.zone1,s.zone2,s.zone3,s.zone4,s.zone5]; if(zs.some(z=>z>0)) zs.forEach((z,i)=>dz[i]+=(s.duration_min||0)*(z||0)/100); });
  const names=sessions.map(s=>s.name).filter(Boolean);

  let inner=`<div class="c-top"><div class="c-date">${fmtDay(dateStr)}</div>${logoImg()}</div>
    <div class="c-meta">${metaLine()}</div><div class="c-rule"></div>
    <div class="c-type">${sessions.length>1?sessions.length+' sessions':'Session'}</div>
    ${names.length?`<div class="c-name">${names.map(esc).join(' · ')}</div>`:''}
    <div class="c-metrics">
      <div class="c-metric"><div class="mv">${hm(totMin)}</div><div class="ml">Total time</div></div>
      ${runKm>0?`<div class="c-metric"><div class="mv">${runKm.toFixed(1)}<small>km</small></div><div class="ml">Run volume</div></div>`:''}
      ${kcal>0?`<div class="c-metric"><div class="mv">${kcal}<small>kcal</small></div><div class="ml">Active</div></div>`:''}
    </div>
    ${zoneLineBar(dz)}
    <div class="c-brand">HYROX TRAINING DATA${levelTag()}</div>`;
  card.innerHTML=inner;
}

/* ---- SESSION CARD (exhaustive, with deselect chips) ---- */
function renderSessionCard(card,togWrap,s,dateStr){
  const zones=[s.zone1||0,s.zone2||0,s.zone3||0,s.zone4||0,s.zone5||0];
  const parts=[
    {k:'name', l:'Name', show:!!s.name},
    {k:'desc', l:'Workout', show:!!s.workout_desc},
    {k:'duration', l:'Duration', show:!!s.duration_min},
    {k:'volume', l:'Volume', show:!!s.volume},
    {k:'pace', l:'Pace', show:!!s.pace},
    {k:'hr', l:'Avg HR', show:!!s.avg_hr},
    {k:'kcal', l:'Kcal', show:!!s.kcal},
    {k:'zones', l:'Zones', show:zones.some(z=>z>0)},
    {k:'rpe', l:'RPE', show:!!s.rpe},
  ].filter(x=>x.show);
  togWrap.innerHTML=parts.map(x=>{
    if(!(x.k in shareToggles)) shareToggles[x.k]=true;
    return `<button class="tog ${shareToggles[x.k]?'on':''}" onclick="toggleShare('${x.k}')">${x.l}</button>`;
  }).join('');
  const on=k=>shareToggles[k];

  const typeLbl = s.workout_type==='hyrox'?'Hyrox / Mix':cap(s.workout_type||'');
  const sub=(s.subtypes||[]).join(' · ');
  const mets=[];
  if(on('duration')&&s.duration_min) mets.push({v:s.duration_min,u:'min',l:'Duration'});
  if(on('volume')&&s.volume) mets.push({v:s.volume,u:s.volume_unit||'km',l:'Volume'});
  if(on('pace')&&s.pace) mets.push({v:s.pace,u:s.pace_unit||'',l:'Avg pace'});
  if(on('hr')&&s.avg_hr) mets.push({v:s.avg_hr,u:'bpm',l:'Avg HR'});
  if(on('kcal')&&s.kcal) mets.push({v:s.kcal,u:'kcal',l:'Active'});

  let inner=`<div class="c-top"><div class="c-date">${fmtDay(dateStr)}</div>${logoImg()}</div>
    <div class="c-meta">${metaLine()}</div><div class="c-rule"></div>
    <div class="c-type">${typeLbl}${sub?' — '+sub:''}</div>
    ${on('name')&&s.name?`<div class="c-name">${esc(s.name)}</div>`:''}
    ${on('desc')&&s.workout_desc?`<div class="c-desc">${esc(s.workout_desc)}</div>`:''}
    ${mets.length?`<div class="c-metrics">${mets.map(m=>`<div class="c-metric"><div class="mv">${m.v}<small>${m.u}</small></div><div class="ml">${m.l}</div></div>`).join('')}</div>`:''}
    ${on('zones')?zoneLineBar(zones):''}
    ${on('rpe')&&s.rpe?`<div class="c-rpe"><span class="rl">RPE</span><span class="rv">${s.rpe}/10</span></div>`:''}
    <div class="c-brand">HYROX TRAINING DATA${levelTag()}</div>`;
  card.innerHTML=inner;
}

/* ---- PERIOD CARD (week/month/year) ---- */
function renderPeriodCard(card,togWrap,sessions,phys,start,end){
  const st=computeStats(sessions,phys,start,end);
  const kpis=[
    {k:'time', v:hm(st.totalMin), l:'Training time', show:st.totalMin>0},
    {k:'sessions', v:st.sessionCount, l:'Sessions', show:st.sessionCount>0},
    {k:'run', v:st.runKm.toFixed(1)+'<small>km</small>', l:'Run volume', show:st.runKm>0},
    {k:'kcal', v:st.avgKcalDay!=null?st.avgKcalDay+'<small>kcal</small>':'', l:'Avg kcal / day', show:st.avgKcalDay!=null},
    {k:'sleep', v:st.avgSleep!=null?st.avgSleep.toFixed(1)+'<small>h</small>':'', l:'Avg sleep', show:st.avgSleep!=null},
  ].filter(x=>x.show);
  const charts=[
    {k:'zones', l:'Zones', show:st.zoneMin.some(m=>m>0)},
    {k:'bars', l:'Volume', show:Object.keys(st.perDayMin).length>0},
    {k:'split', l:'Split', show:(st.splitMin.endurance+st.splitMin.hyrox+st.splitMin.strength)>0},
  ].filter(x=>x.show);

  // toggle chips
  togWrap.innerHTML=[...kpis,...charts].map(x=>{
    if(!(x.k in shareToggles)) shareToggles[x.k]=true;
    return `<button class="tog ${shareToggles[x.k]?'on':''}" onclick="toggleShare('${x.k}')">${x.l}</button>`;
  }).join('');

  let inner=`<div class="c-top"><div class="c-date">${periodLabel(sharePeriod,start,end)}</div>${logoImg()}</div>
    <div class="c-meta">${metaLine()}</div><div class="c-rule"></div>
    <div class="c-kpis">${kpis.filter(x=>shareToggles[x.k]).map(x=>`<div class="c-kpi"><div class="kv">${x.v}</div><div class="kl">${x.l}</div></div>`).join('')}</div>`;

  if(shareToggles['zones'] && st.zoneMin.some(m=>m>0)){
    inner+=`<div class="c-chart-lbl">Time in zones</div>`+zoneLineBar(st.zoneMin);
  }
  if(shareToggles['bars']){
    const buckets=bucketize(sharePeriod,start,end,st.perDayMin);
    if(buckets.some(b=>b.v>0)){
      const max=Math.max(...buckets.map(b=>b.v));
      inner+=`<div class="c-chart-lbl">Training time</div><div class="c-vbars">`+
        buckets.map(b=>`<div class="c-vbar-col"><div class="c-vbar" style="height:${max?Math.max(3,Math.round(b.v/max*100)):3}%"></div><div class="c-vbar-lbl">${b.l}</div></div>`).join('')+`</div>`;
    }
  }
  const spTot=st.splitMin.endurance+st.splitMin.hyrox+st.splitMin.strength;
  if(shareToggles['split'] && spTot>0){
    const items=[
      {label:'Endurance',value:st.splitMin.endurance,color:SPLIT_COLORS.endurance},
      {label:'Hyrox',value:st.splitMin.hyrox,color:SPLIT_COLORS.hyrox},
      {label:'Strength',value:st.splitMin.strength,color:SPLIT_COLORS.strength},
    ];
    const segs=items.map(x=>x.value>0?`<div class="c-zline-seg" style="width:${x.value/spTot*100}%;background:${x.color}"></div>`:'').join('');
    const lbls=items.map(x=>{const p=Math.round(x.value/spTot*100);return p>0?`<span style="color:${x.color}">${x.label} ${p}%</span>`:''}).join('');
    inner+=`<div class="c-chart-lbl">Training split</div><div class="c-zline">${segs}</div><div class="c-zline-lbls">${lbls}</div>`;
  }
  inner+=`<div class="c-brand">HYROX TRAINING DATA${levelTag()}</div>`;
  card.innerHTML=inner;
}
/* ---- EXPORT ---- */
async function renderCardPNG(){
  const card=document.getElementById('card');
  return await html2canvas(card,{scale:3,backgroundColor:null,useCORS:true});
}
async function exportCard(){
  const msg=document.getElementById('exportMsg');
  msg.textContent='Rendering…';
  try{
    const canvas=await renderCardPNG();
    const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
    if(navigator.clipboard && window.ClipboardItem){
      await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
      msg.textContent='Copied — paste it into your Instagram story';
    }else{ triggerDownload(blob); msg.textContent='Downloaded — add it to your story'; }
  }catch(e){
    try{
      const canvas=await renderCardPNG();
      const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
      triggerDownload(blob);
      msg.textContent='Downloaded — add it to your story';
    }catch(e2){ msg.textContent='Export failed — try again'; }
  }
  setTimeout(()=>msg.textContent='',3500);
}
async function downloadCard(){
  const msg=document.getElementById('exportMsg');
  msg.textContent='Rendering…';
  try{
    const canvas=await renderCardPNG();
    const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
    triggerDownload(blob);
    msg.textContent='Downloaded';
  }catch(e){ msg.textContent='Export failed — try again'; }
  setTimeout(()=>msg.textContent='',3000);
}
function triggerDownload(blob){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='hyrox-training-'+sharePeriod+'-'+shareAnchor+'.png';
  a.click();
}

/* ================================================================
   SETTINGS
================================================================ */
let phaseSel=null, divisionSel=[];
let targetSel=4;
function pickTarget(n){
  targetSel=n;
  document.querySelectorAll('#targetPills .pill').forEach(b=>b.classList.toggle('active',+b.dataset.n===n));
}
function buildSettingsPills(){
  document.getElementById('targetPills').innerHTML=[3,4,5,6].map(n=>
    `<button class="pill" data-n="${n}" onclick="pickTarget(${n})">${n} days</button>`).join('');
  document.getElementById('phasePills').innerHTML=PHASES.map(p=>
    `<button class="pill" data-v="${p}" onclick="pickPhase('${p}')">${p}</button>`).join('');
  document.getElementById('divisionPills').innerHTML=DIVISIONS.map(d=>
    `<button class="pill" data-v="${d}" onclick="pickDivision('${d}')">${d}</button>`).join('');
}
function pickPhase(p){
  phaseSel = phaseSel===p? null : p;
  document.querySelectorAll('#phasePills .pill').forEach(b=>b.classList.toggle('active',b.dataset.v===phaseSel));
}
function pickDivision(d){
  const i=divisionSel.indexOf(d);
  if(i>-1) divisionSel.splice(i,1);
  else if(divisionSel.length<3) divisionSel.push(d);
  document.querySelectorAll('#divisionPills .pill').forEach(b=>b.classList.toggle('active',divisionSel.includes(b.dataset.v)));
}
function fillSettings(){
  document.getElementById('setAge').value=profile.age??'';
  document.getElementById('setHeight').value=profile._height??'';
  document.getElementById('setWeight').value=profile._weight??'';
  document.getElementById('setHrvLow').value=profile.hrv_low??'';
  document.getElementById('setHrvHigh').value=profile.hrv_high??'';
  document.getElementById('hrz1').value=profile.hr_z1_max??'';
  document.getElementById('hrz2').value=profile.hr_z2_max??'';
  document.getElementById('hrz3').value=profile.hr_z3_max??'';
  document.getElementById('hrz4').value=profile.hr_z4_max??'';
  document.getElementById('setRaceName').value=profile.race_name??'';
  document.getElementById('setRaceDate').value=profile.race_date??'';
  targetSel=profile.streak_target||4;
  document.querySelectorAll('#targetPills .pill').forEach(b=>b.classList.toggle('active',+b.dataset.n===targetSel));
  phaseSel=profile.training_phase||null;
  divisionSel=(profile.race_divisions||[]).slice(0,3);
  document.querySelectorAll('#phasePills .pill').forEach(b=>b.classList.toggle('active',b.dataset.v===phaseSel));
  document.querySelectorAll('#divisionPills .pill').forEach(b=>b.classList.toggle('active',divisionSel.includes(b.dataset.v)));
  if(profile.logo_url){
    const img=document.getElementById('logoPreview');
    img.src=profile.logo_url; img.style.display='block';
  }
}
async function saveSettings(){
  const msg=document.getElementById('settingsMsg');
  msg.textContent='Saving…';
  const body={
    age:intOrNull(document.getElementById('setAge').value),
    hrv_low:intOrNull(document.getElementById('setHrvLow').value),
    hrv_high:intOrNull(document.getElementById('setHrvHigh').value),
    hr_z1_max:intOrNull(document.getElementById('hrz1').value),
    hr_z2_max:intOrNull(document.getElementById('hrz2').value),
    hr_z3_max:intOrNull(document.getElementById('hrz3').value),
    hr_z4_max:intOrNull(document.getElementById('hrz4').value),
    training_phase:phaseSel,
    streak_target:targetSel,
    race_name:document.getElementById('setRaceName').value||null,
    race_date:document.getElementById('setRaceDate').value||null,
    race_divisions:divisionSel,
    weight_kg:numOrNull(document.getElementById('setWeight').value),
    height_cm:numOrNull(document.getElementById('setHeight').value),
  };
  try{
    const d=await api('/api/profile',{method:'PUT',body:JSON.stringify(body)});
    profile=Object.assign(profile,d.profile||body);
    profile._weight=body.weight_kg; profile._height=body.height_cm;
    onHrvInput();
    msg.textContent='Saved';
    setTimeout(()=>msg.textContent='',2000);
  }catch(e){ msg.textContent='Could not save — '+e.message; }
}
async function uploadLogo(ev){
  const file=ev.target.files[0]; ev.target.value='';
  if(!file) return;
  const msg=document.getElementById('settingsMsg');
  msg.textContent='Uploading logo…';
  const b64=await new Promise((res,rej)=>{
    const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(file);
  });
  try{
    const d=await api('/api/upload-logo',{method:'POST',body:JSON.stringify({image:b64,content_type:file.type||'image/png'})});
    profile.logo_url=d.logo_url;
    const img=document.getElementById('logoPreview');
    img.src=d.logo_url; img.style.display='block';
    msg.textContent='Logo saved';
    setTimeout(()=>msg.textContent='',2000);
  }catch(e){ msg.textContent='Upload failed — '+e.message; }
}
