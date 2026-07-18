/* ================================================================
   OCTA. — app.js
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
let coachInfo = null;   // athlete's coach program info
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
function ageFromDob(dob){
  if(!dob) return null;
  const d=parseDate(dob), t=new Date();
  let age=t.getFullYear()-d.getFullYear();
  const m=t.getMonth()-d.getMonth();
  if(m<0 || (m===0 && t.getDate()<d.getDate())) age--;
  return age;
}

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
    coachInfo = p.coach || null;
    if(p.body){ profile._weight=p.body.weight_kg; profile._height=p.body.height_cm; }
  }catch(e){ profile = {}; }
  if(profile.role === 'coach'){ enterCoach(); return; }
  fillSettings();
  renderCoachSection();
  applyPendingCode();
  await loadDay(selectedDate);
  await refreshWeekDots();
  checkStravaStatus();
  loadTrailing();          // streak + level (last 84 days)
  maybeStartWizard();
}

/* ================================================================
   ATHLETE — COACH LINK
================================================================ */
function renderCoachSection(){
  const linked=document.getElementById('coachLinked'), un=document.getElementById('coachUnlinked');
  if(!linked) return;
  // coached athletes: phase is set by the coach via week labels
  const phaseCard=document.getElementById('phasePills');
  if(phaseCard){
    const card=phaseCard.closest('.section-card');
    if(card) card.style.display = coachInfo ? 'none' : 'block';
  }
  if(coachInfo){
    linked.style.display='block'; un.style.display='none';
    document.getElementById('coachProgramName').textContent = coachInfo.program_name || 'Linked to your coach';
  }else{
    linked.style.display='none'; un.style.display='block';
  }
}
async function joinCoach(){
  const code=document.getElementById('coachCode').value.trim();
  const msg=document.getElementById('coachMsg');
  msg.textContent='Joining…';
  try{
    const d=await api('/api/coach',{method:'POST',body:JSON.stringify({action:'join',code})});
    coachInfo=d.coach||null;
    renderCoachSection();
    msg.textContent='Welcome to '+((coachInfo&&coachInfo.program_name)||'the program');
    setTimeout(()=>msg.textContent='',3000);
  }catch(e){ msg.textContent=e.message; }
}
async function leaveCoach(){
  const msg=document.getElementById('coachMsg');
  try{
    await api('/api/coach',{method:'POST',body:JSON.stringify({action:'leave'})});
    coachInfo=null; renderCoachSection();
    msg.textContent='You left the program';
    setTimeout(()=>msg.textContent='',3000);
  }catch(e){ msg.textContent=e.message; }
}

/* ================================================================
   COACH WORKSPACE
================================================================ */
let coachAthletes=[], caCurrent=null;
function enterCoach(){
  document.body.classList.add('coach');
  ['viewLog','viewStats','viewShare','viewSettings'].forEach(v=>document.getElementById(v).style.display='none');
  document.getElementById('viewCoach').style.display='block';
  document.getElementById('coachProgramTitle').textContent = profile.program_name || '';
  document.getElementById('inviteCode').textContent = profile.invite_code || '——————';
  fillCoachSettings();
  loadAthletes();
  if(!profile.invite_code) regenCode();
}
function coachTab(t){
  document.getElementById('coachHome').style.display = t==='home'?'block':'none';
  document.getElementById('coachAthleteView').style.display='none';
  document.getElementById('coachProg').style.display = t==='prog'?'block':'none';
  document.getElementById('coachFinance').style.display = t==='finance'?'block':'none';
  document.getElementById('coachSettings').style.display = t==='settings'?'block':'none';
  document.getElementById('cnavHome').classList.toggle('active',t==='home');
  document.getElementById('cnavProg').classList.toggle('active',t==='prog');
  document.getElementById('cnavFinance').classList.toggle('active',t==='finance');
  document.getElementById('cnavSettings').classList.toggle('active',t==='settings');
  if(t==='finance') loadFinance();
  if(t==='prog'){ loadTemplates(); if(!coachAthletes.length) api('/api/coach?action=athletes').then(d=>coachAthletes=d.athletes||[]).catch(()=>{}); }
}
async function regenCode(){
  try{
    const d=await api('/api/coach',{method:'POST',body:JSON.stringify({action:'code'})});
    profile.invite_code=d.code;
    document.getElementById('inviteCode').textContent=d.code;
  }catch(e){}
}
async function loadAthletes(){
  const list=document.getElementById('athleteList');
  list.innerHTML='<div class="empty-state">Loading…</div>';
  try{
    const d=await api('/api/coach?action=athletes');
    coachAthletes=d.athletes||[];
  }catch(e){ list.innerHTML='<div class="empty-state">Could not load athletes.</div>'; return; }
  if(!coachAthletes.length){
    list.innerHTML=`<div class="empty-state">No athletes yet.<br>Share your invite code — they enter it in their Settings.</div>`;
    return;
  }
  list.innerHTML=coachAthletes.map((a,i)=>{
    const st=(a.crm&&a.crm.status)||'active';
    const fullName=[a.first_name,a.last_name].filter(Boolean).join(' ') || a.email;
    return `<div class="athlete-card" onclick="openAthlete(${i})">
      <div class="an">${esc(fullName)}</div>
      <div class="am">${a.last_session?'Last session '+fmtShort(a.last_session):'No sessions yet'}
        ${a.race_name?'<br>'+esc(a.race_name)+(a.race_date?' · '+fmtShort(a.race_date):''):''}</div>
      <span class="as ${st}">${st}</span>
    </div>`;
  }).join('');
}
function backToRoster(){ coachTab('home'); loadAthletes(); }
function openAthlete(i){
  caCurrent=coachAthletes[i];
  document.getElementById('coachHome').style.display='none';
  document.getElementById('coachAthleteView').style.display='block';
  document.getElementById('caHead').textContent=[caCurrent.first_name,caCurrent.last_name].filter(Boolean).join(' ') || caCurrent.email;
  const c=caCurrent.crm||{};
  document.getElementById('crmStart').value=c.start_date||'';
  document.getElementById('crmPrice').value=c.monthly_price??'';
  crmStatusVal=c.status||'active';
  renderCrmStatusPills();
  document.getElementById('crmNotes').value=c.notes||'';
  const priceLbl=document.querySelector('#crmPrice').closest('.macro-field').querySelector('label');
  if(priceLbl) priceLbl.textContent=(CURRENCY_SYMBOLS[profile.currency]||profile.currency||'€')+' / month';
  caPeriod='week'; caAnchor=todayStr();
  document.querySelectorAll('.ca-period').forEach(b=>b.classList.toggle('active',b.dataset.p==='week'));
  document.getElementById('caCustomRange').style.display='none';
  document.getElementById('caPeriodNav').style.display='flex';
  wlWeek=mondayOf(todayStr());
  renderWlSection();
  loadCaStats();
}
let crmStatusVal='active';
const CRM_STATUS_STYLES={active:['#e7f7ef','#0e9f6e'],paused:['#fdf6e3','#b7860b'],churned:['#f1f1ee','#8a8880']};
function renderCrmStatusPills(){
  const el=document.getElementById('crmStatusPills'); if(!el) return;
  el.innerHTML=['active','paused','churned'].map(s=>{
    const on=crmStatusVal===s, [bg,fg]=CRM_STATUS_STYLES[s];
    return `<button class="pill" style="${on?`background:${bg};color:${fg};border-color:${fg}33;`:''}" onclick="crmStatusVal='${s}';renderCrmStatusPills()">${cap(s)}</button>`;
  }).join('');
}
async function saveCrm(){
  const msg=document.getElementById('crmMsg');
  msg.textContent='Saving…';
  try{
    await api('/api/coach',{method:'POST',body:JSON.stringify({
      action:'crm', athlete_id:caCurrent.id,
      start_date:document.getElementById('crmStart').value||null,
      monthly_price:numOrNull(document.getElementById('crmPrice').value),
      status:crmStatusVal,
      notes:document.getElementById('crmNotes').value||null
    })});
    caCurrent.crm={start_date:document.getElementById('crmStart').value,monthly_price:document.getElementById('crmPrice').value,status:crmStatusVal,notes:document.getElementById('crmNotes').value};
    msg.textContent='Saved'; setTimeout(()=>msg.textContent='',2000);
  }catch(e){ msg.textContent=e.message; }
}
let caPeriod='week', caAnchor=todayStr();
function setCaStatsPeriod(p){
  caPeriod=p;
  document.querySelectorAll('.ca-period').forEach(b=>b.classList.toggle('active',b.dataset.p===p));
  document.getElementById('caCustomRange').style.display = p==='custom'?'flex':'none';
  document.getElementById('caPeriodNav').style.display = p==='custom'?'none':'flex';
  if(p!=='custom') loadCaStats();
}
function shiftCaPeriod(n){ caAnchor=shiftAnchor(caPeriod,caAnchor,n); loadCaStats(); }
async function loadCaStats(){
  const [start,end] = caPeriod==='custom'
    ? [document.getElementById('caRangeStart').value||todayStr(), document.getElementById('caRangeEnd').value||todayStr()]
    : periodRange(caPeriod,caAnchor);
  document.getElementById('caPeriodLabel').textContent=periodLabel(caPeriod,start,end);
  const wrap=document.getElementById('caStats');
  wrap.innerHTML='<div class="empty-state">Loading…</div>';
  let d;
  try{ d=await api(`/api/coach?action=athlete-data&id=${caCurrent.id}&start=${start}&end=${end}`); }
  catch(e){ wrap.innerHTML=`<div class="empty-state">${e.message}</div>`; return; }
  const sessions=d.sessions||[], phys=d.physiology||[];
  if(!sessions.length && !phys.length){ wrap.innerHTML='<div class="empty-state">Nothing logged in this period.</div>'; return; }
  let prev=null;
  if(caPeriod!=='custom'){
    const spanDays=Math.round((parseDate(end)-parseDate(start))/86400000)+1;
    const pStart=addDays(start,-spanDays), pEnd=addDays(start,-1);
    try{
      const pd=await api(`/api/coach?action=athlete-data&id=${caCurrent.id}&start=${pStart}&end=${pEnd}`);
      if((pd.sessions||[]).length) prev=computeStats(pd.sessions||[],pd.physiology||[],pStart,pEnd);
    }catch(e){}
  }
  wrap.innerHTML=statsBlockHTML(sessions,phys,start,end,prev);
}
function fillCoachSettings(){
  document.getElementById('csName').value=profile.program_name||'';
  document.getElementById('csDesc').value=profile.program_desc||'';
  document.getElementById('csUrl').value=profile.program_url||'';
  document.getElementById('csCurrency').value=profile.currency||'EUR';
  loadMyLanding();
  if(profile.logo_url){
    const img=document.getElementById('csLogoPreview');
    img.src=profile.logo_url; img.style.display='block';
  }
}
async function saveCoachSettings(){
  const msg=document.getElementById('csMsg');
  msg.textContent='Saving…';
  try{
    await api('/api/profile',{method:'PUT',body:JSON.stringify({
      program_name:document.getElementById('csName').value||null,
      program_desc:document.getElementById('csDesc').value||null,
      program_url:document.getElementById('csUrl').value||null,
      currency:document.getElementById('csCurrency').value||'EUR'
    })});
    profile.program_name=document.getElementById('csName').value;
    profile.currency=document.getElementById('csCurrency').value;
    document.getElementById('coachProgramTitle').textContent=profile.program_name||'';
    msg.textContent='Saved'; setTimeout(()=>msg.textContent='',2000);
  }catch(e){ msg.textContent=e.message; }
}
if(getToken()) enterApp();

