function showTab(t) {
  document.getElementById('view-preview').style.display = t === 'preview' ? 'block' : 'none';
  document.getElementById('view-edit').style.display = t === 'edit' ? 'block' : 'none';
  document.getElementById('tab-preview').classList.toggle('active', t === 'preview');
  document.getElementById('tab-edit').classList.toggle('active', t === 'edit');
  if (t === 'preview') { updateDate(); applyEmptyFieldVisibility(); }
  if (t === 'edit') { restoreAllFields(); }
}

function applyEmptyFieldVisibility() {
  var checks = [
    ['c1-dur-block','c1-dur-val'],['c1-run-block','c1-run'],['c1-pace-block','c1-pace'],
    ['c1-hr-block','c1-hr'],['c1-cal-block','c1-cal'],
    ['c2-s1-dur-block','c2-s1-dur'],['c2-s1-run-block','c2-s1-run'],['c2-s1-pace-block','c2-s1-pace'],
    ['c2-s1-hr-block','c2-s1-hr'],['c2-s1-cal-block','c2-s1-cal'],
    ['c2-s2-dur-block','c2-s2-dur'],['c2-s2-run-block','c2-s2-run'],['c2-s2-pace-block','c2-s2-pace'],
    ['c2-s2-hr-block','c2-s2-hr'],['c2-s2-cal-block','c2-s2-cal']
  ];
  checks.forEach(function(c) {
    var block = document.getElementById(c[0]);
    var val = document.getElementById(c[1]);
    if (!block || !val) return;
    var txt = val.textContent.replace(/\s+/g,'');
    var empty = txt === '' || txt === '—' || txt === '0' || txt === 'min/km' || txt === 'bpm' || txt === 'kcal' || txt === 'km' || txt === 'min';
    block.style.display = empty ? 'none' : 'flex';
  });
}

function restoreAllFields() {
  var ids = [
    'c1-dur-block','c1-run-block','c1-pace-block','c1-hr-block','c1-cal-block',
    'c2-s1-dur-block','c2-s1-run-block','c2-s1-pace-block','c2-s1-hr-block','c2-s1-cal-block',
    'c2-s2-dur-block','c2-s2-run-block','c2-s2-pace-block','c2-s2-hr-block','c2-s2-cal-block'
  ];
  ids.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  });
  toggleRun(1, document.getElementById('s1-norun').checked);
  toggleRun(2, document.getElementById('s2-norun').checked);
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
  var raceDays = document.getElementById('c-race-days');
  if (type === 'race') {
    document.getElementById('race-fields').style.display = 'block';
    setRace();
  } else {
    document.getElementById('race-fields').style.display = 'none';
    sync('c-race-name', type === 'offseason' ? 'Off season training' : 'General prep');
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
  document.querySelectorAll('#div-pills .pill').forEach(function(b) { b.classList.remove('active'); });
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
  if (mins <= 0) return '';
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
  document.getElementById('c1-dur-val').innerHTML = s1 ? s1 + ' <span class="metric-unit">min</span>' : '';
  document.getElementById('c2-s1-dur').innerHTML = s1 ? s1 + ' <span class="metric-sm-unit">min</span>' : '';
  document.getElementById('c2-s2-dur').innerHTML = s2 ? s2 + ' <span class="metric-sm-unit">min</span>' : '';
  sync('c-tot-time', formatDuration(s1 + s2));
  var d = document.getElementById('e-tot-time-display');
  if (d) d.value = formatDuration(s1 + s2);
}

