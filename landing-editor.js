/* ================================================================
   OCTA. landing-editor.js — Public page editor (programs, testimonials, QR)
   Loads AFTER app.js and tracks-plan.js: redefines loadMyLanding() and
   publishLanding() with fuller versions (same override pattern as crm.js).
   Reuses app.js's existing lpPhotoUrl / uploadLandingPhoto() for the
   background photo — untouched, still works exactly as before.
   Also handles: ?code=&track= on the root URL -> prefills join code and
   auto-tags the athlete into that track right after they join a coach.
================================================================ */

const DIFFICULTIES=['Beginner','Intermediate','Advanced','Elite'];
const LP_THEMES=[
  {k:'light', label:'Light'},
  {k:'dark', label:'Dark'},
  {k:'stone', label:'Stone'}
];
let lpPrograms=[], lpTestimonials=[], lpTheme='light';

/* ---------------- auto-tag-on-join (safe, opportunistic, additive) ---------------- */
(function bootPendingJoin(){
  try{
    const params=new URLSearchParams(location.search);
    const code=params.get('code'), track=params.get('track');
    if(code) localStorage.setItem('octa_pending_code', code);
    if(track) localStorage.setItem('octa_pending_track', track);
  }catch(e){}
})();
async function octaApplyPendingTrack(){
  try{
    const code=localStorage.getItem('octa_pending_code');
    const input=document.getElementById('coachCode');
    if(code && input && !input.value) input.value=code;

    const trackId=localStorage.getItem('octa_pending_track');
    if(!trackId || !profile || !profile.coach_id) return;
    if((profile.track_ids||[]).includes(trackId)) { localStorage.removeItem('octa_pending_track'); return; }
    await api('/api/coach',{method:'POST',body:JSON.stringify({action:'set-tracks',
      athlete_id:profile.id, track_ids:[...(profile.track_ids||[]), trackId]})});
    profile.track_ids=[...(profile.track_ids||[]), trackId];
    localStorage.removeItem('octa_pending_track');
    localStorage.removeItem('octa_pending_code');
  }catch(e){}
}

/* ---------------- loadMyLanding / publishLanding (override) ---------------- */
async function loadMyLanding(){
  try{
    const d=await api('/api/workouts?action=my-landing');
    const L=d.landing;
    if(L){
      document.getElementById('lpSlug').value=L.slug||'';
      document.getElementById('lpHeadline').value=L.headline||'';
      document.getElementById('lpBio').value=L.bio||'';
      document.getElementById('lpIg').value=L.ig_url||'';
      lpPhotoUrl=L.photo_url||null;
      lpTheme=L.theme||'light';
      if(L.photo_url){ const p=document.getElementById('lpPhotoPreview'); p.src=L.photo_url; p.style.display='block'; }
      if(L.published) showLpUrl(L.slug);
    }
  }catch(e){}
  paintLpThemePicker();
  if(!coachTracks || !coachTracks.length) await loadTracks();
  loadLpPrograms();
  loadLpTestimonials();
}
function paintLpThemePicker(){
  const host=document.getElementById('lpThemeHost');
  if(!host) return;
  host.innerHTML=LP_THEMES.map(t=>
    `<button class="pill lp-theme-pill ${lpTheme===t.k?'active':''}" data-k="${t.k}" onclick="lpPickTheme('${t.k}')">
      <span class="lp-theme-dot ${t.k}"></span>${t.label}</button>`).join('');
}
function lpPickTheme(k){
  lpTheme=k;
  document.querySelectorAll('.lp-theme-pill').forEach(b=>b.classList.toggle('active',b.dataset.k===k));
}
async function publishLanding(){
  const msg=document.getElementById('lpMsg');
  const slug=document.getElementById('lpSlug').value.trim();
  msg.textContent='Publishing…';
  try{
    const d=await api('/api/workouts',{method:'POST',body:JSON.stringify({
      action:'publish-landing', slug,
      headline:document.getElementById('lpHeadline').value.trim(),
      bio:document.getElementById('lpBio').value.trim(),
      ig_url:document.getElementById('lpIg').value.trim(),
      photo_url:lpPhotoUrl, theme:lpTheme, published:true
    })});
    msg.textContent='Published';
    showLpUrl(d.landing.slug);
  }catch(e){ msg.textContent=e.message; }
}
function showLpUrl(slug){
  const url=location.origin+'/c/'+slug;
  document.getElementById('lpUrl').innerHTML=`Live at <a href="${url}" target="_blank">${url}</a>
    <button class="mini-btn" style="margin-left:8px" onclick="lpShowQr('${url}')">Show QR code</button>`;
}

