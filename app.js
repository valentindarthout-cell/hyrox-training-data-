
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
    var label = diff > 0 ? diff + ' days out' : diff === 0 ? 'Race day!' : Math.abs(diff) + ' days ago';
    raceDays.textContent = label;
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

function setSess(n) {
  document.getElementById('card-1sess').style.display = n === 1 ? 'block' : 'none';
  document.getElementById('card-2sess').style.display = n === 2 ? 'block' : 'none';
  document.getElementById('e-sess2').style.display = n === 2 ? 'block' : 'none';
  document.getElementById('stog1').classList.toggle('active', n === 1);
  document.getElementById('stog2').classList.toggle('active', n === 2);
  updateDurations();
  updateTotRun();
}

function parseMins(id) {
  return parseInt(document.getElementById(id).value) || 0;
}

function parseKm(id) {
  return parseFloat(document.getElementById(id).value) || 0;
}

function formatDuration(mins) {
  if (mins <= 0) return '—';
  var h = Math.floor(mins / 60);
  var m = mins % 60;
  if (h > 0) return h + 'h ' + (m > 0 ? m + 'm' : '');
  return m + ' min';
}

function updateDurations() {
  var s1 = parseMins('e-s1-dur-min');
  var isTwoSess = document.getElementById('stog2').classList.contains('active');
  var s2 = isTwoSess ? parseMins('e-s2-dur-min') : 0;
  syncBoth('c1-dur', 'c2-s1-dur', formatDuration(s1));
  sync('c2-s2-dur', formatDuration(s2));
  sync('c-tot-time', formatDuration(s1 + s2));
  var d = document.getElementById('e-tot-time-display');
  if (d) d.value = formatDuration(s1 + s2);
}

function updateTotRun() {
  var isTwoSess = document.getElementById('stog2').classList.contains('active');
  var s1 = parseKm('e-s1-run');
  var s2 = isTwoSess ? parseKm('e-s2-run') : 0;
  var s1norun = document.getElementById('s1-norun').checked;
  var s2norun = isTwoSess && document.getElementById('s2-norun').checked;
  var total = (s1norun ? 0 : s1) + (s2norun ? 0 : s2);
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
  if (s === 1) { document.getElementById('c1-run').innerHTML = val + u; document.getElementById('c2-s1-run').innerHTML = val + us; }
  else { var el = document.getElementById('c2-s2-run'); if (el) el.innerHTML = val + us; }
  updateTotRun();
}

function toggleRun(s, hidden) {
  if (s === 1) {
    var b1 = document.getElementById('c1-run-block');
    var b2 = document.getElementById('c2-s1-run-block');
    if (b1) b1.style.display = hidden ? 'none' : 'flex';
    if (b2) b2.style.display = hidden ? 'none' : 'flex';
    document.getElementById('c1-metrics').className = 'metrics' + (hidden ? ' cols2' : '');
  } else {
    var b = document.getElementById('c2-s2-run-block');
    if (b) b.style.display = hidden ? 'none' : 'flex';
  }
  updateTotRun();
}

function setRPE(s, val) {
  var v = Math.round(val);
  if (s === 1) { sync('c1-rpe', v); sync('c2-s1-rpe', v); sync('rpe1-disp', v); }
  else { sync('c2-s2-rpe', v); sync('rpe2-disp', v); }
}

function setTotCal(val) { document.getElementById('c-tot-cal').textContent = val + ' kcal'; }

function setWorkout(val) {
  var el = document.getElementById('c1-workout');
  if (el) el.textContent = val || '';
  var block = document.getElementById('c1-workout-block');
  if (block) block.style.display = val ? 'block' : 'none';
}

async function importSession(sessionNum) {
  var inputId = sessionNum === 1 ? 'screenshot-s1' : 'screenshot-s2';
  var input = document.getElementById(inputId);
  input.click();
}

