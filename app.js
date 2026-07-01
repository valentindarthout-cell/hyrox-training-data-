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

// ---- TABS ----
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

// ---- AUTH ----
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

// ---- SYNC ----
function sync(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
function syncBoth(id1, id2, val) { sync(id1, val); sync(id2, val); }

function updateDate() {
  var d = new Date();
  var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  sync('c-date', days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()]);
}

// ---- PHASE ----
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

// ---- DIVISION (multi up to 3) ----
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

// ---- WORKOUT TYPE ----
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

function getModalityFlags(s) {
  var subs = s === 1 ? s1Subtypes : s2Subtypes;
  return {
    isBike: subs.some(function(x){ return ['Bike outdoor','Bike indoor'].indexOf(x)>-1; }),
    isEchoBike: subs.indexOf('Echo bike')>-1,
    isErg: subs.some(function(x){ return ['Ski erg','Row erg'].indexOf(x)>-1; }),
    isStair: subs.indexOf('Stair Stepper')>-1,
    isRun: subs.some(function(x){ return ['Run','Treadmill'].indexOf(x)>-1; }),
    isElliptical: subs.indexOf('Elliptical')>-1,
    isMix: subs.indexOf('Mix modalities')>-1
  };
}

function updatePaceVolLabels(s) {
  var f = getModalityFlags(s);
  var paceLabel, volLabel, pacePlaceholder;

  if (f.isMix || f.isStair) {
    volLabel = f.isStair ? 'Volume (steps)' : 'Volume (km)';
    paceLabel = f.isStair ? 'Steps/min (auto)' : 'Avg pace';
    pacePlaceholder = f.isStair ? 'steps/min' : '—';
  } else if (f.isEchoBike || f.isElliptical) {
    volLabel = 'Volume (km)';
    paceLabel = 'Avg watts';
    pacePlaceholder = 'watts';
  } else if (f.isBike) {
    volLabel = 'Volume (km)';
    paceLabel = 'Avg pace';
    pacePlaceholder = '2:05/km';
  } else if (f.isErg) {
    volLabel = 'Volume (km)';
    paceLabel = 'Avg pace /500m';
    pacePlaceholder = '1:55';
  } else {
    volLabel = 'Volume (km)';
    paceLabel = 'Avg pace (auto)';
    pacePlaceholder = 'min/km';
  }

  var elPaceLbl = document.getElementById('e-s'+s+'-pace-lbl');
  var elVolLbl = document.getElementById('e-s'+s+'-vol-lbl');
  var elPaceInput = document.getElementById('e-s'+s+'-pace');
  if (elPaceLbl) elPaceLbl.textContent = paceLabel;
  if (elVolLbl) elVolLbl.textContent = volLabel;
  if (elPaceInput) elPaceInput.placeholder = pacePlaceholder;

  var paceUnit = f.isEchoBike||f.isElliptical ? 'w' : f.isBike ? '/km' : f.isErg ? '/500m' : f.isStair ? 'steps/min' : 'min/km';
  var volUnit = f.isStair ? 'steps' : 'km';

  if (s===1) {
    var v1=document.getElementById('c1-vol-lbl'); if(v1) v1.textContent=volUnit;
    var p1=document.getElementById('c1-pace-lbl'); if(p1) p1.textContent=paceUnit;
    var v2=document.getElementById('c2-s1-vol-lbl'); if(v2) v2.textContent=volUnit;
    var p2=document.getElementById('c2-s1-pace-lbl'); if(p2) p2.textContent=paceUnit;
  } else {
    var v3=document.getElementById('c2-s2-vol-lbl'); if(v3) v3.textContent=volUnit;
    var p3=document.getElementById('c2-s2-pace-lbl'); if(p3) p3.textContent=paceUnit;
  }

  updateVolPaceVisibility(s);
}

  var elPaceLbl = document.getElementById('e-s'+s+'-pace-lbl');
  var elVolLbl = document.getElementById('e-s'+s+'-vol-lbl');
  var elPaceInput = document.getElementById('e-s'+s+'-pace');
  var elPaceWrap = document.getElementById('e-s'+s+'-pace-wrap');
  if (elPaceLbl) elPaceLbl.textContent = paceLabel;
  if (elVolLbl) elVolLbl.textContent = volLabel;
  if (elPaceInput) elPaceInput.placeholder = pacePlaceholder;
  if (elPaceWrap) elPaceWrap.style.display = showPace ? 'block' : 'none';

  var paceUnit = f.isStair ? 'steps/min' : f.isEchoBike||f.isElliptical ? 'w' : f.isBike ? '/km' : f.isErg ? '/500m' : 'min/km';
  var volUnit = f.isStair ? 'steps' : 'km';

  if (s===1) {
    var v1=document.getElementById('c1-vol-lbl'); if(v1) v1.textContent=volUnit;
    var p1=document.getElementById('c1-pace-lbl'); if(p1) p1.textContent=paceUnit;
    var v2=document.getElementById('c2-s1-vol-lbl'); if(v2) v2.textContent=volUnit;
    var p2=document.getElementById('c2-s1-pace-lbl'); if(p2) p2.textContent=paceUnit;
  } else {
    var v3=document.getElementById('c2-s2-vol-lbl'); if(v3) v3.textContent=volUnit;
    var p3=document.getElementById('c2-s2-pace-lbl'); if(p3) p3.textContent=paceUnit;
  }
};
updateCardTypeLabel(s);
  updatePaceVolLabels(s);
  autoCalcPace(s);
  updateTotRun();
  updateVolPaceVisibility(s);
}
function updateCardTypeLabel(s) {
  var type = s === 1 ? s1WorkoutType : s2WorkoutType;
  var subs = s === 1 ? s1Subtypes : s2Subtypes;
  var label = type ? (type.charAt(0).toUpperCase() + type.slice(1)) + (subs.length ? ' · ' + subs.slice(0,2).join(', ') : '') : '';
  if (s === 1) {
    sync('c1-type-label', label);
    sync('c2-s1-type-label', label);
  } else {
    sync('c2-s2-type-label', label);
  }
}