// If another tab in this browser logs into a different account, this tab's
// session token silently changes underneath it (localStorage is shared across
// tabs). Force a reload so this tab never acts using a foreign account's token.
window.addEventListener('storage', function(e){
  if(e.key === 'htd_token') location.reload();
});

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
  loadAssignments();
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
  renderAssigned();
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
  window.location.href = '/api/strava?action=connect&token='+encodeURIComponent(getToken());
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
  if(p.has('code')){
    localStorage.setItem('htd_pending_code', p.get('code'));
    history.replaceState({},'',location.pathname);
  }
})();
async function applyPendingCode(){
  const code=localStorage.getItem('htd_pending_code');
  if(!code || coachInfo || (profile&&profile.role==='coach')) { if(code&&profile&&profile.role==='coach') localStorage.removeItem('htd_pending_code'); return; }
  try{
    const d=await api('/api/coach',{method:'POST',body:JSON.stringify({action:'join',code})});
    coachInfo=d.coach||null;
    localStorage.removeItem('htd_pending_code');
    renderCoachSection();
  }catch(e){ localStorage.removeItem('htd_pending_code'); }
}

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
   COACH — PROGRAMMING (builder, library, assignment)
================================================================ */
const BLOCK_NAMES=['Warm-up','Main','Finisher','Cool-down'];
const BLOCK_LIGHTEN={'Main':0,'Finisher':0.32,'Warm-up':0.55,'Cool-down':0.72};
function lighten(hex,t){
  const h=hex.replace('#','');
  const c=[0,2,4].map(i=>parseInt(h.substr(i,2),16));
  return 'rgb('+c.map(v=>Math.round(v+(255-v)*t)).join(',')+')';
}
function blockColor(type,blockName){
  const base=SPLIT_COLORS[type]||SPLIT_COLORS.hyrox;
  return lighten(base, BLOCK_LIGHTEN[blockName] ?? 0.4);
}
function normalizeBlocks(blocks){
  const byName={};
  (blocks||[]).forEach(b=>{
    let text=b.text;
    if(text==null && Array.isArray(b.exercises))
      text=b.exercises.map(exToPlainText).join('\n');
    const name=BLOCK_NAMES.includes(b.name)?b.name:(b.name==='Warm-up'?'Warm-up':'Main');
    byName[name]=(byName[name]?byName[name]+'\n':'')+(text||'');
  });
  return BLOCK_NAMES.map(n=>({name:n,text:byName[n]||''}));
}
let wkTemplates=[], wk=null, wkMode='template', wkIsNew=false, wkIntensity='race weight';

