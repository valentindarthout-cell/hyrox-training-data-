/* ================================================================
   OCTA. perf.js — Performance Profile (Week 3 Phase 1, v2)
   Clean read-only display by default; single "Edit" toggle reveals
   the full dropdown-based edit form (PRs + division + lifts together).
   Injects:
   - "Performance" card into athlete Settings (after Lift maxes card)
   - "Performance" card into coach athlete view (below Programming card)
   Both editable; last write wins.
================================================================ */

/* ---------- official race weights (division-derived) ---------- */
const RACE_WEIGHTS = {
  'W-Open': { sled_push:'102 kg', sled_pull:'78 kg',  farmers:'2 × 16 kg', lunges:'10 kg', wallball:'4 kg' },
  'W-Pro':  { sled_push:'152 kg', sled_pull:'103 kg', farmers:'2 × 24 kg', lunges:'20 kg', wallball:'6 kg' },
  'M-Open': { sled_push:'152 kg', sled_pull:'103 kg', farmers:'2 × 24 kg', lunges:'20 kg', wallball:'6 kg' },
  'M-Pro':  { sled_push:'202 kg', sled_pull:'153 kg', farmers:'2 × 32 kg', lunges:'30 kg', wallball:'9 kg' },
};
const RW_LABELS = { sled_push:'Sled push', sled_pull:'Sled pull', farmers:'Farmers carry', lunges:'Sandbag lunges', wallball:'Wall ball' };

/* PR fields: [key, label, hasHours] */
const PR_FIELDS = [
  ['run_5k','5k', false], ['run_10k','10k', false],
  ['half','Half marathon', true], ['marathon','Marathon', true],
  ['row_2k','Row 2k', false], ['ski_2k','Ski 2k', false],
];

/* ---------- time dropdown helpers ---------- */
function perfTimeSelects(idBase, value, hasHours){
  let h=0,m=0,s=0;
  if(value){
    const p=value.split(':').map(Number);
    if(p.length===3){ h=p[0]; m=p[1]; s=p[2]; }
    else if(p.length===2){ m=p[0]; s=p[1]; }
  }
  const opt=(n,cur,pad)=>Array.from({length:n},(_,i)=>`<option value="${i}" ${i===cur?'selected':''}>${pad?String(i).padStart(2,'0'):i}</option>`).join('');
  return `<div class="perf-time">
    ${hasHours?`<select id="${idBase}_h">${opt(7,h,false)}</select><span>:</span>`:''}
    <select id="${idBase}_m">${opt(hasHours?60:100,m,true)}</select><span>:</span>
    <select id="${idBase}_s">${opt(60,s,true)}</select>
  </div>`;
}
function perfReadTime(idBase, hasHours){
  const g=id=>{ const el=document.getElementById(id); return el?parseInt(el.value):0; };
  const h=hasHours?g(idBase+'_h'):0, m=g(idBase+'_m'), s=g(idBase+'_s');
  if(h===0&&m===0&&s===0) return null;
  return hasHours&&h>0? h+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')
                      : m+':'+String(s).padStart(2,'0');
}

/* ---------- maxes: legacy number OR {rm1,rm3,rm10} ---------- */
function perfGetRM(mx,lift,tier){
  const v=(mx||{})[lift];
  if(v==null) return '';
  if(typeof v==='number') return tier==='rm1'? v : '';
  return v[tier]??'';
}