function toggleSub(s, type, btn) {
  var sub = btn.dataset.sub;
  var arr = s === 1 ? s1Subtypes : s2Subtypes;
  var idx = arr.indexOf(sub);
  if (idx > -1) { arr.splice(idx, 1); btn.classList.remove('active'); }
  else { arr.push(sub); btn.classList.add('active'); }
  updateCardTypeLabel(s);
  updatePaceVolLabels(s);
  autoCalcPace(s);
  updateTotRun();
}

function setSingleSub(s, type, sub, btn) {
  var pillsId = 's' + s + '-endurance-pills';
  document.querySelectorAll('#' + pillsId + ' .pill').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  if (s === 1) s1Subtypes = [sub];
  else s2Subtypes = [sub];
  updateCardTypeLabel(s);
  updatePaceVolLabels(s);
  autoCalcPace(s);
  updateTotRun();
  updateVolPaceVisibility(s);
}
function setSingleSub(s, type, sub, btn) {
  var pillsId = 's' + s + '-endurance-pills';
  document.querySelectorAll('#' + pillsId + ' .pill').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  if (s === 1) s1Subtypes = [sub];
  else s2Subtypes = [sub];
  updateCardTypeLabel(s);
  updatePaceVolLabels(s);
  autoCalcPace(s);
  updateTotRun();
  updateVolPaceVisibility(s);
}

function updateVolPaceVisibility(s) {
  var subs = s === 1 ? s1Subtypes : s2Subtypes;
  var isMix = subs.indexOf('Mix modalities') > -1;
  var volWrap = document.getElementById('e-s' + s + '-vol-wrap');
  var paceWrap = document.getElementById('e-s' + s + '-pace-wrap');
  if (volWrap) volWrap.style.display = isMix ? 'none' : 'block';
  if (paceWrap) paceWrap.style.display = isMix ? 'none' : 'block';
}

function handlePaceInput(s, input) {
  var f = getModalityFlags(s);
  var val = input.value;
  if (f.isErg) {
    val = val.replace(/[^0-9:]/g, '');
    if (val.length > 4) val = val.substring(0, 4);
    if (val.includes(':')) {
      var parts = val.split(':');
      var mins = parseInt(parts[0]) || 0;
      var secs = parts[1] !== undefined ? parts[1] : '';
      if (secs.length === 2) {
        var secsInt = parseInt(secs);
        if (secsInt > 59) secs = '59';
        if (mins < 1) mins = 1;
        if (mins > 2 || (mins === 2 && secsInt > 59)) { mins = 2; secs = '59'; }
        val = mins + ':' + secs;
      }
    }
    input.value = val;
  }
  setPace(s, input.value);
}
function updatePaceVolLabels(s) {
  var type = s === 1 ? s1WorkoutType : s2WorkoutType;
  var subs = s === 1 ? s1Subtypes : s2Subtypes;
  var isBike = subs.some(function(x) { return ['Echo bike','Bike outdoor','Bike indoor','Elliptical'].indexOf(x) > -1; });
  var isErg = subs.some(function(x) { return ['Ski erg','Row erg'].indexOf(x) > -1; });
  var isStair = subs.indexOf('Stair Stepper') > -1;
  var paceLabel, volLabel, pacePlaceholder;
  if (isBike) { paceLabel = 'Avg watts'; pacePlaceholder = 'watts'; }
  else if (isErg) { paceLabel = 'Avg pace'; pacePlaceholder = '2:00 /500m'; }
  else { paceLabel = 'Avg pace (auto)'; pacePlaceholder = 'min/km'; }
  volLabel = isStair ? 'Volume (steps)' : 'Volume (km)';
  var volUnit = isStair ? 'steps' : 'km';
  var paceUnit = isBike ? 'w' : isErg ? '/500m' : 'min/km';

  var elPaceLbl = document.getElementById('e-s' + s + '-pace-lbl');
  var elVolLbl = document.getElementById('e-s' + s + '-vol-lbl');
  var elPaceInput = document.getElementById('e-s' + s + '-pace');
  if (elPaceLbl) elPaceLbl.textContent = paceLabel;
  if (elVolLbl) elVolLbl.textContent = volLabel;
  if (elPaceInput) elPaceInput.placeholder = pacePlaceholder;

  var cVolLbl = document.getElementById('c' + (currentSess===1?'1':'2-s'+s) + '-vol-lbl');
  var cPaceLbl = document.getElementById('c' + (currentSess===1?'1':'2-s'+s) + '-pace-lbl');
  if (s === 1) {
    var v1 = document.getElementById('c1-vol-lbl'); if (v1) v1.textContent = volUnit;
    var p1 = document.getElementById('c1-pace-lbl'); if (p1) p1.textContent = paceUnit;
    var v2 = document.getElementById('c2-s1-vol-lbl'); if (v2) v2.textContent = volUnit;
    var p2 = document.getElementById('c2-s1-pace-lbl'); if (p2) p2.textContent = paceUnit;
  } else {
    var v3 = document.getElementById('c2-s2-vol-lbl'); if (v3) v3.textContent = volUnit;
    var p3 = document.getElementById('c2-s2-pace-lbl'); if (p3) p3.textContent = paceUnit;
  }
}