function modalityOptions(type){
  return type==='endurance'?ENDURANCE_MODS : type==='strength'?STRENGTH_FOCUSES : HYROX_FOCUSES;
}
function renderWkModalities(){
  const el=document.getElementById('wkModalities'); if(!el) return;
  el.innerHTML=modalityOptions(wk.workout_type).map(m=>
    `<button class="pill ${(wk.subtypes||[]).includes(m)?'active':''}" onclick="toggleWkModality('${m.replace(/'/g,"\\'")}')">${m}</button>`).join('');
}
function toggleWkModality(m){
  wk.subtypes=wk.subtypes||[];
  const i=wk.subtypes.indexOf(m);
  if(i>-1) wk.subtypes.splice(i,1); else wk.subtypes.push(m);
  renderWkModalities();
}
function newWorkout(){
  wk={id:null,title:'',workout_type:'hyrox',duration_min:60,objective:'',blocks:normalizeBlocks([]),stations:{},subtypes:[]};
  wkMode='template'; wkIsNew=true;
  openBuilder();
}
function openBuilder(){
  document.getElementById('wkList').style.display='none';
  document.querySelector('#coachProg .coach-toolbar').style.display='none';
  const lf=document.querySelector('#coachProg .lib-filters'); if(lf) lf.style.display='none';
  document.getElementById('wkBuilder').style.display='block';
  document.getElementById('wkTitle').value=wk.title||'';
  document.getElementById('wkDuration').value=wk.duration_min||60;
  document.getElementById('wkObjective').value=wk.objective||'';
  document.querySelectorAll('.wk-type').forEach(b=>b.classList.toggle('active',b.dataset.t===wk.workout_type));
  renderBlocks(); renderWkStations(); renderWkModalities();
}
function closeBuilder(){
  document.getElementById('wkBuilder').style.display='none';
  document.getElementById('wkList').style.display='grid';
  document.querySelector('#coachProg .coach-toolbar').style.display='flex';
  const lf=document.querySelector('#coachProg .lib-filters'); if(lf) lf.style.display='flex';
  document.querySelector('#coachProg .lib-filters').style.display='flex';
  loadTemplates();
}
function setWkType(t){
  wk.workout_type=t; wk.subtypes=[];
  document.querySelectorAll('.wk-type').forEach(b=>b.classList.toggle('active',b.dataset.t===t));
  renderBlocks(); renderWkModalities();
}
const DUR_RANGES=[[1,10],[10,20],[20,30],[30,45],[45,60],[60,75],[75,90],[90,999]];
let libFilters={type:null,dur:null,mods:[]};
async function loadTemplates(){
  const list=document.getElementById('wkList');
  list.innerHTML='<div class="empty-state">Loading…</div>';
  try{
    const d=await api('/api/workouts?action=templates');
    wkTemplates=d.templates||[];
  }catch(e){ list.innerHTML='<div class="empty-state">Could not load.</div>'; return; }
  renderLibFilters(); renderLibrary();
}
function renderLibFilters(){
  document.getElementById('libTypePills').innerHTML=['hyrox','endurance','strength'].map(t=>
    `<button class="pill ${libFilters.type===t?'active':''}" onclick="libSetType('${t}')">${t==='hyrox'?'Hyrox / Mix':cap(t)}</button>`).join('');
  document.getElementById('libDurPills').innerHTML=DUR_RANGES.map((r,i)=>
    `<button class="pill ${libFilters.dur===i?'active':''}" onclick="libSetDur(${i})">${r[1]===999?r[0]+'min+':r[0]+'–'+r[1]+'min'}</button>`).join('');
  const modEl=document.getElementById('libModPills');
  modEl.innerHTML = libFilters.type
    ? modalityOptions(libFilters.type).map(m=>`<button class="pill ${libFilters.mods.includes(m)?'active':''}" onclick="libToggleMod('${m.replace(/'/g,"\\'")}')">${m}</button>`).join('')
    : '';
}
function libSetType(t){ libFilters.type=libFilters.type===t?null:t; libFilters.mods=[]; renderLibFilters(); renderLibrary(); }
function libSetDur(i){ libFilters.dur=libFilters.dur===i?null:i; renderLibFilters(); renderLibrary(); }
function libToggleMod(m){
  const i=libFilters.mods.indexOf(m);
  if(i>-1) libFilters.mods.splice(i,1); else libFilters.mods.push(m);
  renderLibFilters(); renderLibrary();
}
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
    return `<div class="athlete-card wk-card" style="border-left-color:${col}" onclick="editTemplate(${i})">
      <div class="an"><span class="type-dot" style="background:${col}"></span>${esc(t.title||'Untitled')}</div>
      <div class="am">${t.workout_type==='hyrox'?'Hyrox / Mix':cap(t.workout_type||'')} · ${t.duration_min||'—'} min${(t.subtypes||[]).length?'<br>'+t.subtypes.slice(0,3).join(' · '):''}</div>
    </div>`;
  }).join('');
}
function editTemplate(i){
  const t=wkTemplates[i];
  wk={id:t.id,title:t.title,workout_type:t.workout_type,duration_min:t.duration_min,objective:t.objective||'',blocks:normalizeBlocks(t.blocks),stations:t.stations||{},subtypes:t.subtypes||[]};
  wkMode='template'; wkIsNew=false;
  openBuilder();
}
function updBlockText(i,v){ wk.blocks[i].text=v; }
function renderBlocks(){
  const wrap=document.getElementById('wkBlocks');
  wrap.innerHTML=wk.blocks.map((b,i)=>{
    const c=blockColor(wk.workout_type,b.name);
    return `<div class="blk" style="background:${lighten(SPLIT_COLORS[wk.workout_type]||'#888',0.92)};border-color:var(--hair)">
      <label style="color:${blockColor(wk.workout_type,'Main')}">${b.name}</label>
      <textarea placeholder="${b.name==='Main'?'The session…':'Optional'}" oninput="updBlockText(${i},this.value)">${esc(b.text)}</textarea>
    </div>`;
  }).join('');
}
function renderWkStations(){
  const g=document.getElementById('wkStations');
  const fields=[{k:'run_km',label:'Run km'},{k:'compromised_run_km',label:'Compromised run km'}]
    .concat(STATIONS.map(s=>({k:s.k,label:s.label+' '+s.unit})));
  g.innerHTML=fields.map(f=>`<div class="metric-field"><label>${f.label}</label>
    <input type="number" step="0.1" value="${wk.stations[f.k]??''}" oninput="wk.stations['${f.k}']=this.value===''?null:parseFloat(this.value)"></div>`).join('');
}
function setWkIntensity(v){
  wkIntensity=v;
  document.querySelectorAll('.wk-int').forEach(b=>b.classList.toggle('active',b.dataset.v===v));
}
function collectBuilder(){
  wk.title=document.getElementById('wkTitle').value;
  wk.duration_min=intOrNull(document.getElementById('wkDuration').value);
  wk.objective=document.getElementById('wkObjective').value;
}
async function generateWorkout(){
  collectBuilder();
  const msg=document.getElementById('wkGenMsg');
  if(!wk.objective.trim()){ msg.textContent='Describe the objective first.'; return; }
  msg.textContent='Generating…';
  try{
    const d=await api('/api/ai',{method:'POST',body:JSON.stringify({
      mode:'workout', duration_min:wk.duration_min, objective:wk.objective,
      workout_type:wk.workout_type, intensity:wkIntensity
    })});
    const g=d.workout||{};
    if(g.title && !wk.title){ wk.title=g.title; document.getElementById('wkTitle').value=g.title; }
    if(Array.isArray(g.blocks)) wk.blocks=normalizeBlocks(g.blocks);
    if(g.stations) wk.stations=g.stations;
    if(Array.isArray(g.modalities)) wk.subtypes=g.modalities.filter(m=>modalityOptions(wk.workout_type).includes(m));
    renderBlocks(); renderWkStations(); renderWkModalities();
    msg.textContent='Generated — edit anything, then save';
    setTimeout(()=>msg.textContent='',3000);
  }catch(e){ msg.textContent=e.message; }
}
function workoutText(){
  return wk.blocks.filter(b=>b.text&&b.text.trim()).map(b=>b.name+':\n'+b.text.trim()).join('\n\n');
}
async function quantifyWorkout(){
  collectBuilder();
  const msg=document.getElementById('wkMsg');
  const text=workoutText();
  if(!text.trim()){ msg.textContent='Write the workout first.'; return; }
  msg.textContent='Quantifying…';
  try{
    const d=await api('/api/ai',{method:'POST',body:JSON.stringify({mode:'text',text,workout_type:'hyrox'})});
    const x=d.extracted||{};
    ['ski_erg_m','sled_push_m','sled_pull_m','burpees_reps','row_erg_m','farmers_m','lunges_m','wallballs_reps','compromised_run_km'].forEach(k=>{
      if(x[k]!=null) wk.stations[k]=x[k];
    });
    renderWkStations();
    msg.textContent='Volumes updated'; setTimeout(()=>msg.textContent='',2500);
  }catch(e){ msg.textContent=e.message; }
}
function exToPlainText(ex){
  let s=ex.name||'';
  if(ex.sets&&ex.qty) s+=' — '+ex.sets+'×'+ex.qty+(ex.unit||'');
  else if(ex.qty) s+=' — '+ex.qty+(ex.unit||'');
  if(ex.load_pct) s+=' @'+ex.load_pct+'%';
  if(ex.zone) s+=' @'+ex.zone;
  return s;
}
async function saveTemplate(){
  collectBuilder();
  const msg=document.getElementById('wkMsg');
  msg.textContent='Saving…';
  try{
    if(wkMode==='assignment'){
      await api('/api/workouts',{method:'POST',body:JSON.stringify({
        action:'update-assignment', id:wk.assignment_id,
        title:wk.title, workout_type:wk.workout_type, duration_min:wk.duration_min,
        objective:wk.objective, blocks:wk.blocks, stations:wk.stations
      })});
      msg.textContent='Athlete copy updated';
    }else{
      const d=await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'save-template',workout:wk})});
      if(wkIsNew){
        msg.textContent='Saved ✓ — ready for the next one';
        setTimeout(()=>{ msg.textContent=''; newWorkout(); },1200);
        return;
      }
      if(d.workout) wk.id=d.workout.id;
      msg.textContent='Saved to library';
    }
    setTimeout(()=>msg.textContent='',2500);
  }catch(e){ msg.textContent=e.message; }
}

/* ---- assign modal ---- */
function openAssign(){
  collectBuilder();
  if(!wk.id){ document.getElementById('wkMsg').textContent='Save to library first, then assign.'; return; }
  document.getElementById('assignModal').style.display='flex';
  document.getElementById('assignDate').value=todayStr();
  const wrap=document.getElementById('assignAthletes');
  wrap.innerHTML = coachAthletes.length
    ? coachAthletes.map((a,i)=>{
        const nm=[a.first_name,a.last_name].filter(Boolean).join(' ')||a.email;
        return `<button class="pill" data-i="${i}" onclick="this.classList.toggle('active')">${esc(nm)}</button>`;
      }).join('')
    : '<div class="hint">No athletes linked yet.</div>';
}
function closeAssign(){ document.getElementById('assignModal').style.display='none'; }
async function doAssign(){
  const msg=document.getElementById('assignMsg');
  const ids=[...document.querySelectorAll('#assignAthletes .pill.active')].map(b=>coachAthletes[+b.dataset.i].id);
  const date=document.getElementById('assignDate').value;
  if(!ids.length||!date){ msg.textContent='Pick at least one athlete and a date.'; return; }
  msg.textContent='Assigning…';
  try{
    const d=await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'assign',workout_id:wk.id,athlete_ids:ids,date})});
    msg.textContent=`Assigned to ${d.assigned} athlete${d.assigned>1?'s':''}`;
    setTimeout(()=>{ msg.textContent=''; closeAssign(); },1600);
  }catch(e){ msg.textContent=e.message; }
}