/* ================================================================
   READ-ONLY VIEW
================================================================ */
function perfViewHTML(p, idPrefix){
  const prs=p.prs||{};
  const g=p.gender||null, cat=p.category||null;
  const rwKey=g&&cat? g+'-'+cat : null;
  const rw=rwKey? RACE_WEIGHTS[rwKey] : null;
  const mx=p.maxes||{};
  const anyPR = PR_FIELDS.some(([k])=>prs[k]);
  const anyLift = LIFTS.some(l=>perfGetRM(mx,l.k,'rm1')!=='');
  const hasTiers = LIFTS.some(l=>perfGetRM(mx,l.k,'rm3')!==''||perfGetRM(mx,l.k,'rm10')!=='');

  return `
    <div class="perf-view">
      <div class="section-sublabel">Run & erg PRs</div>
      ${anyPR ? `<div class="perf-view-grid">
        ${PR_FIELDS.map(([k,label])=>prs[k]?`<div class="perf-view-item"><span>${label}</span><b>${prs[k]}</b></div>`:'').join('')}
      </div>` : `<div class="hint">No PRs set yet.</div>`}

      <div class="section-sublabel">Division</div>
      ${g&&cat ? `<div class="perf-view-tag">${g==='M'?'Men':'Women'} · ${cat}</div>` : `<div class="hint">Not set.</div>`}
      ${rw?`<div class="perf-rw">${Object.keys(rw).map(k=>`<div class="perf-rw-row"><span>${RW_LABELS[k]}</span><b>${rw[k]}</b></div>`).join('')}</div>`:''}

      <div class="section-sublabel">Lifts — 1RM kg</div>
      ${anyLift ? `<div class="perf-view-grid">
        ${LIFTS.map(l=>{ const v=perfGetRM(mx,l.k,'rm1'); return v!==''?`<div class="perf-view-item"><span>${l.label}</span><b>${v}</b></div>`:''; }).join('')}
      </div>` : `<div class="hint">No lifts set yet.</div>`}
      ${hasTiers?`<button class="mini-btn" style="margin-top:10px" onclick="perfToggleViewTiers('${idPrefix}')">3RM / 10RM ▾</button>
      <div id="${idPrefix}viewTiers" style="display:none">
        ${['rm3','rm10'].map(t=>{
          const rows=LIFTS.map(l=>{ const v=perfGetRM(mx,l.k,t); return v!==''?`<div class="perf-view-item"><span>${l.label}</span><b>${v}</b></div>`:''; }).join('');
          return rows? `<div class="section-sublabel">${t==='rm3'?'3RM kg':'10RM kg'}</div><div class="perf-view-grid">${rows}</div>` : '';
        }).join('')}
      </div>`:''}

      <button class="btn-slim secondary" style="margin-top:16px" onclick="perfEnterEdit('${idPrefix}')">Edit performance</button>
    </div>`;
}
function perfToggleViewTiers(prefix){
  const el=document.getElementById(prefix+'viewTiers');
  el.style.display = el.style.display==='none'?'block':'none';
}

/* ================================================================
   EDIT FORM
================================================================ */
function perfEditHTML(p, idPrefix){
  const prs=p.prs||{};
  const g=p.gender||null, cat=p.category||null;
  const rwKey=g&&cat? g+'-'+cat : null;
  const rw=rwKey? RACE_WEIGHTS[rwKey] : null;
  return `
    <div class="section-sublabel">Run & erg PRs</div>
    <div class="perf-grid">
      ${PR_FIELDS.map(([k,label,hh])=>`
        <div class="perf-field"><label>${label}</label>${perfTimeSelects(idPrefix+k, prs[k], hh)}</div>`).join('')}
    </div>
    <div class="section-sublabel">Division</div>
    <div class="pill-row">
      ${['M','W'].map(x=>`<button class="pill ${g===x?'active':''}" onclick="perfPick('${idPrefix}','gender','${x}')">${x==='M'?'Men':'Women'}</button>`).join('')}
      <span style="width:10px"></span>
      ${['Pro','Open'].map(x=>`<button class="pill ${cat===x?'active':''}" onclick="perfPick('${idPrefix}','category','${x}')">${x}</button>`).join('')}
    </div>
    ${rw?`<div class="perf-rw">${Object.keys(rw).map(k=>`<div class="perf-rw-row"><span>${RW_LABELS[k]}</span><b>${rw[k]}</b></div>`).join('')}</div>`
        :'<div class="hint">Pick division to see your official race weights.</div>'}
    <div class="section-sublabel">Lifts — 1RM kg</div>
    <div class="settings-grid">
      ${LIFTS.map(l=>`<div class="macro-field"><label>${l.label}</label>
        <input id="${idPrefix}rm1_${l.k}" type="number" inputmode="decimal" step="0.5" value="${perfGetRM(p.maxes,l.k,'rm1')}"></div>`).join('')}
    </div>
    <button class="mini-btn" style="margin-top:10px" onclick="perfToggleTiers('${idPrefix}')">3RM / 10RM ▾</button>
    <div id="${idPrefix}tiers" style="display:none">
      ${['rm3','rm10'].map(t=>`
        <div class="section-sublabel">${t==='rm3'?'3RM kg':'10RM kg'}</div>
        <div class="settings-grid">
          ${LIFTS.map(l=>`<div class="macro-field"><label>${l.label}</label>
            <input id="${idPrefix}${t}_${l.k}" type="number" inputmode="decimal" step="0.5" value="${perfGetRM(p.maxes,l.k,t)}"></div>`).join('')}
        </div>`).join('')}
    </div>
    <div class="sp-actions" style="margin-top:16px">
      <button class="btn-slim" onclick="perfSave('${idPrefix}')">Save performance</button>
      <button class="btn-slim secondary" onclick="perfCancelEdit('${idPrefix}')">Cancel</button>
      <div id="${idPrefix}msg" class="save-msg" style="margin:0;text-align:left"></div>
    </div>`;
}

/* ---------- shared state: committed (saved) vs draft (being edited) ---------- */
const perfCtx = {};   // { mount, athleteId, mode:'view'|'edit', committed:{}, draft:{} }

