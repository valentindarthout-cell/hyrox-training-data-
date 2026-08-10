/* ================================================================
   OCTA. crm.js — Coach athlete CRM card (clean view/edit toggle)
   Requires tracks-plan.js loaded first (coachTracks, trackById, athToggleTrack).
   Replaces the old static CRM section entirely — mount into #crmHost.
================================================================ */

const CRM_STATUSES=[
  {k:'active', label:'Active'},
  {k:'paused', label:'Paused'},
  {k:'churned', label:'Churned'}
];
let crmMode='view', crmDraft=null;

function crmDateSelects(idBase,value){
  let d=null,m=null,y=null;
  if(value){ const p=value.split('-'); y=parseInt(p[0]); m=parseInt(p[1]); d=parseInt(p[2]); }
  const dayOpts=Array.from({length:31},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===d?'selected':''}>${n}</option>`).join('');
  const monOpts=MONTH_NAMES.map((n,i)=>`<option value="${i+1}" ${i+1===m?'selected':''}>${n}</option>`).join('');
  const curY=new Date().getFullYear();
  const yearOpts=Array.from({length:6},(_,i)=>curY+1-i).map(n=>`<option value="${n}" ${n===y?'selected':''}>${n}</option>`).join('');
  return `<div class="dob-selects">
    <select id="${idBase}_d"><option value="">DD</option>${dayOpts}</select>
    <select id="${idBase}_m"><option value="">MM</option>${monOpts}</select>
    <select id="${idBase}_y"><option value="">YYYY</option>${yearOpts}</select>
  </div>`;
}
function crmDateRead(idBase){
  const d=document.getElementById(idBase+'_d').value, m=document.getElementById(idBase+'_m').value, y=document.getElementById(idBase+'_y').value;
  if(!d||!m||!y) return null;
  return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}

function renderCrmCard(athlete){
  let host=document.getElementById('crmHost');
  if(!host) return;
  const crm=athlete.crm||{};
  crmMode='view';
  crmDraft={ start_date:crm.start_date||null, monthly_price:crm.monthly_price??null,
             status:crm.status||'active', notes:crm.notes||'' };
  window._crmAthlete=athlete;
  crmPaint();
}
function crmPaint(){
  const host=document.getElementById('crmHost');
  const athlete=window._crmAthlete;
  const d=crmDraft;
  host.innerHTML = crmMode==='view' ? crmViewHTML(athlete,d) : crmEditHTML(athlete,d);
  if(crmMode==='edit') crmPaintStatusPills();
}
function crmStatusLabel(k){ return (CRM_STATUSES.find(s=>s.k===k)||{}).label || 'Active'; }

function crmViewHTML(athlete, d){
  const tracks=(athlete.track_ids||[]).map(id=>trackById(id)).filter(Boolean);
  return `
    <div class="crm-view-row">
      <span class="crm-status-chip ${d.status}">${crmStatusLabel(d.status)}</span>
      ${d.monthly_price!=null?`<span class="crm-price">€${d.monthly_price}<small>/mo</small></span>`:''}
      ${d.start_date?`<span class="crm-since">since ${fmtShort(d.start_date)}</span>`:''}
    </div>
    <div class="section-sublabel">Tracks</div>
    <div class="pill-row wrap">
      ${tracks.length? tracks.map(t=>`<span class="cw-track" style="background:${t.color};font-size:9px;padding:4px 12px">${esc(t.name)}</span>`).join('')
                     : '<span class="hint">No tracks assigned.</span>'}
    </div>
    <div class="section-sublabel">Notes</div>
    <div class="crm-notes-view">${d.notes? esc(d.notes).replace(/\n/g,'<br>') : '<span class="hint">No notes yet.</span>'}</div>
    <button class="btn-slim secondary" style="margin-top:14px" onclick="crmEnterEdit()">Edit</button>`;
}
function crmEditHTML(athlete, d){
  return `
    <div class="settings-grid two">
      <div class="macro-field"><label>Start date</label>${crmDateSelects('crmStart', d.start_date)}</div>
      <div class="macro-field"><label>€ / month</label><input id="crmPrice" type="number" inputmode="decimal" value="${d.monthly_price??''}"></div>
    </div>
    <div class="section-sublabel">Status</div>
    <div class="pill-row" id="crmStatusPills"></div>
    <div class="section-sublabel">Tracks</div>
    <div class="pill-row wrap" id="crmTracksEdit"></div>
    <div class="section-sublabel">Notes</div>
    <textarea id="crmNotes" class="text-input" placeholder="Notes">${esc(d.notes||'')}</textarea>
    <div class="sp-actions" style="margin-top:12px">
      <button class="btn-slim" onclick="crmSave()">Save</button>
      <button class="btn-slim secondary" onclick="crmCancel()">Cancel</button>
      <div id="crmMsg" class="save-msg" style="margin:0;text-align:left"></div>
    </div>`;
}
function crmPaintStatusPills(){
  document.getElementById('crmStatusPills').innerHTML=CRM_STATUSES.map(s=>
    `<button class="pill crm-status-pill ${s.k} ${crmDraft.status===s.k?'active':''}" onclick="crmPickStatus('${s.k}')">${s.label}</button>`).join('');
  crmPaintTracksEdit();
}
function crmPickStatus(k){
  crmDraft.status=k;
  document.querySelectorAll('.crm-status-pill').forEach(b=>b.classList.toggle('active',b.classList.contains(k)));
}
function crmPaintTracksEdit(){
  const el=document.getElementById('crmTracksEdit'); if(!el) return;
  const athlete=window._crmAthlete;
  el.innerHTML=coachTracks.length? coachTracks.map(t=>{
    const on=(athlete.track_ids||[]).includes(t.id);
    return `<button class="pill" style="${on?`background:${t.color};color:#fff;border-color:${t.color};`:''}"
      onclick="crmToggleTrack('${t.id}')">${esc(t.name)}</button>`;
  }).join('') : '<span class="hint">Create tracks in Settings.</span>';
}
async function crmToggleTrack(trackId){
  const athlete=window._crmAthlete;
  athlete.track_ids=athlete.track_ids||[];
  const i=athlete.track_ids.indexOf(trackId);
  if(i>-1) athlete.track_ids.splice(i,1); else athlete.track_ids.push(trackId);
  crmPaintTracksEdit();
  try{ await api('/api/coach',{method:'POST',body:JSON.stringify({action:'set-tracks',athlete_id:athlete.id,track_ids:athlete.track_ids})}); }catch(e){}
}
function crmEnterEdit(){ crmMode='edit'; crmPaint(); }
function crmCancel(){ crmMode='view'; crmPaint(); }
async function crmSave(){
  const msg=document.getElementById('crmMsg');
  const athlete=window._crmAthlete;
  crmDraft.start_date=crmDateRead('crmStart');
  crmDraft.monthly_price=document.getElementById('crmPrice').value===''? null : parseFloat(document.getElementById('crmPrice').value);
  crmDraft.notes=document.getElementById('crmNotes').value;
  msg.textContent='Saving…';
  try{
    await api('/api/coach',{method:'POST',body:JSON.stringify({
      action:'crm', athlete_id:athlete.id,
      start_date:crmDraft.start_date, monthly_price:crmDraft.monthly_price,
      status:crmDraft.status, notes:crmDraft.notes
    })});
    athlete.crm = { ...athlete.crm, ...crmDraft };
    crmMode='view';
    crmPaint();
  }catch(e){ msg.textContent=e.message; }
}