// ---- SESSIONS ----
function setSess(n) {
  currentSess = n;
  document.getElementById('card-1sess').style.display = n === 1 ? 'block' : 'none';
  document.getElementById('card-2sess').style.display = n === 2 ? 'block' : 'none';
  document.getElementById('e-sess2').style.display = n === 2 ? 'block' : 'none';
  document.getElementById('e-totals-section').style.display = n === 2 ? 'block' : 'none';
  document.getElementById('stog1').classList.toggle('active', n === 1);
  document.getElementById('stog2').classList.toggle('active', n === 2);
  updateDurations();
  updateTotRun();
}

function parseMins(id) { return parseInt(document.getElementById(id).value) || 0; }
function parseNum(id) { return parseFloat(document.getElementById(id).value) || 0; }

function formatDuration(mins) {
  if (mins <= 0) return '';
  var h = Math.floor(mins / 60); var m = mins % 60;
  return h > 0 ? h + 'h ' + (m > 0 ? m + 'm' : '') : m + ' min';
}

function updateDurations() {
  var s1 = parseMins('e-s1-dur-min');
  var s2 = currentSess === 2 ? parseMins('e-s2-dur-min') : 0;
  document.getElementById('c1-dur-val').innerHTML = s1 ? s1 + ' <span class="metric-unit">min</span>' : '';
  document.getElementById('c2-s1-dur').innerHTML = s1 ? s1 + ' <span class="metric-sm-unit">min</span>' : '';
  document.getElementById('c2-s2-dur').innerHTML = s2 ? s2 + ' <span class="metric-sm-unit">min</span>' : '';
  sync('c-tot-time', formatDuration(s1 + s2));
  var d = document.getElementById('e-tot-time-display');
  if (d) d.value = formatDuration(s1 + s2);
}

function autoCalcPace(s) {
  var f = getModalityFlags(s);
  if (f.isEchoBike || f.isElliptical || f.isMix) return;
  var mins = parseMins(s===1?'e-s1-dur-min':'e-s2-dur-min');
  var vol = parseNum(s===1?'e-s1-vol':'e-s2-vol');
  var paceEl = document.getElementById(s===1?'e-s1-pace':'e-s2-pace');
  if (!paceEl || !mins || !vol) return;
  var str = '';
  if (f.isStair) {
    str = Math.round(vol / mins) + '';
  } else if (f.isErg) {
    var secsTotal = (mins * 60) / (vol * 2);
    var pm5 = Math.floor(secsTotal / 60);
    var ps5 = Math.round(secsTotal % 60);
    if (pm5 < 1) pm5 = 1;
    if (pm5 > 2) { pm5 = 2; ps5 = 59; }
    str = pm5 + ':' + (ps5<10?'0':'') + ps5;
  } else if (f.isBike) {
    var pd = mins / vol; var pm = Math.floor(pd); var ps = Math.round((pd-pm)*60);
    str = pm + ':' + (ps<10?'0':'') + ps;
  } else {
    var pd2 = mins / vol; var pm2 = Math.floor(pd2); var ps2 = Math.round((pd2-pm2)*60);
    str = pm2 + ':' + (ps2<10?'0':'') + ps2;
  }
  if (str) { paceEl.value = str; setPace(s, str); }
}