/* ---- voice dictation for objective ---- */
let micActive=false, recognition=null;
function toggleMic(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const btn=document.getElementById('micBtn');
  if(!SR){ document.getElementById('wkGenMsg').textContent='Voice input not supported in this browser.'; return; }
  if(micActive){ recognition.stop(); return; }
  recognition=new SR();
  recognition.lang='fr-FR';
  recognition.interimResults=true; recognition.continuous=true;
  const field=document.getElementById('wkObjective');
  const base=field.value;
  recognition.onresult=e=>{
    let t=''; for(const r of e.results) t+=r[0].transcript;
    field.value=(base?base+' ':'')+t;
  };
  recognition.onend=()=>{ micActive=false; btn.style.background=''; };
  recognition.start(); micActive=true; btn.style.background='#e7f7ef';
}

/* ---- coach: race banner, week phases, weekly calendar, side panel ---- */
let wlWeek=mondayOf(todayStr()), caWlCache={}, caWeekAssignments=[];
function shiftWlWeek(n){ wlWeek=addDays(wlWeek,7*n); renderWlSection(); }
function renderRaceBanner(){
  const el=document.getElementById('caRaceBanner');
  if(!caCurrent.race_name){ el.innerHTML=''; return; }
  const du=caCurrent.race_date? daysUntil(caCurrent.race_date) : null;
  el.innerHTML=`<div class="race-banner">
    <span class="rb-name">${esc(caCurrent.race_name)}</span>
    <span class="rb-meta">${caCurrent.race_date?fmtDay(caCurrent.race_date):''}${(caCurrent.race_divisions||[]).length?' · '+caCurrent.race_divisions.join(' · '):''}</span>
    ${du!=null&&du>=0?`<span class="rb-days">${du} days out</span>`:''}
  </div>`;
}
async function renderWlSection(){
  document.getElementById('wlWeekLabel').textContent=fmtShort(wlWeek)+' – '+fmtShort(addDays(wlWeek,6));
  renderRaceBanner();
  try{
    const d=await api(`/api/workouts?action=assignments&athlete_id=${caCurrent.id}&start=${wlWeek}&end=${addDays(wlWeek,6)}`);
    caWeekAssignments=d.assignments||[];
  }catch(e){ caWeekAssignments=[]; }
  const pills=document.getElementById('wlPills');
  pills.innerHTML=PHASES.map(l=>`<button class="pill ${caWlCache[caCurrent.id+wlWeek]===l?'active':''}" onclick="setWeekLabel('${l}')">${l}</button>`).join('')+
    `<button class="pill" onclick="setWeekLabel(null)">Clear</button>`;
  renderCaCalendar();
}
function renderCaCalendar(){
  const grid=document.getElementById('caCalendar');
  const dows=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  grid.innerHTML=[0,1,2,3,4,5,6].map(i=>{
    const ds=addDays(wlWeek,i);
    const todays=caWeekAssignments.filter(a=>a.date===ds);
    return `<div class="cal-day ${ds===todayStr()?'today':''}" onclick="openDayPanel('${ds}')">
      <div class="cd-head">${dows[i]} ${parseDate(ds).getDate()}</div>
      ${todays.map(a=>{
        const col=SPLIT_COLORS[a.workout_type]||'#888';
        return `<div class="cal-wk" style="background:${col}" onclick="event.stopPropagation();openAssignmentPanel('${a.id}')">
          ${esc(a.title||'Workout')}
          <span class="cw-status">${a.status==='done'?'✓ Done'+(a.difficulty?' · '+a.difficulty+'/10':''):'Assigned'}${a.duration_min?' · '+a.duration_min+"'":''}</span>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}
async function setWeekLabel(l){
  try{
    await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'week-label',athlete_id:caCurrent.id,week_start:wlWeek,label:l})});
    caWlCache[caCurrent.id+wlWeek]=l;
    renderWlSection();
  }catch(e){}
}