/* ---------------- QR code ---------------- */
function lpShowQr(url){
  document.getElementById('qrModal')?.remove();
  document.body.insertAdjacentHTML('beforeend',
    `<div id="qrModal" class="strava-modal" style="display:flex">
      <div class="strava-sheet" style="text-align:center">
        <div class="strava-sheet-head">
          <div class="section-label" style="margin:0">Scan to open</div>
          <button class="mini-btn" onclick="document.getElementById('qrModal').remove()">Close</button>
        </div>
        <div id="qrCanvasHost" style="display:flex;justify-content:center;margin:16px 0"></div>
        <div class="hint" style="margin-bottom:14px">${esc(url)}</div>
        <button class="btn-slim" onclick="lpDownloadQr()">Download PNG</button>
      </div>
    </div>`);
  new QRCode(document.getElementById('qrCanvasHost'), { text:url, width:220, height:220, colorDark:'#0f0f0e', colorLight:'#ffffff' });
}
function lpDownloadQr(){
  const canvas=document.querySelector('#qrCanvasHost canvas');
  if(!canvas) return;
  const a=document.createElement('a');
  a.download='octa-qr.png';
  a.href=canvas.toDataURL('image/png');
  a.click();
}

/* ---------------- Programs ---------------- */
async function loadLpPrograms(){
  try{ const d=await api('/api/workouts?action=landing-programs'); lpPrograms=d.programs||[]; }
  catch(e){ lpPrograms=[]; }
  paintLpPrograms();
}
function paintLpPrograms(){
  const host=document.getElementById('lpProgramsHost');
  if(!host) return;
  host.innerHTML=`
    ${lpPrograms.length? lpPrograms.map(p=>`
      <div class="race-row">
        <div class="race-row-main">
          <div class="race-row-name">${esc(p.name)}${p.is_1on1?' · 1:1':''}</div>
          <div class="race-row-meta">${p.difficulty?esc(p.difficulty)+' · ':''}${p.price?esc(p.price):'No price set'}</div>
        </div>
        <button class="mini-btn" onclick="lpEditProgram('${p.id}')">Edit</button>
        <button class="mini-btn" onclick="lpDeleteProgram('${p.id}')">✕</button>
      </div>`).join('')
      : '<div class="hint">No programs published yet.</div>'}
    <div id="lpProgramForm"></div>
    <button id="lpProgramAddBtn" class="mini-btn" style="margin-top:10px" onclick="lpNewProgram()" ${lpPrograms.length>=5?'disabled':''}>
      ${lpPrograms.length>=5?'Maximum 5 programs':'+ Add program'}</button>`;
}
let lpProgramDraft=null;
function lpNewProgram(){
  lpProgramDraft={ id:null, track_id:null, name:'', description:'', difficulty:null,
    sessions_per_week:'', hours_per_week:'', running_km_per_week:'', price:'', is_1on1:false, cta_type:'code' };
  lpOpenProgramForm();
}
function lpEditProgram(id){
  const p=lpPrograms.find(x=>x.id===id); if(!p) return;
  lpProgramDraft=JSON.parse(JSON.stringify(p));
  lpOpenProgramForm();
}
function lpOpenProgramForm(){
  document.getElementById('lpProgramAddBtn').style.display='none';
  const d=lpProgramDraft;
  document.getElementById('lpProgramForm').innerHTML=`
    <div class="race-form">
      <input id="lppName" class="text-input" type="text" placeholder="Program name (e.g. Elite Performance)" value="${esc(d.name)}">
      <div class="section-sublabel">Linked track (optional)</div>
      <select id="lppTrack" class="text-input">
        <option value="">No linked track</option>
        ${coachTracks.map(t=>`<option value="${t.id}" ${d.track_id===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}
      </select>
      <textarea id="lppDesc" class="text-input" placeholder="What athletes get in this program" style="margin-top:10px">${esc(d.description||'')}</textarea>
      <div class="section-sublabel">Difficulty</div>
      <div class="pill-row" id="lppDiffPills">
        ${DIFFICULTIES.map(x=>`<button class="pill ${d.difficulty===x?'active':''}" data-v="${x}" onclick="lppPickDiff('${x}')">${x}</button>`).join('')}
      </div>
      <div class="settings-grid">
        <div class="macro-field"><label>Sessions / week</label><input id="lppSessions" type="text" placeholder="e.g. 4-5" value="${esc(d.sessions_per_week||'')}"></div>
        <div class="macro-field"><label>Hours / week</label><input id="lppHours" type="text" placeholder="e.g. 6-8" value="${esc(d.hours_per_week||'')}"></div>
        <div class="macro-field"><label>Running km / week</label><input id="lppRunning" type="text" placeholder="e.g. 20-30" value="${esc(d.running_km_per_week||'')}"></div>
      </div>
      <div class="section-sublabel">Price</div>
      <input id="lppPrice" class="text-input" type="text" placeholder="e.g. €150/month, or Contact for pricing" value="${esc(d.price||'')}">
      <div class="pill-row" style="margin-top:10px">
        <button class="pill ${d.is_1on1?'active':''}" id="lppOneOnOne" onclick="lppToggle1on1()">1:1 coaching</button>
      </div>
      <div class="section-sublabel">Call to action</div>
      <div class="pill-row" id="lppCtaPills">
        ${[['code','Join with code'],['instagram','Message on Instagram'],['both','Both']].map(([k,label])=>
          `<button class="pill ${d.cta_type===k?'active':''}" data-v="${k}" onclick="lppPickCta('${k}')">${label}</button>`).join('')}
      </div>
      <div class="sp-actions">
        <button class="btn-slim" onclick="lpSaveProgram()">Save program</button>
        <button class="btn-slim secondary" onclick="lpCancelProgram()">Cancel</button>
        <div id="lppMsg" class="save-msg" style="margin:0;text-align:left"></div>
      </div>
    </div>`;
}
function lppPickDiff(v){
  lpProgramDraft.difficulty = lpProgramDraft.difficulty===v? null : v;
  document.querySelectorAll('#lppDiffPills .pill').forEach(b=>b.classList.toggle('active',b.dataset.v===lpProgramDraft.difficulty));
}
function lppToggle1on1(){
  lpProgramDraft.is_1on1=!lpProgramDraft.is_1on1;
  document.getElementById('lppOneOnOne').classList.toggle('active',lpProgramDraft.is_1on1);
}
function lppPickCta(v){
  lpProgramDraft.cta_type=v;
  document.querySelectorAll('#lppCtaPills .pill').forEach(b=>b.classList.toggle('active',b.dataset.v===v));
}
function lpCancelProgram(){
  lpProgramDraft=null;
  document.getElementById('lpProgramForm').innerHTML='';
  document.getElementById('lpProgramAddBtn').style.display='inline-block';
}
async function lpSaveProgram(){
  const msg=document.getElementById('lppMsg');
  const d=lpProgramDraft;
  d.name=document.getElementById('lppName').value.trim();
  d.track_id=document.getElementById('lppTrack').value||null;
  d.description=document.getElementById('lppDesc').value.trim();
  d.sessions_per_week=document.getElementById('lppSessions').value.trim();
  d.hours_per_week=document.getElementById('lppHours').value.trim();
  d.running_km_per_week=document.getElementById('lppRunning').value.trim();
  d.price=document.getElementById('lppPrice').value.trim();
  if(!d.name){ msg.textContent='Give the program a name.'; return; }
  msg.textContent='Saving…';
  try{
    const res=await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'save-landing-program',...d})});
    if(d.id){ const i=lpPrograms.findIndex(p=>p.id===d.id); if(i>-1) lpPrograms[i]=res.program||d; }
    else if(res.program) lpPrograms.push(res.program);
    lpProgramDraft=null;
    paintLpPrograms();
  }catch(e){ msg.textContent=e.message; }
}
async function lpDeleteProgram(id){
  try{
    await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'delete-landing-program',id})});
    lpPrograms=lpPrograms.filter(p=>p.id!==id);
    paintLpPrograms();
  }catch(e){}
}

/* ---------------- Testimonials ---------------- */
async function loadLpTestimonials(){
  try{ const d=await api('/api/workouts?action=landing-testimonials'); lpTestimonials=d.testimonials||[]; }
  catch(e){ lpTestimonials=[]; }
  paintLpTestimonials();
}
function paintLpTestimonials(){
  const host=document.getElementById('lpTestimonialsHost');
  if(!host) return;
  host.innerHTML=`
    ${lpTestimonials.length? lpTestimonials.map(t=>`
      <div class="race-row">
        ${t.photo_url?`<img src="${t.photo_url}" style="width:32px;height:32px;border-radius:999px;object-fit:cover;flex-shrink:0">`:'<span style="width:32px"></span>'}
        <div class="race-row-main">
          <div class="race-row-name">${esc(t.name)}</div>
          <div class="race-row-meta">${t.quote?esc(t.quote.slice(0,60))+(t.quote.length>60?'…':''):'No quote'}</div>
        </div>
        <button class="mini-btn" onclick="lpEditTestimonial('${t.id}')">Edit</button>
        <button class="mini-btn" onclick="lpDeleteTestimonial('${t.id}')">✕</button>
      </div>`).join('')
      : '<div class="hint">No testimonials yet.</div>'}
    <div id="lpTestimonialForm"></div>
    <button id="lpTestimonialAddBtn" class="mini-btn" style="margin-top:10px" onclick="lpNewTestimonial()" ${lpTestimonials.length>=5?'disabled':''}>
      ${lpTestimonials.length>=5?'Maximum 5 testimonials':'+ Add testimonial'}</button>`;
}
let lpTestimonialDraft=null;
function lpNewTestimonial(){
  lpTestimonialDraft={ id:null, name:'', quote:'', ig_handle:'' };
  lpOpenTestimonialForm();
}
function lpEditTestimonial(id){
  const t=lpTestimonials.find(x=>x.id===id); if(!t) return;
  lpTestimonialDraft=JSON.parse(JSON.stringify(t));
  lpOpenTestimonialForm();
}
function lpOpenTestimonialForm(){
  document.getElementById('lpTestimonialAddBtn').style.display='none';
  const d=lpTestimonialDraft;
  document.getElementById('lpTestimonialForm').innerHTML=`
    <div class="race-form">
      <input id="lptName" class="text-input" type="text" placeholder="Athlete name" value="${esc(d.name)}">
      <textarea id="lptQuote" class="text-input" placeholder="What they said" style="margin-top:10px">${esc(d.quote||'')}</textarea>
      <input id="lptIg" class="text-input" type="text" placeholder="@instagram_handle (optional)" value="${esc(d.ig_handle||'')}" style="margin-top:10px">
      <div class="section-sublabel">Photo (optional)</div>
      <div class="logo-row">
        <img id="lptPhotoPreview" class="logo-preview" style="${d.photo_url?'':'display:none'}" src="${d.photo_url||''}">
        <label class="ghost-btn file-btn">Upload photo<input type="file" accept="image/*" onchange="lptUploadPhoto(event)" hidden></label>
      </div>
      <div class="sp-actions">
        <button class="btn-slim" onclick="lpSaveTestimonial()">Save</button>
        <button class="btn-slim secondary" onclick="lpCancelTestimonial()">Cancel</button>
        <div id="lptMsg" class="save-msg" style="margin:0;text-align:left"></div>
      </div>
    </div>`;
}
function compressImageToBase64(file, maxDim, quality){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        let w=img.width, h=img.height;
        if(w>h){ if(w>maxDim){ h=Math.round(h*maxDim/w); w=maxDim; } }
        else { if(h>maxDim){ w=Math.round(w*maxDim/h); h=maxDim; } }
        const canvas=document.createElement('canvas');
        canvas.width=w; canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        const dataUrl=canvas.toDataURL('image/jpeg', quality);
        resolve({ base64: dataUrl.split(',')[1], content_type:'image/jpeg' });
      };
      img.onerror=reject;
      img.src=reader.result;
    };
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}
async function lptUploadPhoto(e){
  const file=e.target.files[0]; if(!file) return;
  const msg=document.getElementById('lptMsg');
  msg.textContent='Uploading photo…';
  try{
    const tid = lpTestimonialDraft.id || (lpTestimonialDraft._tempId ||= 'new-'+Date.now()+'-'+Math.random().toString(36).slice(2,8));
    const {base64, content_type} = await compressImageToBase64(file, 300, 0.82);
    const d = await api('/api/upload-logo',{method:'POST',body:JSON.stringify({image:base64, content_type, kind:'testimonial', testimonial_id:tid})});
    lpTestimonialDraft.photo_url = d.url || d.logo_url;
    const prev=document.getElementById('lptPhotoPreview');
    prev.src=lpTestimonialDraft.photo_url; prev.style.display='block';
    msg.textContent='';
  }catch(err){ msg.textContent=err.message; }
}
function lpCancelTestimonial(){
  lpTestimonialDraft=null;
  document.getElementById('lpTestimonialForm').innerHTML='';
  document.getElementById('lpTestimonialAddBtn').style.display='inline-block';
}
async function lpSaveTestimonial(){
  const msg=document.getElementById('lptMsg');
  const d=lpTestimonialDraft;
  d.name=document.getElementById('lptName').value.trim();
  d.quote=document.getElementById('lptQuote').value.trim();
  d.ig_handle=document.getElementById('lptIg').value.trim();
  if(!d.name){ msg.textContent='Give a name.'; return; }
  msg.textContent='Saving…';
  try{
    const res=await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'save-landing-testimonial',...d})});
    if(d.id){ const i=lpTestimonials.findIndex(t=>t.id===d.id); if(i>-1) lpTestimonials[i]=res.testimonial||d; }
    else if(res.testimonial) lpTestimonials.push(res.testimonial);
    lpTestimonialDraft=null;
    paintLpTestimonials();
  }catch(e){ msg.textContent=e.message; }
}
async function lpDeleteTestimonial(id){
  try{
    await api('/api/workouts',{method:'POST',body:JSON.stringify({action:'delete-landing-testimonial',id})});
    lpTestimonials=lpTestimonials.filter(t=>t.id!==id);
    paintLpTestimonials();
  }catch(e){}
}