function setVol(s, val) {
  var u = ' <span class="metric-unit">km</span>';
  var us = ' <span class="metric-sm-unit">km</span>';
  if (s === 1) {
    document.getElementById('c1-vol').innerHTML = val ? val + u : '';
    document.getElementById('c2-s1-vol').innerHTML = val ? val + us : '';
  } else {
    document.getElementById('c2-s2-vol').innerHTML = val ? val + us : '';
  }
  updateTotRun();
}

function setPace(s, val) {
  var u = ' <span class="metric-unit">min/km</span>';
  var us = ' <span class="metric-sm-unit">min/km</span>';
  if (s === 1) {
    document.getElementById('c1-pace').innerHTML = val ? val + u : '';
    document.getElementById('c2-s1-pace').innerHTML = val ? val + us : '';
  } else {
    var el = document.getElementById('c2-s2-pace');
    if (el) el.innerHTML = val ? val + us : '';
  }
}

function setHR(s, val) {
  var u = ' <span class="metric-unit">bpm</span>';
  var us = ' <span class="metric-sm-unit">bpm</span>';
  if (s === 1) {
    document.getElementById('c1-hr').innerHTML = val ? val + u : '';
    document.getElementById('c2-s1-hr').innerHTML = val ? val + us : '';
  } else { document.getElementById('c2-s2-hr').innerHTML = val ? val + us : ''; }
}

function setCal(s, val) {
  var u = ' <span class="metric-unit">kcal</span>';
  var us = ' <span class="metric-sm-unit">kcal</span>';
  if (s===1) {
    document.getElementById('c1-cal').innerHTML = val ? val+u : '';
    document.getElementById('c2-s1-cal').innerHTML = val ? val+us : '';
  } else {
    document.getElementById('c2-s2-cal').innerHTML = val ? val+us : '';
  }
  autoCalcTotKcal();
}

function setRPE(s, val) {
  var v = Math.round(val);
  if (s === 1) { sync('c1-rpe', v); sync('c2-s1-rpe', v); sync('rpe1-disp', v); }
  else { sync('c2-s2-rpe', v); sync('rpe2-disp', v); }
}

function setTotCal(val) { sync('c-tot-cal', val ? val + ' kcal' : ''); }

function autoCalcTotKcal() {
  var s1 = parseInt(document.getElementById('e-s1-cal').value) || 0;
  var s2 = currentSess===2 ? (parseInt(document.getElementById('e-s2-cal').value)||0) : 0;
  var total = s1 + s2;
  var totEl = document.getElementById('e-tot-cal');
  if (totEl) totEl.value = total || '';
  sync('c-tot-cal', total ? total + ' kcal' : '');
}

function setWorkout(s, val) {
  if (s === 1) {
    var el = document.getElementById('c1-workout');
    if (el) el.innerHTML = val ? val.replace(/\n/g,'<br>') : '';
    var block = document.getElementById('c1-workout-block');
    if (block) block.style.display = val ? 'block' : 'none';
  }
}

function updateTotRun() {
  var s1IsRun = s1Subtypes.some(function(x){ return ['Run','Treadmill'].indexOf(x)>-1; });
  var s2IsRun = s2Subtypes.some(function(x){ return ['Run','Treadmill'].indexOf(x)>-1; });
  var s1vol = s1IsRun ? parseNum('e-s1-vol') : 0;
  var s1comp = parseNum('e-s1-comp-run');
  var s2vol = currentSess===2 && s2IsRun ? parseNum('e-s2-vol') : 0;
  var s2comp = currentSess===2 ? parseNum('e-s2-comp-run') : 0;
  var total = s1vol + s1comp + s2vol + s2comp;
  var display = total > 0 ? total.toFixed(1).replace(/\.0$/,'') + ' km' : '';
  sync('c-tot-run', display);
  var el = document.getElementById('e-tot-run-display');
  if (el) el.value = display;
}

// ---- HR ZONES ----
var zoneColors = { 1:'#60a5fa', 2:'#34d399', 3:'#fbbf24', 4:'#f97316', 5:'#ef4444' };

function updateZone(s, z, val) {
  zones[s][z] = parseInt(val) || 0;
  var total = Object.values(zones[s]).reduce(function(a,b){return a+b;},0);
  var pctEl = document.getElementById('s' + s + '-z' + z + '-pct');
  if (pctEl) pctEl.textContent = val + '%';
  var totalEl = document.getElementById('s' + s + '-zone-total');
  if (totalEl) {
    totalEl.textContent = 'Total: ' + total + '%';
    totalEl.style.color = total === 100 ? '#34d399' : total > 100 ? '#ef4444' : '#999';
  }
  updateZoneBars(s);
  updateTotZones();
}