/* ---- side panel ---- */
let sp={mode:null,assignment:null,date:null};
function openSidePanel(){ document.getElementById('sidePanel').classList.add('open'); }
function closeSidePanel(){ document.getElementById('sidePanel').classList.remove('open'); }
let spLibFilters={type:null,dur:null,mods:[],q:''};
function openDayPanel(date){
  sp={mode:'pick',date};
  spLibFilters={type:null,dur:null,mods:[],q:''};
  document.getElementById('spTitle').textContent=fmtDay(date);
  document.getElementById('spBody').innerHTML=`
    <button class="btn-slim" onclick="spBlank()">New workout for this day</button>
    <div class="section-sublabel" style="margin-top:18px">Or pick from library</div>
    <div class="lib-filters">
      <input class="text-input lib-search" type="text" placeholder="Search…" oninput="spLibFilters.q=this.value;renderSpLib()">
      <div class="pill-row wrap" id="spLibType"></div>
      <div class="pill-row wrap" id="spLibDur"></div>
      <div class="pill-row wrap" id="spLibMods"></div>
    </div>
    <div class="sp-lib" id="spLib"><div class="empty-state">Loading…</div></div>`;
  openSidePanel();
  api('/api/workouts?action=templates').then(d=>{
    wkTemplates=d.templates||[];
    renderSpLibFilters(); renderSpLib();
  }).catch(()=>{ document.getElementById('spLib').innerHTML='<div class="hint">Could not load library.</div>'; });
}
function renderSpLibFilters(){
  document.getElementById('spLibType').innerHTML=['hyrox','endurance','strength'].map(t=>
    `<button class="pill ${spLibFilters.type===t?'active':''}" onclick="spLibFilters.type=spLibFilters.type==='${t}'?null:'${t}';spLibFilters.mods=[];renderSpLibFilters();renderSpLib()">${t==='hyrox'?'Hyrox / Mix':cap(t)}</button>`).join('');
  document.getElementById('spLibDur').innerHTML=DUR_RANGES.map((r,i)=>
    `<button class="pill ${spLibFilters.dur===i?'active':''}" onclick="spLibFilters.dur=spLibFilters.dur===${i}?null:${i};renderSpLibFilters();renderSpLib()">${r[1]===999?r[0]+"'+":r[0]+'–'+r[1]+"'"}</button>`).join('');
  document.getElementById('spLibMods').innerHTML = spLibFilters.type
    ? modalityOptions(spLibFilters.type).map(m=>`<button class="pill ${spLibFilters.mods.includes(m)?'active':''}" onclick="spLibToggleMod('${m.replace(/'/g,"\\'")}')">${m}</button>`).join('')
    : '';
}
function spLibToggleMod(m){
  const i=spLibFilters.mods.indexOf(m);
  if(i>-1) spLibFilters.mods.splice(i,1); else spLibFilters.mods.push(m);
  renderSpLibFilters(); renderSpLib();
}
function renderSpLib(){
  const q=spLibFilters.q.toLowerCase().trim();
  const filtered=wkTemplates.filter(t=>{
    if(spLibFilters.type && t.workout_type!==spLibFilters.type) return false;
    if(spLibFilters.dur!=null){
      const [lo,hi]=DUR_RANGES[spLibFilters.dur]; const d=t.duration_min||0;
      if(!(d>=lo && (hi===999? true : d<=hi))) return false;
    }
    if(spLibFilters.mods.length && !spLibFilters.mods.every(m=>(t.subtypes||[]).includes(m))) return false;
    if(q){
      const hay=((t.title||'')+' '+normalizeBlocks(t.blocks).map(b=>b.text).join(' ')).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  document.getElementById('spLib').innerHTML = filtered.length
    ? filtered.map(t=>{
        const i=wkTemplates.indexOf(t);
        const col=SPLIT_COLORS[t.workout_type]||'#999';
        return `<div class="athlete-card wk-card" style="border-left-color:${col}" onclick="spFromTemplate(${i})">
          <div class="an"><span class="type-dot" style="background:${col}"></span>${esc(t.title||'Untitled')}</div>
          <div class="am">${t.duration_min||'—'} min</div></div>`;
      }).join('')
    : '<div class="hint">Nothing matches.</div>';
}
function spBlank(){
  spEdit({title:'',workout_type:'hyrox',duration_min:60,blocks:normalizeBlocks([]),stations:{},date:sp.date,status:'assigned'},true);
}
function spFromTemplate(i){
  const t=wkTemplates[i];
  spEdit({workout_id:t.id,title:t.title,workout_type:t.workout_type,duration_min:t.duration_min,
    blocks:normalizeBlocks(t.blocks),stations:t.stations||{},date:sp.date,status:'assigned'},true);
}
function openAssignmentPanel(id){
  const a=caWeekAssignments.find(x=>x.id===id); if(!a) return;
  spEdit({...a, blocks:normalizeBlocks(a.blocks)}, false);
}
function spEdit(a,isNew){
  sp={mode:isNew?'create':'edit',assignment:a,date:a.date};
  document.getElementById('spTitle').textContent=(isNew?'New — ':'')+fmtDay(a.date);
  const body=document.getElementById('spBody');
  body.innerHTML=`
    <input id="spWkTitle" class="text-input" type="text" placeholder="Workout title" value="${esc(a.title||'')}">
    <div class="pill-row" style="margin-bottom:12px">
      ${['hyrox','endurance','strength'].map(t=>`<button class="pill sp-type ${a.workout_type===t?'active':''}" data-t="${t}" onclick="spSetType('${t}')">${t==='hyrox'?'Hyrox / Mix':cap(t)}</button>`).join('')}
    </div>
    <div class="section-sublabel">Modalities</div>
    <div class="pill-row wrap" id="spModalities" style="margin-bottom:12px"></div>
    <div class="metric-field" style="max-width:140px;margin-bottom:12px"><label>Duration min</label>
      <input id="spDuration" type="number" inputmode="numeric" value="${a.duration_min??60}"></div>
    <div id="spBlocks"></div>
    <div class="section-card"><div class="section-label">Station volumes</div>
      <div class="hyrox-grid" id="spStations"></div>
      <button class="mini-btn" style="margin-top:10px" onclick="spQuantify()">Re-quantify with AI</button></div>
    <div class="sp-actions">
      ${a.workout_id
        ? `<button class="btn-slim" onclick="spSave('replace')">${sp.mode==='create'?'Assign':'Save'} & replace in library</button>
           <button class="btn-slim secondary" onclick="spSave('new')">${sp.mode==='create'?'Assign':'Save'} as new version</button>`
        : `<button class="btn-slim" onclick="spSave('new')">${sp.mode==='create'?'Assign':'Save'}</button>`}
      ${sp.mode==='edit'?'<button class="btn-slim danger" onclick="spDelete()">Remove</button>':''}
      <div id="spMsg" class="save-msg" style="margin:0;text-align:left"></div>
    </div>`;
  spRenderBlocks(); spRenderStations(); spRenderModalities();
  openSidePanel();
}
function spSetType(t){
  sp.assignment.workout_type=t; sp.assignment.subtypes=[];
  document.querySelectorAll('.sp-type').forEach(b=>b.classList.toggle('active',b.dataset.t===t));
  spRenderBlocks(); spRenderModalities();
}
function spRenderModalities(){
  const el=document.getElementById('spModalities'); if(!el) return;
  const a=sp.assignment;
  el.innerHTML=modalityOptions(a.workout_type).map(m=>
    `<button class="pill ${(a.subtypes||[]).includes(m)?'active':''}" onclick="spToggleModality('${m.replace(/'/g,"\\\\'")}')">${m}</button>`).join('');
}
function spToggleModality(m){
  const a=sp.assignment; a.subtypes=a.subtypes||[];
  const i=a.subtypes.indexOf(m);
  if(i>-1) a.subtypes.splice(i,1); else a.subtypes.push(m);
  spRenderModalities();
}
function spRenderBlocks(){
  const a=sp.assignment;
  document.getElementById('spBlocks').innerHTML=a.blocks.map((b,i)=>{
    const c=blockColor(a.workout_type,b.name);
    return `<div class="blk" style="background:${lighten(SPLIT_COLORS[a.workout_type]||'#888',0.92)};border-color:var(--hair)">
      <label style="color:${blockColor(a.workout_type,'Main')}">${b.name}</label>
      <textarea oninput="sp.assignment.blocks[${i}].text=this.value">${esc(b.text)}</textarea>
    </div>`;
  }).join('');
}
function spRenderStations(){
  const a=sp.assignment;
  const fields=[{k:'run_km',label:'Run km'},{k:'compromised_run_km',label:'Compromised run km'}]
    .concat(STATIONS.map(s=>({k:s.k,label:s.label+' '+s.unit})));
  document.getElementById('spStations').innerHTML=fields.map(f=>`<div class="metric-field"><label>${f.label}</label>
    <input type="number" step="0.1" value="${a.stations[f.k]??''}" oninput="sp.assignment.stations['${f.k}']=this.value===''?null:parseFloat(this.value)"></div>`).join('');
}
async function spQuantify(){
  const a=sp.assignment;
  const text=a.blocks.filter(b=>b.text&&b.text.trim()).map(b=>b.name+':\n'+b.text.trim()).join('\n\n');
  const msg=document.getElementById('spMsg');
  if(!text.trim()){ msg.textContent='Write the workout first.'; return; }
  msg.textContent='Quantifying…';
  try{
    const d=await api('/api/ai',{method:'POST',body:JSON.stringify({mode:'text',text,workout_type:'hyrox'})});
    const x=d.extracted||{};
    ['ski_erg_m','sled_push_m','sled_pull_m','burpees_reps','row_erg_m','farmers_m','lunges_m','wallballs_reps','compromised_run_km'].forEach(k=>{
      if(x[k]!=null) a.stations[k]=x[k];
    });
    spRenderStations();
    msg.textContent='Volumes updated'; setTimeout(()=>msg.textContent='',2500);
  }catch(e){ msg.textContent=e.message; }
}
async function spSave(libraryMode){
  const a=sp.assignment;
  if(libraryMode==='new') a.workout_id=null;   // force a fresh library entry
  a.title=document.getElementById('spWkTitle').value;
  a.duration_min=intOrNull(document.getElementById('spDuration').value);
  const msg=document.getElementById('spMsg');
  msg.textContent='Saving…';
  try{
    if(sp.mode==='create'){
      await api('/api/workouts',{method:'POST',body:JSON.stringify({
        action:'create-assignment', athlete_id:caCurrent.id, date:a.date, workout_id:a.workout_id||null,
        title:a.title, workout_type:a.workout_type, duration_min:a.duration_min,
        blocks:a.blocks, stations:a.stations, subtypes:a.subtypes||[]
      })});
    }else{
      await api('/api/workouts',{method:'POST',body:JSON.stringify({
        action:'update-assignment', id:a.id,
        title:a.title, workout_type:a.workout_type, duration_min:a.duration_min,
        blocks:a.blocks, stations:a.stations, subtypes:a.subtypes||[]
      })});
    }
    // every workout created or edited here is also captured in the coach's library
    saveToLibraryFromPanel(a).catch(()=>{});
    msg.textContent='Saved';
    closeSidePanel(); renderWlSection();
  }catch(e){ msg.textContent=e.message; }
}
async function saveToLibraryFromPanel(a){
  const payload={ id: a.workout_id||undefined, title:a.title, workout_type:a.workout_type,
    duration_min:a.duration_min, objective:a.objective||null,
    blocks:a.blocks, stations:a.stations, subtypes:a.subtypes||[] };
  const d=await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'save-template',workout:payload})});
  if(d.workout && !a.workout_id) a.workout_id=d.workout.id;
}
async function spDelete(){
  try{
    await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'delete-assignment',id:sp.assignment.id})});
    closeSidePanel(); renderWlSection();
  }catch(e){}
}