async function processScreenshot(file, sessionNum) {
  var statusId = sessionNum === 1 ? 'import-status-s1' : 'import-status-s2';
  var statusEl = document.getElementById(statusId);
  statusEl.textContent = 'Reading session...';

  var reader = new FileReader();
  reader.onload = async function(e) {
    var base64 = e.target.result.split(',')[1];
    var mediaType = file.type || 'image/jpeg';
    try {
      var response = await fetch('/api/import-session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ image: base64, mediaType: mediaType })
});
var parsed = await response.json();
if (parsed.error) throw new Error(parsed.error);

      if (sessionNum === 1) {
        if (parsed.name) { document.getElementById('e-s1-name').value = parsed.name; syncBoth('c1-name','c2-s1-name', parsed.name); }
        if (parsed.duration_min) { document.getElementById('e-s1-dur-min').value = parsed.duration_min; updateDurations(); }
        if (parsed.distance_km !== null && parsed.distance_km !== undefined) {
          var norun = document.getElementById('s1-norun');
          if (parsed.distance_km > 0) { norun.checked = false; toggleRun(1, false); document.getElementById('e-s1-run').value = parsed.distance_km; setRun(1, parsed.distance_km); }
          else { norun.checked = true; toggleRun(1, true); }
        }
        if (parsed.avg_hr) { document.getElementById('e-s1-hr').value = parsed.avg_hr; setHR(1, parsed.avg_hr); }
        if (parsed.calories) { document.getElementById('e-s1-cal').value = parsed.calories; setCal(1, parsed.calories); }
        if (parsed.workout_description) { document.getElementById('e-workout').value = parsed.workout_description; setWorkout(parsed.workout_description); }
        statusEl.textContent = 'Imported ✓';
      } else {
        if (parsed.name) { document.getElementById('e-s2-name').value = parsed.name; sync('c2-s2-name', parsed.name); }
        if (parsed.duration_min) { document.getElementById('e-s2-dur-min').value = parsed.duration_min; updateDurations(); }
        if (parsed.distance_km !== null && parsed.distance_km !== undefined) {
          var norun2 = document.getElementById('s2-norun');
          if (parsed.distance_km > 0) { norun2.checked = false; toggleRun(2, false); document.getElementById('e-s2-run').value = parsed.distance_km; setRun(2, parsed.distance_km); }
          else { norun2.checked = true; toggleRun(2, true); }
        }
        if (parsed.avg_hr) { document.getElementById('e-s2-hr').value = parsed.avg_hr; setHR(2, parsed.avg_hr); }
        if (parsed.calories) { document.getElementById('e-s2-cal').value = parsed.calories; setCal(2, parsed.calories); }
        statusEl.textContent = 'Imported ✓';
      }
      updateTotRun();
    } catch(err) {
      statusEl.textContent = 'Could not read — fill manually';
    }
  };
  reader.readAsDataURL(file);
}

function handleLogo(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var dataUrl = e.target.result;
    var cardLogo = document.getElementById('c-logo');
    var preview = document.getElementById('logo-preview');
    cardLogo.src = dataUrl; cardLogo.style.display = 'block';
    preview.src = dataUrl; preview.style.display = 'block';
    document.getElementById('logo-clear').style.display = 'inline-block';
    localStorage.setItem('htd-logo', dataUrl);
  };
  reader.readAsDataURL(file);
}

function clearLogo() {
  document.getElementById('c-logo').style.display = 'none';
  document.getElementById('c-logo').src = '';
  document.getElementById('logo-preview').style.display = 'none';
  document.getElementById('logo-clear').style.display = 'none';
  localStorage.removeItem('htd-logo');
}

function save() {
  var data = {
    race: document.getElementById('e-race-name').value,
    raceDate: document.getElementById('e-race-date').value,
    raceType: document.getElementById('e-race-type').value,
    div: (document.querySelector('#div-pills .pill.active') || {}).dataset?.div || 'Solo Pro'
  };
  localStorage.setItem('htd', JSON.stringify(data));
}

function load() {
  try {
    var logo = localStorage.getItem('htd-logo');
    if (logo) {
      document.getElementById('c-logo').src = logo; document.getElementById('c-logo').style.display = 'block';
      document.getElementById('logo-preview').src = logo; document.getElementById('logo-preview').style.display = 'block';
      document.getElementById('logo-clear').style.display = 'inline-block';
    }
    var data = JSON.parse(localStorage.getItem('htd') || '{}');
    if (data.raceType) { document.getElementById('e-race-type').value = data.raceType; handleRaceType(); }
    if (data.race) document.getElementById('e-race-name').value = data.race;
    if (data.raceDate) document.getElementById('e-race-date').value = data.raceDate;
    if (data.div) {
      document.querySelectorAll('#div-pills .pill').forEach(b => b.classList.toggle('active', b.dataset.div === data.div));
      sync('c-race-div', data.div);
    }
    setRace();
  } catch(e) {}
}

async function saveCard() {
  var btn = document.getElementById('save-label');
  btn.textContent = 'Generating...';
  try {
    var card = document.getElementById('card');
    var canvas = await html2canvas(card, { backgroundColor: null, scale: 3, useCORS: true, logging: false });
    canvas.toBlob(async function(blob) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        btn.textContent = 'Copied! Paste into Stories ✓';
      } catch(e) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = 'hyrox-training.png'; a.click();
        btn.textContent = 'Saved to files ✓';
      }
      setTimeout(() => btn.textContent = 'Copy card to clipboard', 3000);
    }, 'image/png');
  } catch(e) { btn.textContent = 'Try again'; }
}

updateDate();
load();
toggleRun(2, true);
updateDurations();
updateTotRun();
