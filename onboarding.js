/* ================================================================
   OCTA. onboarding.js — coach checklist + athlete swipe-through
   Loads after app.js and tracks-plan.js (uses coachTab, api, esc, profile).
   Coach checklist: fully live-derived from real data, no stored state.
   Athlete tutorial: shown once, tracked via localStorage (works
   immediately, no dependency on unseen get-data.js internals) with a
   best-effort backend sync to profiles.onboarded for cross-device record.
================================================================ */

/* ---------------- Coach checklist ---------------- */
let onbSteps=[];
async function renderCoachChecklist(force){
  const home=document.getElementById('coachHome');
  if(!home) return;
  let host=document.getElementById('onbChecklistHost');
  if(!host){
    home.insertAdjacentHTML('afterbegin','<div id="onbChecklistHost"></div>');
    host=document.getElementById('onbChecklistHost');
  }
  let status;
  try{ status=await api('/api/workouts?action=onboarding-status'); }catch(e){ return; }

  onbSteps=[
    { done: status.programName, label:'Tell athletes what you offer', optional:false,
      sub:'Add your program name and logo in Settings \u2014 it appears on every workout card your athletes share.',
      go:function(){ coachTab('settings'); onbScrollTo('csName'); } },
    { done: status.tracks>0, label:'Create your tracks', optional:false,
      sub:'Group athletes by level or focus \u2014 Elite, Open, Running-focused. Takes 30 seconds.',
      go:function(){ coachTab('settings'); onbScrollTo('tracksCardHost'); } },
    { done: status.athletes>0, label:'Invite your athletes', optional:false,
      sub: status.inviteCode
        ? 'Share this code \u2014 they enter it in their app, under Profile \u2192 Coach: <b class="onb-code">'+esc(status.inviteCode)+'</b> <button class="mini-btn" onclick="event.stopPropagation();onbCopyCode(\''+status.inviteCode+'\')">Copy</button>'
        : 'Find your invite code in Settings and share it with your athletes.',
      go:function(){ coachTab('settings'); onbScrollTo('coachCode'); } },
    { done: status.published, label:'Build your public page', optional:true,
      sub:'No website? Build one in under 5 minutes \u2014 your program, tracks, and testimonials, ready to share and scan via QR code.',
      go:function(){ coachTab('settings'); onbScrollTo('lpSlug'); } },
    { done: status.hasBlocks, label:'Build your first week', optional:false,
      sub:'Go to Programming, save a workout to your Library, then drop it into a track\u2019s lane \u2014 every athlete in that track gets it automatically.',
      go:function(){ coachTab('prog'); } }
  ];
  const requiredSteps = onbSteps.filter(function(s){return !s.optional;});
  const doneCount = requiredSteps.filter(function(s){return s.done;}).length;
  const pct = Math.round(100*doneCount/requiredSteps.length);
  const requiredDone = doneCount===requiredSteps.length;
  if(requiredDone && !force){ host.innerHTML=''; return; }

  host.innerHTML = '<div class="section-card onb-checklist">'
    + '<div class="onb-head"><div class="section-label" style="margin:0">Getting started</div>'
    + '<span class="onb-progress-text">'+doneCount+' of '+requiredSteps.length+'</span></div>'
    + '<div class="onb-progress-track"><div class="onb-progress-fill" style="width:'+pct+'%"></div></div>'
    + onbSteps.map(function(s,i){
        return '<div class="onb-step '+(s.done?'done':'')+'" onclick="onbGoStep('+i+')">'
          + '<span class="onb-check">'+(s.done?'\u2713':(i+1))+'</span>'
          + '<div class="onb-step-body"><div class="onb-step-label">'+esc(s.label)+(s.optional?' <span class="onb-optional">Optional</span>':'')+'</div>'
          + '<div class="onb-step-sub">'+s.sub+'</div></div>'
          + '</div>';
      }).join('')
    + '</div>';
}
function onbCopyCode(code){
  navigator.clipboard?.writeText(code).catch(function(){});
}
function onbGoStep(i){ if(onbSteps[i]) onbSteps[i].go(); }
function onbScrollTo(id){
  setTimeout(function(){
    const el=document.getElementById(id);
    if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
  },150);
}
function onbShowChecklist(){
  coachTab('home');
  setTimeout(function(){ renderCoachChecklist(true); },50);
}

/* ---------------- Athlete swipe-through tutorial ---------------- */
const ONB_SLIDES=[
  { title:'Welcome to OCTA.', body:'Your training, logged in seconds and shared like a pro.' },
  { title:'Log', body:'This is where today\u2019s workout lives \u2014 tap through duration, pace, and how it felt.' },
  { title:'Stats', body:'See your training add up over weeks, months, and race cycles.' },
  { title:'Profile', body:'PRs, races, and your coach connection \u2014 all in one place.' }
];
let onbSlide=0;
function maybeShowAthleteTutorial(){
  if(!window.profile || !profile.id) return;
  if(localStorage.getItem('octa_athlete_onboarded')) return;
  if(document.getElementById('onbTutorial')) return;
  onbSlide=0;
  renderAthleteTutorial();
}
function renderAthleteTutorial(){
  const old=document.getElementById('onbTutorial'); if(old) old.remove();
  const s=ONB_SLIDES[onbSlide];
  const isLast=onbSlide===ONB_SLIDES.length-1;
  document.body.insertAdjacentHTML('beforeend',
    '<div id="onbTutorial" class="onb-overlay">'
    + '<button class="onb-skip" onclick="onbFinishTutorial()">Skip</button>'
    + '<div class="onb-slide">'
    +   '<div class="onb-slide-title">'+esc(s.title)+'</div>'
    +   '<div class="onb-slide-body">'+esc(s.body)+'</div>'
    + '</div>'
    + '<div class="onb-dots">'+ONB_SLIDES.map(function(_,i){ return '<span class="onb-dot '+(i===onbSlide?'on':'')+'"></span>'; }).join('')+'</div>'
    + '<button class="cta" style="max-width:280px;margin:0 auto" onclick="onbNextSlide()">'+(isLast?'Get started':'Next')+'</button>'
    + '</div>');
}
function onbNextSlide(){
  onbSlide++;
  if(onbSlide>=ONB_SLIDES.length){ onbFinishTutorial(); return; }
  renderAthleteTutorial();
}
async function onbFinishTutorial(){
  const el=document.getElementById('onbTutorial'); if(el) el.remove();
  localStorage.setItem('octa_athlete_onboarded','1');
  try{ await api('/api/profile',{method:'PUT',body:JSON.stringify({onboarded:true})}); }catch(e){}
}
