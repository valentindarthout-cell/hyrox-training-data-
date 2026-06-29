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
}

function parseMins(id) {
  return parseInt(document.getElementById(id).value) || 0;
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
  var s1fmt = formatDuration(s1);
  var s2fmt = formatDuration(s2);
  var totalFmt = formatDuration(s1 + s2);
  syncBoth('c1-dur', 'c2-s1-dur', s1fmt);
  sync('c2-s2-dur', s2fmt);
  sync('c-tot-time', totalFmt);
  var displayEl = document.getElementById('e-tot-time-display');
  if (displayEl) displayEl.value = totalFmt;
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
}

function setRPE(s, val) {
  var v = Math.round(val);
  if (s === 1) { sync('c1-rpe', v); sync('c2-s1-rpe', v); sync('rpe1-disp', v); }
  else { sync('c2-s2-rpe', v); sync('rpe2-disp', v); }
}

function setTotRun(val) { document.getElementById('c-tot-run').textContent = val + ' km'; }
function setTotCal(val) { document.getElementById('c-tot-cal').textContent = val + ' kcal'; }

function handleLogo(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var dataUrl = e.target.result;
    var cardLogo = document.getElementById('c-logo');
    var preview = document.getElementById('logo-preview');
    cardLogo.src = dataUrl;
    cardLogo.style.display = 'block';
    preview.src = dataUrl;
    preview.style.display = 'block';
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
      var cardLogo = document.getElementById('c-logo');
      var preview = document.getElementById('logo-preview');
      cardLogo.src = logo;
      cardLogo.style.display = 'block';
      preview.src = logo;
      preview.style.display = 'block';
      document.getElementById('logo-clear').style.display = 'inline-block';
    }
    var data = JSON.parse(localStorage.getItem('htd') || '{}');
    if (data.raceType) {
      document.getElementById('e-race-type').value = data.raceType;
      handleRaceType();
    }
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
        var a = document.createElement('a');
        a.href = url; a.download = 'hyrox-training.png'; a.click();
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