function updateZoneBars(s) {
  var hasData = Object.values(zones[s]).some(function(v){return v>0;});
  var block1 = document.getElementById(s===1 ? 'c1-zones-block' : 'c2-s'+s+'-zones-block');
  var blockSm = document.getElementById('c2-s' + s + '-zones-block');
  var barsId = s===1 ? 'c1-zones-bars' : 'c2-s'+s+'-zones-bars';
  var barsSm = 'c2-s' + s + '-zones-bars';

  if (block1) block1.style.display = hasData ? 'block' : 'none';
  if (blockSm && s > 1) blockSm.style.display = hasData ? 'block' : 'none';

  [barsId, s===1 ? 'c2-s1-zones-bars' : null].forEach(function(bid) {
    if (!bid) return;
    var el = document.getElementById(bid);
    if (!el) return;
    el.innerHTML = renderZoneBars(zones[s]);
  });
}

function renderZoneBars(zData) {
  var html = '<div class="zone-bar-wrap">';
  for (var z = 1; z <= 5; z++) {
    var pct = zData[z] || 0;
    if (pct === 0) continue;
    html += '<div class="zone-bar-item">';
    html += '<div class="zone-bar-track"><div class="zone-bar-fill" style="width:'+pct+'%;background:'+zoneColors[z]+'"></div></div>';
    html += '<div class="zone-bar-label"><span class="zone-bar-z" style="color:'+zoneColors[z]+'">Z'+z+'</span> <span class="zone-bar-pct">'+pct+'%</span></div>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function updateTotZones() {
  if (currentSess < 2) { document.getElementById('c-tot-zones-block').style.display='none'; return; }
  var combined = {};
  for (var z=1;z<=5;z++) { combined[z] = (zones[1][z]||0) + (zones[2][z]||0); }
  var total = Object.values(combined).reduce(function(a,b){return a+b;},0);
  var hasData = total > 0;
  document.getElementById('c-tot-zones-block').style.display = hasData ? 'block' : 'none';
  if (hasData) {
    var normalized = {};
    for (var z=1;z<=5;z++) { normalized[z] = total > 0 ? Math.round(combined[z]/total*100) : 0; }
    document.getElementById('c-tot-zones-bars').innerHTML = renderZoneBars(normalized);
  }
}

// ---- SCREENSHOT IMPORT ----
async function processScreenshot(file, s) {
  var statusEl = document.getElementById(s===1?'import-status-s1':'import-status-s2');
  statusEl.textContent = 'Reading session...';
  var type = s===1 ? s1WorkoutType : s2WorkoutType;
  var reader = new FileReader();
  reader.onload = async function(e) {
    var base64 = e.target.result.split(',')[1];
    var mediaType = file.type || 'image/jpeg';
    try {
      var r = await fetch('/api/import-session', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({image:base64, mediaType:mediaType, workoutType:type||'endurance'})
      });
      var parsed = await r.json();
      if (parsed.error) throw new Error(parsed.error);

      if (s===1) {
        if (parsed.name) { document.getElementById('e-s1-name').value=parsed.name; syncBoth('c1-name','c2-s1-name',parsed.name); }
        if (parsed.duration_min) { document.getElementById('e-s1-dur-min').value=parsed.duration_min; updateDurations(); }
        if (parsed.distance_km) { document.getElementById('e-s1-vol').value=parsed.distance_km; setVol(1,parsed.distance_km); }
        if (parsed.avg_pace) { document.getElementById('e-s1-pace').value=parsed.avg_pace; setPace(1,parsed.avg_pace); }
        if (parsed.avg_hr) { document.getElementById('e-s1-hr').value=parsed.avg_hr; setHR(1,parsed.avg_hr); }
        if (parsed.calories) { document.getElementById('e-s1-cal').value=parsed.calories; setCal(1,parsed.calories); }
        if (parsed.workout_description) { document.getElementById('e-s1-workout').value=parsed.workout_description; setWorkout(1,parsed.workout_description); }
        if (parsed.zone1_pct||parsed.zone2_pct||parsed.zone3_pct||parsed.zone4_pct||parsed.zone5_pct) {
          setZonesFromImport(1, parsed);
        }
        if (type==='hyrox') {
          if (parsed.compromised_run_km) { document.getElementById('e-s1-comp-run').value=parsed.compromised_run_km; }
          if (parsed.sled_push_m) { document.getElementById('e-s1-sled-push').value=parsed.sled_push_m; }
          if (parsed.sled_pull_m) { document.getElementById('e-s1-sled-pull').value=parsed.sled_pull_m; }
          if (parsed.wallballs_reps) { document.getElementById('e-s1-wallballs').value=parsed.wallballs_reps; }
          if (parsed.burpees_reps) { document.getElementById('e-s1-burpees').value=parsed.burpees_reps; }
          if (parsed.lunges_reps) { document.getElementById('e-s1-lunges').value=parsed.lunges_reps; }
        }
        autoCalcPace(1);
      } else {
        if (parsed.name) { document.getElementById('e-s2-name').value=parsed.name; sync('c2-s2-name',parsed.name); }
        if (parsed.duration_min) { document.getElementById('e-s2-dur-min').value=parsed.duration_min; updateDurations(); }
        if (parsed.distance_km) { document.getElementById('e-s2-vol').value=parsed.distance_km; setVol(2,parsed.distance_km); }
        if (parsed.avg_pace) { document.getElementById('e-s2-pace').value=parsed.avg_pace; setPace(2,parsed.avg_pace); }
        if (parsed.avg_hr) { document.getElementById('e-s2-hr').value=parsed.avg_hr; setHR(2,parsed.avg_hr); }
        if (parsed.calories) { document.getElementById('e-s2-cal').value=parsed.calories; setCal(2,parsed.calories); }
        if (parsed.zone1_pct||parsed.zone2_pct||parsed.zone3_pct||parsed.zone4_pct||parsed.zone5_pct) {
          setZonesFromImport(2, parsed);
        }
        if (type==='hyrox') {
          if (parsed.compromised_run_km) { document.getElementById('e-s2-comp-run').value=parsed.compromised_run_km; }
          if (parsed.sled_push_m) { document.getElementById('e-s2-sled-push').value=parsed.sled_push_m; }
          if (parsed.sled_pull_m) { document.getElementById('e-s2-sled-pull').value=parsed.sled_pull_m; }
          if (parsed.wallballs_reps) { document.getElementById('e-s2-wallballs').value=parsed.wallballs_reps; }
          if (parsed.burpees_reps) { document.getElementById('e-s2-burpees').value=parsed.burpees_reps; }
          if (parsed.lunges_reps) { document.getElementById('e-s2-lunges').value=parsed.lunges_reps; }
        }
        autoCalcPace(2);
      }
      updateTotRun();
      statusEl.textContent = 'Imported ✓';
    } catch(err) {
      statusEl.textContent = 'Could not read — fill manually';
    }
  };
  reader.readAsDataURL(file);
}

