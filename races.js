/* ================================================================
   OCTA. races.js — Race calendar (Week 3 Phase 2)
   Requires perf.js loaded first (reuses perfTimeSelects/perfReadTime).
   - Athlete Settings: "Race calendar" card (add/edit/delete races)
   - Nearest future race drives the card countdown (in-memory override
     of profile.race_name/race_date/race_divisions — card code untouched)
   - Coach athlete view: race banner lists upcoming races
================================================================ */

const RACE_DIVISIONS = ['Solo Pro','Solo Open','Pro Doubles','Open Doubles','Mixed Doubles'];
const RACE_PRIORITIES = ['A','B','C'];
let myRaces = [];
let raceDraft = null;   // race being edited/created

/* ---------- date dropdowns (dd/mm/yyyy, future-oriented years) ---------- */
function raceDateSelects(idBase, value){
  let d=null,m=null,y=null;
  if(value){ const p=value.split('-'); y=parseInt(p[0]); m=parseInt(p[1]); d=parseInt(p[2]); }
  const dayOpts=Array.from({length:31},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===d?'selected':''}>${n}</option>`).join('');
  const monOpts=MONTH_NAMES.map((n,i)=>`<option value="${i+1}" ${i+1===m?'selected':''}>${n}</option>`).join('');
  const curY=new Date().getFullYear();
  const yearOpts=Array.from({length:4},(_,i)=>curY+i).map(n=>`<option value="${n}" ${n===y?'selected':''}>${n}</option>`).join('');
  return `<div class="dob-selects">
    <select id="${idBase}_d"><option value="">DD</option>${dayOpts}</select>
    <select id="${idBase}_m"><option value="">MM</option>${monOpts}</select>
    <select id="${idBase}_y"><option value="">YYYY</option>${yearOpts}</select>
  </div>`;
}
function raceDateRead(idBase){
  const d=document.getElementById(idBase+'_d').value, m=document.getElementById(idBase+'_m').value, y=document.getElementById(idBase+'_y').value;
  if(!d||!m||!y) return null;
  return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}

/* ---------- data ---------- */
async function fetchRaces(athleteId){
  const q = athleteId ? ('&athlete_id='+athleteId) : '';
  const d = await api('/api/workouts?action=races'+q);
  return d.races || [];
}
function nextFutureRace(races){
  const today = todayStr();
  return races.filter(r=>r.race_date && r.race_date>=today)
              .sort((a,b)=>a.race_date<b.race_date?-1:1)[0] || null;
}
function applyRaceCountdown(){
  const next = nextFutureRace(myRaces);
  if(next){
    profile.race_name = next.name;
    profile.race_date = next.race_date;
    profile.race_divisions = next.divisions || [];
  }
}

/* ---------- athlete init (hooked from fillSettings) ---------- */
async function initRaces(){
  try{ myRaces = await fetchRaces(); }catch(e){ myRaces=[]; }
  // one-time auto-convert of the legacy single race field
  if(!myRaces.length && profile.race_name){
    try{
      const d = await api('/api/workouts',{method:'POST',body:JSON.stringify({
        action:'save-race', name:profile.race_name, race_date:profile.race_date||null,
        divisions:profile.race_divisions||[], priority:'A'
      })});
      if(d.race) myRaces=[d.race];
    }catch(e){}
  }
  applyRaceCountdown();
  renderRacesCard();
}

/* ---------- athlete Settings card ---------- */
function renderRacesCard(){
  const perfHost=document.getElementById('perfCardHost');
  if(!perfHost) return;
  let host=document.getElementById('racesCardHost');
  if(!host){
    perfHost.closest('.section-card').insertAdjacentHTML('afterend',
      '<div class="section-card"><div class="section-label">Race calendar</div><div id="racesCardHost"></div></div>');
    host=document.getElementById('racesCardHost');
  }
  const today=todayStr();
  const sorted=[...myRaces].sort((a,b)=>(a.race_date||'9999')<(b.race_date||'9999')?-1:1);
  host.innerHTML=`
    ${sorted.length? sorted.map(r=>{
      const past=r.race_date && r.race_date<today;
      return `<div class="race-row ${past?'past':''}">
        <div class="race-row-main">
          <div class="race-row-name">${r.priority?`<span class="race-prio p${r.priority}">${r.priority}</span>`:''}${esc(r.name)}</div>
          <div class="race-row-meta">${r.race_date?fmtDay(r.race_date):'Date TBC'}${r.location?' · '+esc(r.location):''}${(r.divisions||[]).length?' · '+r.divisions.join(' · '):''}${r.goal_time?' · Goal '+r.goal_time:''}</div>
        </div>
        <button class="mini-btn" onclick="editRace('${r.id}')">Edit</button>
        <button class="mini-btn" onclick="deleteRace('${r.id}')">✕</button>
      </div>`;
    }).join('') : '<div class="hint">No races yet — add your next one.</div>'}
    <div id="raceForm"></div>
    <button id="raceAddBtn" class="mini-btn" style="margin-top:10px" onclick="newRace()">+ Add race</button>`;
}
function newRace(){
  raceDraft={ id:null, name:'', race_date:null, divisions:[], priority:null, location:'', goal_time:null };
  renderRaceForm();
}
function editRace(id){
  const r=myRaces.find(x=>x.id===id); if(!r) return;
  raceDraft=JSON.parse(JSON.stringify(r));
  renderRaceForm();
}
function renderRaceForm(){
  document.getElementById('raceAddBtn').style.display='none';
  document.getElementById('raceForm').innerHTML=`
    <div class="race-form">
      <input id="raceName" class="text-input" type="text" placeholder="Race name (e.g. Hyrox Paris)" value="${esc(raceDraft.name||'')}">
      <div class="section-sublabel">Date</div>
      ${raceDateSelects('raceDate', raceDraft.race_date)}
      <div class="section-sublabel">Divisions</div>
      <div class="pill-row wrap">
        ${RACE_DIVISIONS.map(dv=>`<button class="pill ${raceDraft.divisions.includes(dv)?'active':''}" onclick="raceToggleDiv('${dv}')">${dv}</button>`).join('')}
      </div>
      <div class="section-sublabel">Priority</div>
      <div class="pill-row">
        ${RACE_PRIORITIES.map(p=>`<button class="pill ${raceDraft.priority===p?'active':''}" onclick="racePickPrio('${p}')">${p}</button>`).join('')}
      </div>
      <input id="raceLocation" class="text-input" type="text" placeholder="Location (city)" value="${esc(raceDraft.location||'')}" style="margin-top:12px">
      <div class="section-sublabel">Goal time</div>
      ${perfTimeSelects('raceGoal', raceDraft.goal_time, true)}
      <div class="sp-actions">
        <button class="btn-slim" onclick="saveRace()">Save race</button>
        <button class="btn-slim secondary" onclick="cancelRaceForm()">Cancel</button>
        <div id="raceMsg" class="save-msg" style="margin:0;text-align:left"></div>
      </div>
    </div>`;
}
function raceToggleDiv(dv){
  const i=raceDraft.divisions.indexOf(dv);
  if(i>-1) raceDraft.divisions.splice(i,1);
  else if(raceDraft.divisions.length<3) raceDraft.divisions.push(dv);
  raceDraft.name=document.getElementById('raceName').value;
  raceDraft.location=document.getElementById('raceLocation').value;
  raceDraft.race_date=raceDateRead('raceDate');
  raceDraft.goal_time=perfReadTime('raceGoal', true);
  renderRaceForm();
}
function racePickPrio(p){
  raceDraft.priority = raceDraft.priority===p? null : p;
  raceDraft.name=document.getElementById('raceName').value;
  raceDraft.location=document.getElementById('raceLocation').value;
  raceDraft.race_date=raceDateRead('raceDate');
  raceDraft.goal_time=perfReadTime('raceGoal', true);
  renderRaceForm();
}
function cancelRaceForm(){
  raceDraft=null;
  document.getElementById('raceForm').innerHTML='';
  document.getElementById('raceAddBtn').style.display='inline-block';
}
async function saveRace(){
  const msg=document.getElementById('raceMsg');
  raceDraft.name=document.getElementById('raceName').value.trim();
  raceDraft.location=document.getElementById('raceLocation').value.trim();
  raceDraft.race_date=raceDateRead('raceDate');
  raceDraft.goal_time=perfReadTime('raceGoal', true);
  if(!raceDraft.name){ msg.textContent='Give the race a name.'; return; }
  msg.textContent='Saving…';
  try{
    const d=await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'save-race',...raceDraft})});
    if(raceDraft.id){
      const i=myRaces.findIndex(r=>r.id===raceDraft.id);
      if(i>-1) myRaces[i]=d.race||raceDraft;
    }else if(d.race) myRaces.push(d.race);
    raceDraft=null;
    applyRaceCountdown();
    renderRacesCard();
  }catch(e){ msg.textContent=e.message; }
}
async function deleteRace(id){
  try{
    await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'delete-race',id})});
    myRaces=myRaces.filter(r=>r.id!==id);
    applyRaceCountdown();
    renderRacesCard();
  }catch(e){}
}

/* ---------- coach: race banner override (lists upcoming races) ---------- */
function renderRaceBanner(){
  const el=document.getElementById('caRaceBanner');
  if(!el || !caCurrent) return;
  el.innerHTML='';
  fetchRaces(caCurrent.id).then(races=>{
    const today=todayStr();
    const upcoming=races.filter(r=>r.race_date && r.race_date>=today)
                        .sort((a,b)=>a.race_date<b.race_date?-1:1).slice(0,3);
    if(!upcoming.length){
      if(caCurrent.race_name){
        el.innerHTML=`<div class="race-banner"><span class="rb-name">${esc(caCurrent.race_name)}</span>
          <span class="rb-meta">${caCurrent.race_date?fmtDay(caCurrent.race_date):''}</span></div>`;
      }
      return;
    }
    el.innerHTML=upcoming.map((r,i)=>{
      const du=daysUntil(r.race_date);
      return `<div class="race-banner" style="${i>0?'opacity:.72':''}">
        ${r.priority?`<span class="race-prio p${r.priority}">${r.priority}</span>`:''}
        <span class="rb-name">${esc(r.name)}</span>
        <span class="rb-meta">${fmtDay(r.race_date)}${r.location?' · '+esc(r.location):''}${(r.divisions||[]).length?' · '+r.divisions.join(' · '):''}${r.goal_time?' · Goal '+r.goal_time:''}</span>
        <span class="rb-days">${du} days out</span>
      </div>`;
    }).join('');
  }).catch(()=>{});
}