/* ---- coach: landing page publisher ---- */
let lpPhotoUrl=null;
async function loadMyLanding(){
  try{
    const d=await api('/api/workouts?action=my-landing');
    const L=d.landing;
    if(L){
      document.getElementById('lpSlug').value=L.slug||'';
      document.getElementById('lpHeadline').value=L.headline||'';
      document.getElementById('lpBio').value=L.bio||'';
      document.getElementById('lpIg').value=L.ig_url||'';
      lpPhotoUrl=L.photo_url||null;
      if(L.photo_url){ const p=document.getElementById('lpPhotoPreview'); p.src=L.photo_url; p.style.display='block'; }
      if(L.published) showLpUrl(L.slug);
    }
  }catch(e){}
}
function showLpUrl(slug){
  document.getElementById('lpUrl').innerHTML='Live at <b>'+location.origin+'/c/'+slug+'</b>';
}
async function uploadLandingPhoto(ev){
  const file=ev.target.files[0]; ev.target.value='';
  if(!file) return;
  const msg=document.getElementById('lpMsg');
  msg.textContent='Uploading…';
  const b64=await new Promise((res,rej)=>{
    const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(file);
  });
  try{
    const d=await api('/api/upload-logo',{method:'POST',body:JSON.stringify({image:b64,content_type:file.type||'image/jpeg',kind:'photo'})});
    lpPhotoUrl=d.url||d.logo_url;
    const p=document.getElementById('lpPhotoPreview'); p.src=lpPhotoUrl; p.style.display='block';
    msg.textContent='Photo uploaded'; setTimeout(()=>msg.textContent='',2000);
  }catch(e){ msg.textContent=e.message; }
}
async function publishLanding(){
  const msg=document.getElementById('lpMsg');
  msg.textContent='Publishing…';
  try{
    const d=await api('/api/workouts',{method:'POST',body:JSON.stringify({
      action:'publish-landing',
      slug:document.getElementById('lpSlug').value||null,
      headline:document.getElementById('lpHeadline').value||null,
      bio:document.getElementById('lpBio').value||null,
      ig_url:document.getElementById('lpIg').value||null,
      photo_url:lpPhotoUrl, published:true
    })});
    msg.textContent='Published';
    document.getElementById('lpSlug').value=d.landing.slug;
    showLpUrl(d.landing.slug);
    setTimeout(()=>msg.textContent='',2500);
  }catch(e){ msg.textContent=e.message; }
}
/* ================================================================
   COACH — FINANCE
================================================================ */
const CURRENCY_SYMBOLS={EUR:'€',USD:'$',GBP:'£',CHF:'Fr ',CAD:'$',AUD:'$'};
function fmtMoney(amount){
  const cur=profile.currency||'EUR';
  const sym=CURRENCY_SYMBOLS[cur]||(cur+' ');
  const rounded=Math.round(amount);
  return (cur==='CHF'?sym:sym)+rounded.toLocaleString();
}
function monthKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function monthLabel(key){
  const [y,m]=key.split('-').map(Number);
  return new Date(y,m-1,1).toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
}
let finPeriod='l12m';
function setFinPeriod(p){
  finPeriod=p;
  document.querySelectorAll('.fin-period').forEach(b=>b.classList.toggle('active',b.dataset.p===p));
  document.getElementById('finCustomRange').style.display = p==='custom'?'flex':'none';
  if(p!=='custom') loadFinance();
}
function financeMonthRange(){
  const now=new Date();
  if(finPeriod==='ytd'){
    const months=[];
    for(let m=0;m<12;m++) months.push(monthKey(new Date(now.getFullYear(),m,1)));
    return months;
  }
  if(finPeriod==='custom'){
    const s=document.getElementById('finRangeStart').value, e=document.getElementById('finRangeEnd').value;
    if(!s||!e) return [monthKey(now)];
    const months=[]; let [y,m]=s.split('-').map(Number);
    const [ey,em]=e.split('-').map(Number);
    while(y<ey || (y===ey && m<=em)){
      months.push(y+'-'+String(m).padStart(2,'0'));
      m++; if(m>12){ m=1; y++; }
    }
    return months;
  }
  // l12m default
  const months=[];
  for(let i=11;i>=0;i--){ const d=new Date(now.getFullYear(),now.getMonth()-i,1); months.push(monthKey(d)); }
  return months;
}
/* Estimated revenue: each athlete contributes their current monthly_price to every
   month from their start_date onward. For months before the current one we assume
   they were active (we don't track a status-change date); the current month only
   counts if status is still 'active'. This is an estimate, not an invoicing ledger. */
function financeTrend(months){
  const curMonthKey=monthKey(new Date());
  const activeSum = coachAthletes.reduce((sum,a)=>{
    const c=a.crm;
    return (c && c.status==='active' && c.monthly_price) ? sum + (Number(c.monthly_price)||0) : sum;
  },0);
  return months.map(mk=>{
    if(mk > curMonthKey) return { month:mk, revenue:activeSum, projected:true };
    let revenue=0;
    coachAthletes.forEach(a=>{
      const c=a.crm; if(!c || !c.start_date || !c.monthly_price) return;
      const startKey=c.start_date.slice(0,7);
      if(startKey > mk) return;
      if(mk === curMonthKey && c.status !== 'active') return;
      revenue += Number(c.monthly_price)||0;
    });
    return { month:mk, revenue, projected:false };
  });
}
async function loadFinance(){
  const wrap=document.getElementById('finContent');
  wrap.innerHTML='<div class="empty-state">Loading…</div>';
  if(!coachAthletes.length){
    try{ const d=await api('/api/coach?action=athletes'); coachAthletes=d.athletes||[]; }catch(e){}
  }
  if(!coachAthletes.length){
    wrap.innerHTML='<div class="empty-state">No athletes yet — revenue tracks once athletes join and you set their price in CRM.</div>';
    return;
  }
  const months=financeMonthRange();
  const trend=financeTrend(months);
  const curMonthKey=monthKey(new Date());
  const mrr=trend.find(t=>t.month===curMonthKey)?.revenue ?? financeTrend([curMonthKey])[0].revenue;
  const activeCount=coachAthletes.filter(a=>a.crm && a.crm.status==='active').length;
  const churnedCount=coachAthletes.filter(a=>a.crm && a.crm.status==='churned').length;
  const avgPerAthlete=activeCount? mrr/activeCount : 0;
  const totalInPeriod=trend.reduce((a,t)=>a+t.revenue,0);

  let html=`<div class="stat-hero">
    <div class="stat-tile"><div class="v">${fmtMoney(mrr)}</div><div class="l">Monthly revenue (est.)</div></div>
    <div class="stat-tile"><div class="v">${activeCount}</div><div class="l">Active athletes</div></div>
    <div class="stat-tile"><div class="v">${fmtMoney(avgPerAthlete)}</div><div class="l">Avg / athlete</div></div>
    <div class="stat-tile"><div class="v">${churnedCount}</div><div class="l">Currently churned</div></div>
  </div>`;

  const max=Math.max(...trend.map(t=>t.revenue),1);
  html+=`<div class="section-card"><div class="chart-title">Revenue trend</div><div class="vbars" style="height:112px">`+
    trend.map(t=>`<div class="vbar-col">
      <div class="vbar-lbl ${t.projected?'projected-val':''}" style="margin-bottom:3px;color:var(--muted)">${t.revenue>0?(t.projected?'est. ':'')+fmtMoney(t.revenue):''}</div>
      <div class="vbar ${t.projected?'projected':''}" style="height:${Math.max(2,Math.round(t.revenue/max*100))}%"></div>
      <div class="vbar-lbl">${monthLabel(t.month)}</div></div>`).join('')+
    `</div></div>
    <div class="hint">Total over period: ${fmtMoney(totalInPeriod)}. Estimated from each athlete's start date, current price, and status${finPeriod==='ytd'?' — remaining months project current active revenue with no churn':''}. Not a payment ledger.</div>`;

  wrap.innerHTML=html;
}