function setZonesFromImport(s, parsed) {
  var sliders = document.querySelectorAll('#s'+s+'-zone-sliders input[type=range]');
  [1,2,3,4,5].forEach(function(z,i) {
    var val = parsed['zone'+z+'_pct'] || 0;
    zones[s][z] = val;
    if (sliders[i]) sliders[i].value = val;
    var pctEl = document.getElementById('s'+s+'-z'+z+'-pct');
    if (pctEl) pctEl.textContent = val + '%';
  });
  var total = Object.values(zones[s]).reduce(function(a,b){return a+b;},0);
  var totalEl = document.getElementById('s'+s+'-zone-total');
  if (totalEl) { totalEl.textContent='Total: '+total+'%'; totalEl.style.color=total===100?'#34d399':total>100?'#ef4444':'#999'; }
  updateZoneBars(s);
}

// ---- SAVE SESSION ----
async function saveSession() {
  var btn = document.getElementById('session-label');
  if (!authToken) { btn.textContent='Please log in first'; return; }
  btn.textContent = 'Saving...';
  var today = new Date().toISOString().split('T')[0];
  var payload = {
    session_date: today,
    num_sessions: currentSess,
    training_phase: selectedPhase,
    division: selectedDivisions,
    s1_name: document.getElementById('e-s1-name').value,
    s1_workout_type: s1WorkoutType,
    s1_workout_subtypes: s1Subtypes,
    s1_duration_min: parseMins('e-s1-dur-min')||null,
    s1_run_km: parseNum('e-s1-vol')||null,
    s1_pace: document.getElementById('e-s1-pace').value||null,
    s1_hr: parseInt(document.getElementById('e-s1-hr').value)||null,
    s1_kcal: parseInt(document.getElementById('e-s1-cal').value)||null,
    s1_rpe: parseInt(document.getElementById('rpe1-disp').textContent)||null,
    s1_workout: document.getElementById('e-s1-workout').value||null,
    s1_zone1_pct: zones[1][1]||null, s1_zone2_pct: zones[1][2]||null,
    s1_zone3_pct: zones[1][3]||null, s1_zone4_pct: zones[1][4]||null, s1_zone5_pct: zones[1][5]||null,
    s1_compromised_run_km: parseNum('e-s1-comp-run')||null,
    s1_sled_push_m: parseInt(document.getElementById('e-s1-sled-push').value)||null,
    s1_sled_pull_m: parseInt(document.getElementById('e-s1-sled-pull').value)||null,
    s1_wallballs_reps: parseInt(document.getElementById('e-s1-wallballs').value)||null,
    s1_burpees_reps: parseInt(document.getElementById('e-s1-burpees').value)||null,
    s1_lunges_reps: parseInt(document.getElementById('e-s1-lunges').value)||null,
    s2_name: currentSess===2 ? document.getElementById('e-s2-name').value : null,
    s2_workout_type: currentSess===2 ? s2WorkoutType : null,
    s2_workout_subtypes: currentSess===2 ? s2Subtypes : null,
    s2_duration_min: currentSess===2 ? (parseMins('e-s2-dur-min')||null) : null,
    s2_run_km: currentSess===2 ? (parseNum('e-s2-vol')||null) : null,
    s2_pace: currentSess===2 ? (document.getElementById('e-s2-pace').value||null) : null,
    s2_hr: currentSess===2 ? (parseInt(document.getElementById('e-s2-hr').value)||null) : null,
    s2_kcal: currentSess===2 ? (parseInt(document.getElementById('e-s2-cal').value)||null) : null,
    s2_rpe: currentSess===2 ? (parseInt(document.getElementById('rpe2-disp').textContent)||null) : null,
    s2_zone1_pct: zones[2][1]||null, s2_zone2_pct: zones[2][2]||null,
    s2_zone3_pct: zones[2][3]||null, s2_zone4_pct: zones[2][4]||null, s2_zone5_pct: zones[2][5]||null,
    s2_compromised_run_km: currentSess===2 ? (parseNum('e-s2-comp-run')||null) : null,
    s2_sled_push_m: currentSess===2 ? (parseInt(document.getElementById('e-s2-sled-push').value)||null) : null,
    s2_sled_pull_m: currentSess===2 ? (parseInt(document.getElementById('e-s2-sled-pull').value)||null) : null,
    s2_wallballs_reps: currentSess===2 ? (parseInt(document.getElementById('e-s2-wallballs').value)||null) : null,
    s2_burpees_reps: currentSess===2 ? (parseInt(document.getElementById('e-s2-burpees').value)||null) : null,
    s2_lunges_reps: currentSess===2 ? (parseInt(document.getElementById('e-s2-lunges').value)||null) : null,
    tot_time_min: (parseMins('e-s1-dur-min') + (currentSess===2?parseMins('e-s2-dur-min'):0))||null,
    tot_run_km: (parseNum('e-s1-vol')+(currentSess===2?parseNum('e-s2-vol'):0)+parseNum('e-s1-comp-run')+(currentSess===2?parseNum('e-s2-comp-run'):0))||null,
    tot_kcal: parseInt(document.getElementById('e-tot-cal').value)||null
  };
  try {
    var r = await fetch('/api/save-session',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+authToken},body:JSON.stringify(payload)});
    var data = await r.json();
    if (data.error) throw new Error(data.error);
    btn.textContent='Saved ✓';
    setTimeout(function(){btn.textContent='Save session to history';},3000);
  } catch(e) {
    btn.textContent='Error — try again';
    setTimeout(function(){btn.textContent='Save session to history';},3000);
  }
}