function perfClone(o){ return JSON.parse(JSON.stringify(o||{})); }
function perfRenderCurrent(prefix){
  const ctx=perfCtx[prefix];
  document.getElementById(ctx.mount).innerHTML = ctx.mode==='edit'
    ? perfEditHTML(ctx.draft, prefix)
    : perfViewHTML(ctx.committed, prefix);
}
function perfEnterEdit(prefix){
  const ctx=perfCtx[prefix];
  ctx.draft=perfClone(ctx.committed);
  ctx.mode='edit';
  perfRenderCurrent(prefix);
}
function perfCancelEdit(prefix){
  const ctx=perfCtx[prefix];
  ctx.mode='view';
  perfRenderCurrent(prefix);
}
function perfPick(prefix, field, val){
  perfCollect(prefix);
  perfCtx[prefix].draft[field]=val;
  perfRenderCurrent(prefix);
}
function perfToggleTiers(prefix){
  const el=document.getElementById(prefix+'tiers');
  el.style.display = el.style.display==='none'?'block':'none';
}
function perfCollect(prefix){
  const d=perfCtx[prefix].draft;
  d.prs=d.prs||{};
  PR_FIELDS.forEach(([k,_,hh])=>{
    const el=document.getElementById(prefix+k+'_m');
    if(el) d.prs[k]=perfReadTime(prefix+k, hh);
  });
  const mx={};
  LIFTS.forEach(l=>{
    const tierVals={};
    ['rm1','rm3','rm10'].forEach(t=>{
      const el=document.getElementById(prefix+t+'_'+l.k);
      if(el && el.value!=='') tierVals[t]=parseFloat(el.value);
    });
    if(Object.keys(tierVals).length) mx[l.k]=tierVals;
  });
  if(document.getElementById(prefix+'rm1_'+LIFTS[0].k)) d.maxes=mx;
}
async function perfSave(prefix){
  const ctx=perfCtx[prefix];
  perfCollect(prefix);
  const d=ctx.draft;
  const msg=document.getElementById(prefix+'msg');
  msg.textContent='Saving…';
  const body={ prs:d.prs, maxes:d.maxes, gender:d.gender||null, category:d.category||null };
  try{
    if(ctx.athleteId){
      await api('/api/coach',{method:'POST',body:JSON.stringify({action:'save-performance',athlete_id:ctx.athleteId,...body})});
    }else{
      await api('/api/profile',{method:'PUT',body:JSON.stringify(body)});
      profile.prs=d.prs; profile.maxes=d.maxes; profile.gender=d.gender; profile.category=d.category;
    }
    ctx.committed=perfClone(d);
    ctx.mode='view';
    perfRenderCurrent(prefix);
  }catch(e){ msg.textContent=e.message; }
}

/* ---------- mount: athlete settings ---------- */
function renderPerformanceCard(){
  if(!document.getElementById('maxesGrid')) return;
  let host=document.getElementById('perfCardHost');
  if(!host){
    const maxesCard=document.getElementById('maxesGrid').closest('.section-card');
    maxesCard.insertAdjacentHTML('afterend',
      '<div class="section-card"><div class="section-label">Performance</div><div id="perfCardHost"></div></div>');
    maxesCard.style.display='none';
    host=document.getElementById('perfCardHost');
  }
  perfCtx['perf_']={ mount:'perfCardHost', athleteId:null, mode:'view',
    committed:{ prs:{...(profile.prs||{})}, maxes:JSON.parse(JSON.stringify(profile.maxes||{})),
                gender:profile.gender||null, category:profile.category||null },
    draft:null };
  perfRenderCurrent('perf_');
}

/* ---------- mount: coach athlete view ---------- */
function renderCoachPerf(athlete){
  const calCard=document.getElementById('caCalendar')?.closest('.section-card');
  if(!calCard) return;
  let host=document.getElementById('caPerfHost');
  if(!host){
    calCard.insertAdjacentHTML('afterend',
      '<div class="section-card"><div class="section-label">Performance</div><div id="caPerfHost"><div class="empty-state">Loading…</div></div></div>');
    host=document.getElementById('caPerfHost');
  }
  api(`/api/coach?action=performance&athlete_id=${athlete.id}`).then(d=>{
    const p=d.performance||{};
    perfCtx['caperf_']={ mount:'caPerfHost', athleteId:athlete.id, mode:'view',
      committed:{ prs:{...(p.prs||{})}, maxes:JSON.parse(JSON.stringify(p.maxes||{})),
                  gender:p.gender||null, category:p.category||null },
      draft:null };
    perfRenderCurrent('caperf_');
  }).catch(e=>{ host.innerHTML='<div class="hint">'+e.message+'</div>'; });
}