/* ================================================================
   RUN PACES (VMA / Karvonen) + LIFT MAXES
================================================================ */
const PACE_ZONES=[
  {z:'I1',name:'Endurance fondamentale',vma:[40,60], hrr:[null,70]},
  {z:'I2',name:'Capacité aérobie 1',    vma:[60,75], hrr:[70,80]},
  {z:'I3',name:'Capacité aérobie 2',    vma:[75,82], hrr:[80,90]},
  {z:'I4',name:'Seuil anaérobie',       vma:[82,90], hrr:[90,94]},
  {z:'I5',name:'PMA / VMA',             vma:[90,100],hrr:[94,97]},
  {z:'I6',name:'Anaérobie lactique',    vma:[100,120],hrr:[97,100]},
];
const LIFTS=[
  {k:'deadlift',label:'Deadlift'},{k:'back_squat',label:'Back squat'},
  {k:'front_squat',label:'Front squat'},{k:'bench',label:'Bench'},{k:'strict_press',label:'Strict press'}
];
function paceFromSpeed(kmh){ if(!kmh||kmh<=0) return '—'; return mmss(3600/kmh/60*60); }
function splitTime(distKm,kmh){ if(!kmh) return '—'; const s=distKm/kmh*3600; return s>=60? mmss(s) : Math.round(s)+'s'; }
function karvonen(pct){ 
  const r=parseFloat(document.getElementById('setFcRest').value)||profile.fc_rest,
        m=parseFloat(document.getElementById('setFcMax').value)||profile.fc_max;
  if(!r||!m) return null;
  return Math.round(r+pct/100*(m-r));
}
function renderPaces(){
  const el=document.getElementById('pacesTable'); if(!el) return;
  const vma=parseFloat(document.getElementById('setVma').value);
  if(!vma){ el.innerHTML='<div class="hint">Enter your VMA to see your zone paces.</div>'; return; }
  let rows='';
  PACE_ZONES.forEach(pz=>{
    const sLo=vma*pz.vma[0]/100, sHi=vma*pz.vma[1]/100;
    const hrLo=pz.hrr[0]!=null?karvonen(pz.hrr[0]):null, hrHi=karvonen(pz.hrr[1]);
    const hr=hrHi? (hrLo? hrLo+'–'+hrHi : '≤'+hrHi) : '—';
    const mid=(sLo+sHi)/2;
    rows+=`<tr>
      <td class="pz">${pz.z}</td>
      <td>${pz.vma[0]}–${pz.vma[1]}%</td>
      <td class="pv">${paceFromSpeed(sHi)}–${paceFromSpeed(sLo)}</td>
      <td class="pv">${hr}</td>
      <td class="pv">${splitTime(1,mid)}</td>
      <td class="pv">${splitTime(0.4,mid)}</td>
    </tr>`;
  });
  el.innerHTML=`<table class="paces-table">
    <tr><th>Zone</th><th>%VMA</th><th>Pace /km</th><th>HR bpm</th><th>1km</th><th>400m</th></tr>${rows}</table>`;
}
function zonePaceRange(zoneKey, vma){
  const pz=PACE_ZONES.find(p=>p.z===zoneKey); if(!pz||!vma) return null;
  return paceFromSpeed(vma*pz.vma[1]/100)+'–'+paceFromSpeed(vma*pz.vma[0]/100)+'/km';
}
function renderMaxesGrid(){
  const g=document.getElementById('maxesGrid'); if(!g) return;
  const mx=profile.maxes||{};
  g.innerHTML=LIFTS.map(l=>`<div class="macro-field"><label>${l.label}</label>
    <input id="max_${l.k}" type="number" inputmode="decimal" step="0.5" value="${mx[l.k]??''}"></div>`).join('');
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
function updateWizAge(){
  const a=ageFromDob(document.getElementById('wizDob').value);
  document.getElementById('wizAgeDisplay').textContent = a!=null? a+' years old' : '';
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
  const firstName=document.getElementById('wizFirstName').value.trim();
  const lastName=document.getElementById('wizLastName').value.trim();
  const dob=document.getElementById('wizDob').value;
  const city=document.getElementById('wizCity').value.trim();
  const country=document.getElementById('wizCountry').value.trim();
  try{
    await api('/api/profile',{method:'PUT',body:JSON.stringify({
      onboarded:true, streak_target:wizTarget,
      race_name:raceName||null, race_date:raceDate||null,
      training_phase:profile.training_phase||null,
      race_divisions:profile.race_divisions||[],
      first_name:firstName||null, last_name:lastName||null,
      dob:dob||null, city:city||null, country:country||null
    })});
  }catch(e){}
  profile.onboarded=true; profile.streak_target=wizTarget;
  if(raceName) profile.race_name=raceName;
  if(raceDate) profile.race_date=raceDate;
  profile.first_name=firstName||null; profile.last_name=lastName||null;
  profile.dob=dob||null; profile.city=city||null; profile.country=country||null;
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
function cardBrand(){
  if(coachInfo && coachInfo.program_name){
    return `<div class="c-brand">${esc(coachInfo.program_name).toUpperCase()}${levelTag()}</div>
      <div class="c-brand" style="margin-top:5px;font-size:6px;opacity:.7">OCTA.</div>`;
  }
  return `<div class="c-brand">OCTA.${levelTag()}</div>`;
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
   ATHLETE — ASSIGNED WORKOUTS + WEEK LABELS
================================================================ */
let myAssignments=[], weekLabelMap={};
async function loadAssignments(){
  try{
    const d=await api(`/api/workouts?action=my-assignments&start=${weekStart}&end=${addDays(weekStart,6)}`);
    myAssignments=d.assignments||[];
    weekLabelMap={};
    (d.labels||[]).forEach(l=>weekLabelMap[l.week_start]=l.label);
  }catch(e){ myAssignments=[]; }
  renderWeekLabelChip();
  renderAssigned();
}
function renderWeekLabelChip(){
  let chip=document.getElementById('weekLabelChip');
  const label=weekLabelMap[weekStart];
  if(!chip){
    const strip=document.getElementById('weekStrip');
    strip.insertAdjacentHTML('afterend','<div id="weekLabelChip" class="week-label-chip" style="display:none"></div>');
    chip=document.getElementById('weekLabelChip');
  }
  if(label){ chip.textContent=label+' WEEK'; chip.style.display='block'; }
  else chip.style.display='none';
}
function resolveExText(ex){
  let main='<b>'+esc(ex.name||'')+'</b>';
  const parts=[];
  if(ex.sets&&ex.qty!=null) parts.push(ex.sets+'×'+ex.qty+(ex.unit&&ex.unit!=='reps'?ex.unit:''));
  else if(ex.qty!=null) parts.push(ex.qty+(ex.unit&&ex.unit!=='reps'?ex.unit:' reps'));
  if(ex.load_pct) parts.push('@'+ex.load_pct+'%');
  if(ex.zone) parts.push('@'+ex.zone);
  return main+(parts.length?' — '+parts.join(' · '):'');
}
function assignedBlocksHTML(a){
  const blocks=normalizeBlocks(a.blocks).filter(b=>b.text&&b.text.trim());
  return blocks.map(b=>{
    const c=blockColor(a.workout_type||'hyrox',b.name);
    return `<div style="border-left:3px solid ${c};padding-left:10px;margin:10px 0">
      <div class="aw-block" style="margin-top:0">${esc(b.name)}</div>
      <div class="aw-ex" style="white-space:pre-line">${esc(b.text.trim())}</div>
    </div>`;
  }).join('');
}
function athleteRefFooter(){
  const bits=[];
  if(profile.vma){
    const zs=['I3','I4','I5'].map(z=>{
      const pr=zonePaceRange(z,profile.vma);
      return pr? z+' '+pr : null;
    }).filter(Boolean).join(' · ');
    if(zs) bits.push('Your paces: '+zs);
  }
  const mx=profile.maxes||{};
  const lifts=LIFTS.filter(l=>mx[l.k]).map(l=>l.label+' '+mx[l.k]+'kg').join(' · ');
  if(lifts) bits.push('1RM: '+lifts);
  if(!bits.length) return '';
  return `<div style="margin-top:12px;font-size:10px;line-height:1.7;color:rgba(255,255,255,.45)">${bits.join('<br>')}</div>`;
}
function renderAssigned(){
  const wrap=document.getElementById('assignedWrap'); if(!wrap) return;
  const todays=myAssignments.filter(a=>a.date===selectedDate);
  if(!todays.length){ wrap.innerHTML=''; return; }
  wrap.innerHTML=todays.map((a,i)=>{
    const done=a.status==='done';
    const col=SPLIT_COLORS[a.workout_type]||'#888';
    return `<div class="assigned-card" style="border-top:3px solid ${col}">
      <div class="aw-type">${coachInfo&&coachInfo.program_name?esc(coachInfo.program_name):'Assigned workout'} · ${a.workout_type==='hyrox'?'Hyrox / Mix':cap(a.workout_type||'')}${a.duration_min?' · '+a.duration_min+' min':''}</div>
      <div class="aw-title">${esc(a.title||'Workout')}</div>
      ${assignedBlocksHTML(a)}
      ${athleteRefFooter()}
      ${done
        ? `<span class="aw-done-tag">Done${a.difficulty?' · '+a.difficulty+'/10':''}</span>`
        : `<div class="assigned-done">
             <span style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.5)">Difficulty</span>
             <input type="range" min="1" max="10" value="6" oninput="this.nextElementSibling.textContent=this.value" id="diff_${a.id}">
             <span class="dv">6</span>
           </div>
           <button class="cta" onclick="markDone('${a.id}',${i})">Mark done</button>`}
    </div>`;
  }).join('');
}
async function markDone(id, idx){
  const a=myAssignments.find(x=>x.id===id); if(!a) return;
  const diff=parseInt((document.getElementById('diff_'+id)||{}).value)||null;
  try{
    await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'complete',id,difficulty:diff})});
    a.status='done'; a.difficulty=diff;
    // prefill a session from the assignment
    const s=blankSession();
    s.name=a.title||''; s.workout_type=a.workout_type||'hyrox';
    if(Array.isArray(a.subtypes)&&a.subtypes.length) s.subtypes=a.subtypes.slice();
    s.duration_min=a.duration_min??''; s.rpe=diff??''; s._rpeAuto=false;
    s.workout_desc=normalizeBlocks(a.blocks).filter(b=>b.text&&b.text.trim()).map(b=>b.name+':\n'+b.text.trim()).join('\n\n');
    const st=a.stations||{};
    ['ski_erg_m','sled_push_m','sled_pull_m','burpees_reps','row_erg_m','farmers_m','lunges_m','wallballs_reps'].forEach(k=>{ if(st[k]!=null) s.stations[k]=st[k]; });
    if(st.compromised_run_km!=null) s.compromised_run_km=st.compromised_run_km;
    if(s.workout_type==='endurance' && st.run_km!=null){ s.volume=st.run_km; s.subtypes=['Run']; }
    // replace an untouched blank session or append
    if(daySessions.length===1 && !daySessions[0].name && !daySessions[0].duration_min) daySessions[0]=s;
    else if(daySessions.length<3) daySessions.push(s);
    renderSessions(); renderAssigned();
    document.getElementById('saveMsg').textContent='Session pre-filled from the workout — review and save your day';
    setTimeout(()=>document.getElementById('saveMsg').textContent='',3500);
    // AI fallback: infer modalities from the main text when the workout has none
    if(!s.subtypes.length && s.workout_desc){
      api('/api/ai',{method:'POST',body:JSON.stringify({mode:'modalities',text:s.workout_desc,workout_type:s.workout_type})})
        .then(d=>{
          if(Array.isArray(d.modalities)&&d.modalities.length){
            const idx=daySessions.indexOf(s);
            if(idx>-1){ daySessions[idx].subtypes=d.modalities; renderSessions(); }
          }
        }).catch(()=>{});
    }
  }catch(e){
    document.getElementById('saveMsg').textContent=e.message;
  }
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