// ---- STATS ----
var currentPeriod = 'week';
function setPeriod(p) {
  currentPeriod=p;
  ['week','month','year'].forEach(function(x){document.getElementById('pb-'+x).classList.toggle('active',x===p);});
  loadStats(p);
}

async function loadStats(period) {
  var content=document.getElementById('stats-content');
  content.innerHTML='<div class="stats-loading">Loading...</div>';
  if (!authToken) {content.innerHTML='<div class="stats-loading">Please log in.</div>';return;}
  try {
    var r=await fetch('/api/get-stats?period='+period,{headers:{'Authorization':'Bearer '+authToken}});
    var data=await r.json();
    if (data.error) throw new Error(data.error);
    renderStats(data,period);
  } catch(e) {content.innerHTML='<div class="stats-loading">Could not load stats.</div>';}
}

function renderStats(data,period) {
  var content=document.getElementById('stats-content');
  if (!data.sessions||data.sessions.length===0) {
    content.innerHTML='<div class="stats-loading">No sessions yet.<br>Save your first session!</div>';return;
  }
  var totalRun=0,totalTime=0,totalSess=0,avgRpe=0,rpeCount=0,totalWallballs=0,totalSledPush=0,totalCompRun=0;
  data.sessions.forEach(function(s){
    totalRun+=(s.tot_run_km||0);
    totalTime+=(s.tot_time_min||s.s1_duration_min||0);
    totalSess+=(s.num_sessions||1);
    if (s.s1_rpe){avgRpe+=s.s1_rpe;rpeCount++;}
    totalWallballs+=(s.s1_wallballs_reps||0)+(s.s2_wallballs_reps||0);
    totalSledPush+=(s.s1_sled_push_m||0)+(s.s2_sled_push_m||0);
    totalCompRun+=(s.s1_compromised_run_km||0)+(s.s2_compromised_run_km||0);
  });
  var html='<div class="stats-grid">';
  html+=statCard('Sessions',totalSess,'');
  html+=statCard('Run volume',totalRun.toFixed(1),'km');
  html+=statCard('Training time',Math.round(totalTime/60*10)/10,'h');
  html+=statCard('Avg RPE',rpeCount>0?(avgRpe/rpeCount).toFixed(1):'—','');
  if (totalWallballs>0) html+=statCard('Wall balls',totalWallballs,'reps');
  if (totalSledPush>0) html+=statCard('Sled push',totalSledPush,'m');
  if (totalCompRun>0) html+=statCard('Compromised run',totalCompRun.toFixed(1),'km');
  html+='</div>';
  html+='<div class="stats-sessions-title">Sessions</div>';
  data.sessions.slice().reverse().forEach(function(s){
    html+='<div class="stats-session-row">';
    html+='<div class="stats-session-date">'+s.session_date+'</div>';
    html+='<div class="stats-session-name">'+(s.s1_name||'—')+(s.num_sessions===2?' + '+(s.s2_name||''):'')+'</div>';
    html+='<div class="stats-session-meta">';
    if(s.tot_run_km)html+=s.tot_run_km+' km · ';
    if(s.tot_time_min||s.s1_duration_min)html+=Math.round(s.tot_time_min||s.s1_duration_min)+' min';
    html+='</div></div>';
  });
  content.innerHTML=html;
}

