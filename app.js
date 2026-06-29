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

function syncBoth(id1, id2, val) {
  sync(id1, val); sync(id2, val);
}

function updateDate() {
  var d = new Date();
  var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  sync('c-date', days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()]);
}

function setRace() {
  var name = document.getElementById('e-race-name').value;
  var dv = document.getElementById('e-race-date').value;
  sync('c-race-name', name || '—');
  if (dv) {
    var race = new Date(dv);
    var today = new Date(); today.setHours(0,0,0,0);
    var diff = Math.round((race - today) / 86400000);
    sync('c-race-days', diff > 0 ? diff + ' days out' : diff === 0 ? 'Race day! 🔥' : Math.abs(diff) + ' days ago');
  } else {
    sync('c-race-days', 'Set race date');
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

function setHRV(state) {
  ['opt','elv','low'].forEach(s => {
    var btn = document.getElementById('hb-' + s);
    btn.className = 'hrv-btn' + (s === state ? ' active-' + s : '');
  });
  var dot = document.getElementById('c-hrv-dot');
  var txt = document.getElementById('c-hrv-text');
  dot.className = 'hrv-dot dot-' + state;
  txt.className = 'hrv-' + state;
  txt.textContent = { opt: 'Optimal', elv: 'Elevated', low: 'Low' }[state];
}

function save() {
  var data = {
    race: document.getElementById('e-race-name').value,
    raceDate: document.getElementById('e-race-date').value,
    div: (document.querySelector('#div-pills .pill.active') || {}).dataset?.div || 'Solo Pro'
  };
  localStorage.setItem('htd', JSON.stringify(data));
}

function load() {
  try {
    var data = JSON.parse(localStorage.getItem('htd') || '{}');
    if (data.race) { document.getElementById('e-race-name').value = data.race; }
    if (data.raceDate) { document.getElementById('e-race-date').value = data.raceDate; }
    if (data.div) {
      document.querySelectorAll('#div-pills .pill').forEach(b => {
        b.classList.toggle('active', b.dataset.div === data.div);
      });
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
    var canvas = await html2canvas(card, {
      backgroundColor: null,
      scale: 3,
      useCORS: true,
      logging: false
    });
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
  } catch(e) {
    btn.textContent = 'Try again';
  }
}

updateDate();
load();
toggleRun(2, true);
