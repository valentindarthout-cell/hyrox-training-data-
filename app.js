function showTab(t) {
  document.getElementById('view-preview').style.display = t === 'preview' ? 'block' : 'none';
  document.getElementById('view-edit').style.display = t === 'edit' ? 'block' : 'none';
  document.getElementById('tab-preview').classList.toggle('active', t === 'preview');
  document.getElementById('tab-edit').classList.toggle('active', t === 'edit');
  if (t === 'preview') updateDate();
}

function sync(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function syncBoth(id1, id2, val) { sync(id1, val); sync(id2, val); }

function updateDate() {
  var d = new Date();
  var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  sync('c-date', days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()]);
}

function handleRaceType() {
  var type = document.getElementById('e-race-type').value;
  var raceFields = document.getElementById('race-fields');
  var raceDays = document.getElementById('c-race-days');
  if (type === 'race') {
    raceFields.style.display = 'block';
    setRace();
  } else {
    raceFields.style.display = 'none';
    var labels = { offseason: 'Off season training', generalprep: 'General prep' };
    sync('c-race-name', labels[type]);
    raceDays.style.display = 'none';
  }
  save();
}

function setRace() {
  var name = document.getElementById('e-race-name').value;
  var dv = document.getElementById('e-race-date').value;
  var raceDays = document.getElementById('c-race-days');
  sync('c-race-name', name || '—');
  if (dv) {
    var race = new Date(dv);
    var today = new Date(); today.setHours(0,0,0,0);
    var diff = Math.round((race - today) / 86400000);
    raceDays.textContent = diff > 0 ? diff + ' days out' : diff === 0 ? 'Race day!' : Math.abs(diff) + ' days ago';
    raceDays.style.display = 'block';
  } else {
    raceDays.style.display = 'none';
  }
}

function setDiv(btn) {
  document.querySelectorAll('#div-pills .pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  sync('c-race-div', btn.dataset.div);
  save();
}

var currentSess = 1;

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
function parseKm(id) { return parseFloat(document.getElementById(id).value) || 0; }

function formatDuration(mins) {
  if (mins <= 0) return '—';
  var h = Math.floor(mins / 60);
  var m = mins % 60;
  if (h > 0) return h + 'h ' + (m > 0 ? m + 'm' : '');
  return m + ' min';
}

function updateDurations() {
  var s1 = parseMins('e-s1-dur-min');
  var s2 = currentSess === 2 ? parseMins('e-s2-dur-min') : 0;
  var s1fmt = formatDuration(s1);
  var s2fmt = formatDuration(s2);

  document.getElementById('c1-dur-val').innerHTML = s1 + ' <span class="metric-unit">min</span>';
  document.getElementById('c2-s1-dur').innerHTML = s1 + ' <span class="metric-sm-unit">min</span>';
  document.getElementById('c2-s2-dur').innerHTML = s2 + ' <span class="metric-sm-unit">min</span>';

  sync('c-tot-time', formatDuration(s1 + s2));
  var d = document.getElementById('e-tot-time-display');
  if (d) d.value = formatDuration(s1 + s2);
}

function autoCalcPace(s) {
  var durId = s === 1 ? 'e-s1-dur-min' : 'e-s2-dur-min';
  var runId = s === 1 ? 'e-s1-run' : 'e-s2-run';
  var paceId = s === 1 ? 'e-s1-pace' : 'e-s2-pace';
  var mins = parseMins(durId);
  var km = parseFloat(document.getElementById(runId).value) || 0;
  if (km > 0 && mins > 0) {
    var paceDecimal = mins / km;
    var paceMin = Math.floor(paceDecimal);
    var paceSec = Math.round((paceDecimal - paceMin) * 60);
    var paceStr = paceMin + ':' + (paceSec < 10 ? '0' : '') + paceSec;
    document.getElementById(paceId).value = paceStr;
    setPace(s, paceStr);
  }
}

function setPace(s, val) {
  var u = ' <span class="metric-unit">min/km</span>';
  var us = ' <span class="metric-sm-unit">min/km</span>';
  if (s === 1) {
    document.getElementById('c1-pace').innerHTML = val ? val + u : '—';
    document.getElementById('c2-s1-pace').innerHTML = val ? val + us : '—';
  } else {
    var el = document.getElementById('c2-s2-pace');
    if (el) el.innerHTML = val ? val + us : '—';
  }
}

function updateTotRun() {
  var s1norun = document.getElementById('s1-norun').checked;
  var s2norun = document.getElementById('s2-norun').checked;
  var s1 = s1norun ? 0 : parseKm('e-s1-run');
  var s2 = currentSess === 2 && !s2norun ? parseKm('e-s2-run') : 0;
  var total = s1 + s2;
  var display = total > 0 ? total.toFixed(1).replace(/\.0$/, '') + ' km' : '—';
  sync('c-tot-run', display);
  var el = document.getElementById('e-tot-run-display');
  if (el) el.value = display;
}

function setHR(s, val) {
  var u = ' <span class="metric-unit">bpm</span>';
  var us = ' <span class="metric-sm-unit">bpm</span>';
  if (s === 1) { document.getElementById('c1-hr').innerHTML = val + u; document.getElementById('c2-s1-hr').innerHTML = val + us; }
  else { document.getElementById('c2-s2-hr').innerHTML = val + us; }
}

function setCal(s, val) {
  var u = ' <span class="metric-unit">kcal</span>';
  var us = ' <span class="metric-sm-unit">kcal</span>';
  if (s === 1) { document.getElementById('c1-cal').innerHTML = val + u; document.getElementById('c2-s1-cal').innerHTML = val + us; }
  else { document.getElementById('c2-s2-cal').innerHTML = val + us; }
}

function setRun(s, val) {
  var u = ' <span class="metric-unit">km</span>';
  var us = ' <span class="metric-sm-unit">km</span>';
  if (s === 1) { document.getElementById('c1-run').innerHTML = val + u; document.getElementById('