function statCard(label,val,unit) {
  return '<div class="stat-card"><div class="stat-val">'+val+' <span class="stat-unit">'+unit+'</span></div><div class="stat-lbl">'+label+'</div></div>';
}

// ---- LOGO ----
function handleLogo(input) {
  var file=input.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(e){
    var dataUrl=e.target.result;
    document.getElementById('c-logo').src=dataUrl;document.getElementById('c-logo').style.display='block';
    document.getElementById('logo-preview').src=dataUrl;document.getElementById('logo-preview').style.display='block';
    document.getElementById('logo-clear').style.display='inline-block';
    localStorage.setItem('htd-logo',dataUrl);
  };
  reader.readAsDataURL(file);
}
function clearLogo(){
  document.getElementById('c-logo').style.display='none';document.getElementById('c-logo').src='';
  document.getElementById('logo-preview').style.display='none';
  document.getElementById('logo-clear').style.display='none';
  localStorage.removeItem('htd-logo');
}

// ---- PERSIST ----
function save() {
  var data={
    phase:selectedPhase,
    race:document.getElementById('e-race-name').value,
    raceDate:document.getElementById('e-race-date').value,
    divs:selectedDivisions
  };
  localStorage.setItem('htd',JSON.stringify(data));
}

function load() {
  try {
    var logo=localStorage.getItem('htd-logo');
    if(logo){
      document.getElementById('c-logo').src=logo;document.getElementById('c-logo').style.display='block';
      document.getElementById('logo-preview').src=logo;document.getElementById('logo-preview').style.display='block';
      document.getElementById('logo-clear').style.display='inline-block';
    }
    var data=JSON.parse(localStorage.getItem('htd')||'{}');
    if(data.phase){
      selectedPhase=data.phase;
      document.querySelectorAll('#phase-pills .pill').forEach(function(b){
        if(b.dataset.phase===data.phase){b.classList.add('active');}
      });
      var isRace=data.phase==='Race';
      document.getElementById('race-fields').style.display=isRace?'block':'none';
      if(!isRace) sync('c-race-name',data.phase);
    }
    if(data.race)document.getElementById('e-race-name').value=data.race;
    if(data.raceDate)document.getElementById('e-race-date').value=data.raceDate;
    if(data.divs&&data.divs.length){
      selectedDivisions=data.divs;
      document.querySelectorAll('#div-pills .pill').forEach(function(b){
        if(data.divs.indexOf(b.dataset.div)>-1)b.classList.add('active');
      });
      sync('c-race-div',selectedDivisions.join(' · '));
    }
    setRace();
  }catch(e){}
}

// ---- COPY CARD ----
async function saveCard() {
  var btn=document.getElementById('save-label');
  btn.textContent='Generating...';
  try {
    var card=document.getElementById('card');
    var canvas=await html2canvas(card,{backgroundColor:null,scale:3,useCORS:true,logging:false});
    canvas.toBlob(async function(blob){
      try {
        await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
        btn.textContent='Copied! Paste into Stories ✓';
      } catch(e){
        var url=URL.createObjectURL(blob);
        var a=document.createElement('a');a.href=url;a.download='hyrox-training.png';a.click();
        btn.textContent='Saved to files ✓';
      }
      setTimeout(function(){btn.textContent='Copy card to clipboard';},3000);
    },'image/png');
  }catch(e){btn.textContent='Try again';}
}

// ---- INIT ----
if (authToken) {
  enterApp();
} else {
  document.getElementById('view-auth').style.display='block';
  document.getElementById('view-app').style.display='none';
}