function autoCalcPace(s) {
  var mins = parseMins(s === 1 ? 'e-s1-dur-min' : 'e-s2-dur-min');
  var km = parseFloat(document.getElementById(s === 1 ? 'e-s1-run' : 'e-s2-run').value) || 0;
  var paceEl = document.getElementById(s === 1 ? 'e-s1-pace' : 'e-s2-pace');
  if (km > 0 && mins > 0) {
    var pd = mins / km;
    var pm = Math.floor(pd);
    var ps = Math.round((pd - pm) * 60);
    var str = pm + ':' + (ps < 10 ? '0' : '') + ps;
    paceEl.value = str;
    setPace(s, str);
  }
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

function updateTotRun() {
  var s1norun = document.getElementById('s1-norun').checked;
  var s2norun = document.getElementById('s2-norun').checked;
  var s1 = s1norun ? 0 : parseKm('e-s1-run');
  var s2 = currentSess === 2 && !s2norun ? parseKm('e-s2-run') : 0;
  var total = s1 + s2;
  var display = total > 0 ? total.toFixed(1).replace(/\.0$/, '') + ' km' : '';
  sync('c-tot-run', display);
  var el = document.getElementById('e-tot-run-display');
  if (el) el.value = display;
}

function setHR(s, val) {
  var u = ' <span class="metric-unit">bpm</span>';
  var us = ' <span class="metric-sm-unit">bpm</span>';
  if (s === 1) {
    document.getElementById('c1-hr').innerHTML = val ? val + u : '';
    document.getElementById('c2-s1-hr').innerHTML = val ? val + us : '';
  } else {
    document.getElementById('c2-s2-hr').innerHTML = val ? val + us : '';
  }
}

function setCal(s, val) {
  var u = ' <span class="metric-unit">kcal</span>';
  var us = ' <span class="metric-sm-unit">kcal</span>';
  if (s === 1) {
    document.getElementById('c1-cal').innerHTML = val ? val + u : '';
    document.getElementById('c2-s1-cal').innerHTML = val ? val + us : '';
  } else {
    document.getElementById('c2-s2-cal').innerHTML = val ? val + us : '';
  }
}

function setRun(s, val) {
  var u = ' <span class="metric-unit">km</span>';
  var us = ' <span class="metric-sm-unit">km</span>';
  if (s === 1) {
    document.getElementById('c1-run').innerHTML = val ? val + u : '';
    document.getElementById('c2-s1-run').innerHTML = val ? val + us : '';
  } else {
    var el = document.getElementById('c2-s2-run');
    if (el) el.innerHTML = val ? val + us : '';
  }
  updateTotRun();
}

function toggleRun(s, hidden) {
  if (s === 1) {
    ['c1-run-block','c2-s1-run-block'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = hidden ? 'none' : 'flex';
    });
    ['c1-pace-block','c2-s1-pace-block'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = hidden ? 'none' : 'flex';
    });
  } else {
    ['c2-s2-run-block','c2-s2-pace-block'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = hidden ? 'none' : 'flex';
    });
  }
  updateTotRun();
}

function setRPE(s, val) {
  var v = Math.round(val);
  if (s === 1) { sync('c1-rpe', v); sync('c2-s1-rpe', v); sync('rpe1-disp', v); }
  else { sync('c2-s2-rpe', v); sync('rpe2-disp', v); }
}

function setTotCal(val) { sync('c-tot-cal', val ? val + ' kcal' : ''); }

function setWorkout(val) {
  var el = document.getElementById('c1-workout');
  if (el) el.innerHTML = val ? val.replace(/\n/g, '<br>') : '';
  var block = document.getElementById('c1-workout-block');
  if (block) block.style.display = val ? 'block' : 'none';
}

async function processScreenshot(file, sessionNum) {
  var statusEl = document.getElementById(sessionNum === 1 ? 'import-status-s1' : 'import-status-s2');
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
        if (parsed.distance_km > 0) { document.getElementById('s1-norun').checked = false; toggleRun(1,false); document.getElementById('e-s1-run').value = parsed.distance_km; setRun(1, parsed.distance_km); }
        else if (parsed.distance_km === 0) { document.getElementById('s1-norun').checked = true; toggleRun(1,true); }
        if (parsed.avg_hr) { document.getElementById('e-s1-hr').value = parsed.avg_hr; setHR(1, parsed.avg_hr); }
        if (parsed.calories) { document.getElementById('e-s1-cal').value = parsed.calories; setCal(1, parsed.calories); }
        if (parsed.workout_description) { document.getElementById('e-workout').value = parsed.workout_description; setWorkout(parsed.workout_description); }
        autoCalcPace(1);
      } else {
        if (parsed.name) { document.getElementById('e-s2-name').value = parsed.name; sync('c2-s2-name', parsed.name); }
        if (parsed.duration_min) { document.getElementById('e-s2-dur-min').value = parsed.duration_min; updateDurations(); }
        if (parsed.distance_km > 0) { document.getElementById('s2-norun').checked = false; toggleRun(2,false); document.getElementById('e-s2-run').value = parsed.distance_km; setRun(2, parsed.distance_km); }
        else if (parsed.distance_km === 0) { document.getElementById('s2-norun').checked = true; toggleRun(2,true); }
        if (parsed.avg_hr) { document.getElementById('e-s2-hr').value = parsed.avg_hr; setHR(2, parsed.avg_hr); }
        if (parsed.calories) { document.getElementById('e-s2-cal').value = parsed.calories; setCal(2, parsed.calories); }
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

function handleLogo(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var dataUrl = e.target.result;
    document.getElementById('c-logo').src = dataUrl; document.getElementById('c-logo').style.display = 'block';
    document.getElementById('logo-preview').src = dataUrl; document.getElementById('logo-preview').style.display = 'block';
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
    div: (document.querySelector('#div-pills .pill.active') || {}).dataset.div || 'Solo Pro'
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
      document.querySelectorAll('#div-pills .pill').forEach(function(b) { b.classList.toggle('active', b.dataset.div === data.div); });
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
      setTimeout(function() { btn.textContent = 'Copy card to clipboard'; }, 3000);
    }, 'image/png');
  } catch(e) { btn.textContent = 'Try again'; }
}

updateDate();
load();
setSess(1);
toggleRun(2, true);
updateDurations();
updateTotRun();
showTab('preview');
