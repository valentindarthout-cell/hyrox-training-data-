var currentSess = 1;
var authToken = localStorage.getItem('htd-token') || null;
var s1WorkoutType = null;
var s2WorkoutType = null;
var s1Subtypes = [];
var s2Subtypes = [];
var selectedDivisions = [];
var selectedPhase = null;
var zones = {
  1: { 1:0, 2:0, 3:0, 4:0, 5:0 },
  2: { 1:0, 2:0, 3:0, 4:0, 5:0 }
};

function showTab(t) {
  ['preview','edit','stats'].forEach(function(v) {
    document.getElementById('view-' + v).style.display = v === t ? 'block' : 'none';
    var tab = document.getElementById('tab-' + v);
    if (tab) tab.classList.toggle('active', v === t);
  });
  if (t === 'preview') { updateDate(); applyEmptyFieldVisibility(); updateTotZones(); }
  if (t === 'edit') { restoreAllFields(); }
  if (t === 'stats') { loadStats('week'); }
}

function applyEmptyFieldVisibility() {
  var blocks = [
    'c1-dur-block','c1-vol-block','c1-pace-block','c1-hr-block','c1-cal-block',
    'c2-s1-dur-block','c2-s1-vol-block','c2-s1-pace-block','c2-s1-hr-block','c2-s1-cal-block',
    'c2-s2-dur-block','c2-s2-vol-block','c2-s2-pace-block','c2-s2-hr-block','c2-s2-cal-block'
  ];
  blocks.forEach(function(id) {
    var block = document.getElementById(id);
    if (!block) return;
    var valEl = block.querySelector('[id]');
    block.style.display = (!valEl || valEl.innerHTML.trim() === '') ? 'none' : 'flex';
  });
  updateZoneBars(1);
  updateZoneBars(2);
}

function restoreAllFields() {
  var blocks = [
    'c1-dur-block','c1-vol-block','c1-pace-block','c1-hr-block','c1-cal-block',
    'c2-s1-dur-block','c2-s1-vol-block','c2-s1-pace-block','c2-s1-hr-block','c2-s1-cal-block',
    'c2-s2-dur-block','c2-s2-vol-block','c2-s2-pace-block','c2-s2-hr-block','c2-s2-cal-block'
  ];
  blocks.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  });
}

function enterApp() {
  document.getElementById('view-auth').style.display = 'none';
  document.getElementById('view-app').style.display = 'block';
  updateDate();
  load();
  setSess(1);
  updateDurations();
  updateTotRun();
  showTab('preview');
}

function logout() {
  authToken = null;
  localStorage.removeItem('htd-token');
  document.getElementById('view-auth').style.display = 'block';
  document.getElementById('view-app').style.display = 'none';
}

function sync(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
function syncBoth(id1, id2, val) { sync(id1, val); sync(id2, val); }

function updateDate() {
  var d = new Date();
  var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  sync('c-date', days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()]);
}

function setPhase(btn) {
  document.querySelectorAll('#phase-pills .pill').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  selectedPhase = btn.dataset.phase;
  var isRace = selectedPhase === 'Race';
  document.getElementById('race-fields').style.display = isRace ? 'block' : 'none';
  if (!isRace) {
    sync('c-race-name', selectedPhase);
    document.getElementById('c-race-days').style.display = 'none';
  }
  save();
}

function setRace() {
  var name = document.getElementById('e-race-name').value;
  var dv = document.getElementById('e-race-date').value;
  var raceDays = document.getElementById('c-race-days');
  sync('c-race-name', name || '');
  if (dv) {
    var race = new Date(dv);
    var today = new Date(); today.setHours(0,0,0,0);
    var diff = Math.round((race - today) / 86400000);
    raceDays.textContent = diff > 0 ? diff + ' days out' : diff === 0 ? 'Race day!' : Math.abs(diff) + ' days ago';
    raceDays.style.display = 'inline';
  } else { raceDays.style.display = 'none'; }
}

function setDiv(btn) {
  var div = btn.dataset.div;
  var idx = selectedDivisions.indexOf(div);
  if (idx > -1) {
    selectedDivisions.splice(idx, 1);
    btn.classList.remove('active');
  } else {
    if (selectedDivisions.length >= 3) return;
    selectedDivisions.push(div);
    btn.classList.add('active');
  }
  sync('c-race-div', selectedDivisions.join(' · '));
  save();
}

function getModalityFlags(s) {
  var subs = s === 1 ? s1Subtypes : s2Subtypes;
  return {
    isBike: subs.some(function(x){ return ['Bike outdoor','Bike indoor'].indexOf(x) > -1; }),
    isEchoBike: subs.indexOf('Echo bike') > -1,
    isErg: subs.some(function(x){ return ['Ski erg','Row erg'].indexOf(x) > -1; }),
    isStair: subs.indexOf('Stair Stepper') > -1,
    isRun: subs.some(function(x){ return ['Run','Treadmill'].indexOf(x) > -1; }),
    isElliptical: subs.indexOf('Elliptical') > -1
  };
}

function setWorkoutType(s, type, btn) {
  document.querySelectorAll('#s' + s + '-type-pills .pill').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  if (s === 1) s1WorkoutType = type;
  else s2WorkoutType = type;
  ['endurance','hyrox','strength'].forEach(function(t) {
    var el = document.getElementById('s' + s + '-' + t + '-subtypes');
    if (el) el.style.display = t === type ? 'block' : 'none';
  });
  var hyroxMetrics = document.getElementById('s' + s + '-hyrox-metrics');
  if (hyroxMetrics) hyroxMetrics.style.display = type === 'hyrox' ? 'block' : 'none';
  updateCardTypeLabel(s);
  updatePaceVolLabels(s);
}

function updateCardTypeLabel(s) {
  var type = s === 1 ? s1WorkoutType : s2WorkoutType;
  var subs = s === 1 ? s1Subtypes : s2Subtypes;
  var label = type ? (type.charAt(0).toUpperCase() + type.slice(1)) + (subs.length ? ' · ' + subs.slice(0,2).join(', ') : '') : '';
  if (s === 1) { sync('c1-type-label', label); sync('c2-s1-type-label', label); }
  else { sync('c2-s2-type-label', label); }
}

function updatePaceVolLabels(s) {
  var f = getModalityFlags(s);
  var paceLabel, volLabel, pacePlaceholder;
  if (f.isStair) {
    volLabel = 'Volume (steps)'; paceLabel = 'Steps/min (auto)'; pacePlaceholder = 'steps/min';
  } else if (f.isEchoBike || f.isElliptical) {
    volLabel = 'Volume (km)'; paceLabel = 'Avg watts'; pacePlaceholder = 'watts';
  } else if (f.isBike) {
    volLabel = 'Volume (km)'; paceLabel = 'Avg pace'; pacePlaceholder = '2:05/km';
  } else if (f.isErg) {
    volLabel = 'Volume (km)'; paceLabel = 'Avg pace /500m'; pacePlaceholder = '1:55';
  } else {
    volLabel = 'Volume (km)'; paceLabel = 'Avg pace (auto)'; pacePlaceholder = 'min/km';
  }
  var elPaceLbl = document.getElementById('e-s'+s+'-pace-l