/* Builds the full stats HTML (hero tiles + all charts) — shared by athlete Stats tab and coach athlete view. */
function statsBlockHTML(sessions, phys, start, end, prev){
  const st=computeStats(sessions,phys,start,end);
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

  const spTot=st.splitMin.endurance+st.splitMin.hyrox+st.splitMin.strength;
  if(spTot>0){
    html+=`<div class="section-card"><div class="chart-title">Training split</div>`+
      statStackedLine([
        {label:'Endurance',value:st.splitMin.endurance,color:SPLIT_COLORS.endurance},
        {label:'Hyrox',value:st.splitMin.hyrox,color:SPLIT_COLORS.hyrox},
        {label:'Strength',value:st.splitMin.strength,color:SPLIT_COLORS.strength},
      ])+`</div>`;
  }

  const zTot=st.zoneMin.reduce((a,b)=>a+b,0);
  if(zTot>0){
    html+=`<div class="section-card"><div class="chart-title">Time in zones</div>`+
      statStackedLine(st.zoneMin.map((m,z)=>({label:'Z'+(z+1),value:m,color:ZONE_COLORS[z]})))+`</div>`;
  }

  const rzTot=st.runZoneMin.reduce((a,b)=>a+b,0);
  if(rzTot>0){
    html+=`<div class="section-card"><div class="chart-title">Run — time in zones</div>`+
      statStackedLine(st.runZoneMin.map((m,z)=>({label:'Z'+(z+1),value:m,color:ZONE_COLORS[z]})))+`</div>`;
  }

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

  html+=pulseChartHTML(sessions,phys,start,end);
  return html;
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
  let prev=null;
  if(statsPeriod!=='custom'){
    const spanDays=Math.round((parseDate(end)-parseDate(start))/86400000)+1;
    const pStart=addDays(start,-spanDays), pEnd=addDays(start,-1);
    try{
      const pd=await api(`/api/get-data?start=${pStart}&end=${pEnd}`);
      if((pd.sessions||[]).length) prev=computeStats(pd.sessions||[],pd.physiology||[],pStart,pEnd);
    }catch(e){}
  }
  wrap.innerHTML=statsBlockHTML(sessions,phys,start,end,prev);
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
  const wkPhase = coachInfo ? weekLabelMap[mondayOf(todayStr())] : null;
  const phase = wkPhase || profile.training_phase;
  if(phase && phase!=='Race') bits.push(phase);
  if(profile.race_name){
    bits.push(profile.race_name);
    if(profile.race_divisions&&profile.race_divisions.length) bits.push(profile.race_divisions.join(' · '));
    if(profile.race_date){ const du=daysUntil(profile.race_date); if(du>=0) bits.push(du+' days out'); }
  }
  return bits.join('<span class="sep">·</span>');
}
function logoImg(){
  const url = (coachInfo && coachInfo.logo_url) || profile.logo_url;
  return url? `<img class="c-logo" src="${url}" crossorigin="anonymous">` : '';
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
    ${cardBrand()}`;
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
    ${cardBrand()}`;
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
      const hoursLbl = sharePeriod==='week';
      inner+=`<div class="c-chart-lbl">Training time</div><div class="c-vbars" style="${hoursLbl?'height:66px':''}">`+
        buckets.map(b=>`<div class="c-vbar-col">
          ${hoursLbl?`<div class="c-vbar-lbl" style="margin-bottom:3px">${b.v>0?(b.v/60).toFixed(1):''}</div>`:''}
          <div class="c-vbar" style="height:${max?Math.max(3,Math.round(b.v/max*100)):3}%"></div>
          <div class="c-vbar-lbl">${b.l}</div></div>`).join('')+`</div>`;
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
  inner+=cardBrand();
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
  a.download='octa-'+sharePeriod+'-'+shareAnchor+'.png';
  a.click();
}

/* ================================================================
   SETTINGS
================================================================ */
let phaseSel=null, divisionSel=[];
let targetSel=4;
function updateSetAge(){
  const a=ageFromDob(document.getElementById('setDob').value);
  document.getElementById('setAgeDisplay').textContent = a!=null? a+' years old' : '';
}
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
  document.getElementById('setFirstName').value=profile.first_name??'';
  document.getElementById('setLastName').value=profile.last_name??'';
  document.getElementById('setDob').value=profile.dob??'';
  document.getElementById('setCity').value=profile.city??'';
  document.getElementById('setCountry').value=profile.country??'';
  updateSetAge();
  document.getElementById('setHeight').value=profile._height??'';
  document.getElementById('setWeight').value=profile._weight??'';
  document.getElementById('setVma').value=profile.vma??'';
  document.getElementById('setFcRest').value=profile.fc_rest??'';
  document.getElementById('setFcMax').value=profile.fc_max??'';
  renderPaces(); renderMaxesGrid();
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
    if(img){ img.src=profile.logo_url; img.style.display='block'; }
  }
}
async function saveSettings(){
  const msg=document.getElementById('settingsMsg');
  msg.textContent='Saving…';
  const body={
    first_name:document.getElementById('setFirstName').value||null,
    last_name:document.getElementById('setLastName').value||null,
    dob:document.getElementById('setDob').value||null,
    city:document.getElementById('setCity').value||null,
    country:document.getElementById('setCountry').value||null,
    vma:numOrNull(document.getElementById('setVma').value),
    fc_rest:intOrNull(document.getElementById('setFcRest').value),
    fc_max:intOrNull(document.getElementById('setFcMax').value),
    maxes:LIFTS.reduce((o,l)=>{const v=numOrNull(document.getElementById('max_'+l.k).value); if(v!=null)o[l.k]=v; return o;},{}),
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
    profile.maxes=body.maxes;
    profile._weight=body.weight_kg; profile._height=body.height_cm;
    onHrvInput();
    if(coachAthleteHeaderName) coachAthleteHeaderName();
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
    if(img){ img.src=d.logo_url; img.style.display='block'; }
    const cimg=document.getElementById('csLogoPreview');
    if(cimg){ cimg.src=d.logo_url; cimg.style.display='block'; }
    msg.textContent='Logo saved';
    setTimeout(()=>msg.textContent='',2000);
  }catch(e){ msg.textContent='Upload failed — '+e.message; }
}
