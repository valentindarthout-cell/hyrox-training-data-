// OCTA. coach endpoint — consolidated actions to respect Vercel's function limit
// GET  ?action=athletes                          -> linked athletes + CRM + last activity
// GET  ?action=athlete-data&id=&start=&end=      -> one athlete's sessions + physiology (coach only)
// POST {action:'crm', athlete_id, ...fields}     -> upsert CRM row
// POST {action:'code'}                           -> generate/regenerate invite code
// POST {action:'join', code}                     -> athlete joins a coach by code
// POST {action:'leave'}                          -> athlete leaves their coach
const { cors, userToken, sb, getUser } = require('./_supabase.js');

function genCode(){
  const chars='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I/L
  let c=''; for(let i=0;i<6;i++) c+=chars[Math.floor(Math.random()*chars.length)];
  return c;
}

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(200).end();
  const token = userToken(req);
  if(!token) return res.status(401).json({error:'Not authenticated'});
  const user = await getUser(token);
  if(!user) return res.status(401).json({error:'Session expired'});

  const action = (req.method === 'GET' ? req.query.action : (req.body||{}).action) || '';

  /* ---------- athlete-side actions ---------- */
  if(action === 'join'){
    const { code } = req.body || {};
    if(!code || code.trim().length < 4) return res.status(400).json({error:'Enter the code your coach gave you'});
    const r = await sb('/rest/v1/rpc/join_coach', token, {
      method:'POST', body: JSON.stringify({ code: code.trim() })
    });
    if(!r.ok) return res.status(500).json({error:'Could not join'});
    if(r.data && r.data.error) return res.status(400).json({error:r.data.error});
    return res.status(200).json({ coach: r.data });
  }

  if(action === 'leave'){
    const r = await sb('/rest/v1/rpc/leave_coach', token, { method:'POST', body:'{}' });
    if(!r.ok) return res.status(500).json({error:'Could not leave'});
    return res.status(200).json({ ok:true });
  }

  /* ---------- coach-side actions ---------- */
  if(action === 'code'){
    // generate a unique invite code, retry on collision
    for(let attempt=0; attempt<5; attempt++){
      const code = genCode();
      const r = await sb(`/rest/v1/profiles?id=eq.${user.id}`, token, {
        method:'PATCH',
        headers:{ 'Prefer':'return=representation' },
        body: JSON.stringify({ invite_code: code, role:'coach' })
      });
      if(r.ok) return res.status(200).json({ code });
      if(r.status !== 409) return res.status(500).json({error:'Could not generate code'});
    }
    return res.status(500).json({error:'Could not generate a unique code, try again'});
  }

  if(action === 'athletes'){
    const ath = await sb(`/rest/v1/profiles?coach_id=eq.${user.id}&select=id,email,first_name,last_name,race_name,race_date,race_divisions,training_phase`, token, {method:'GET'});
    if(!ath.ok) return res.status(500).json({error:'Could not load athletes'});
    const crm = await sb(`/rest/v1/coach_crm?coach_id=eq.${user.id}`, token, {method:'GET'});
    const crmByAthlete = {};
    ((crm.ok && crm.data) || []).forEach(r=>{ crmByAthlete[r.athlete_id]=r; });

    // last activity per athlete (one query, order desc, dedupe client-side)
    const ids = (ath.data||[]).map(a=>a.id);
    let lastByAthlete = {};
    if(ids.length){
      const sess = await sb(`/rest/v1/sessions?user_id=in.(${ids.join(',')})&select=user_id,session_date&order=session_date.desc&limit=200`, token, {method:'GET'});
      ((sess.ok && sess.data) || []).forEach(s=>{
        if(!lastByAthlete[s.user_id]) lastByAthlete[s.user_id]=s.session_date;
      });
    }
    return res.status(200).json({ athletes: (ath.data||[]).map(a=>({
      ...a, crm: crmByAthlete[a.id]||null, last_session: lastByAthlete[a.id]||null
    })) });
  }

  if(action === 'athlete-data'){
    const { id, start, end } = req.query || {};
    if(!id || !start || !end) return res.status(400).json({error:'id, start, end required'});
    // RLS enforces the coach link; verify anyway for a clean error
    const link = await sb(`/rest/v1/profiles?id=eq.${athlete_id}&coach_id=eq.${user.id}&select=prs,maxes,gender,category,race_targets`, token, {method:'GET'});
    if(!link.ok || !link.data || !link.data.length) return res.status(403).json({error:'Not your athlete'});
    const sess = await sb(`/rest/v1/sessions?user_id=eq.${id}&session_date=gte.${start}&session_date=lte.${end}&order=session_date.asc,session_index.asc`, token, {method:'GET'});
    const phys = await sb(`/rest/v1/daily_physiology?user_id=eq.${id}&day=gte.${start}&day=lte.${end}&order=day.asc`, token, {method:'GET'});
    if(!sess.ok || !phys.ok) return res.status(500).json({error:'Could not load data'});
    return res.status(200).json({ sessions: sess.data||[], physiology: phys.data||[] });
  }

  if(action === 'performance'){
    const { athlete_id } = req.query||{};
    const link = await sb(`/rest/v1/profiles?id=eq.${athlete_id}&coach_id=eq.${user.id}&select=prs,maxes,gender,category`, token, {method:'GET'});
    if(!link.ok || !link.data || !link.data.length) return res.status(403).json({error:'Not your athlete'});
    return res.status(200).json({ performance: link.data[0] });
  }

  if(action === 'save-performance'){
    const b = req.body||{};
    if(!b.athlete_id) return res.status(400).json({error:'athlete_id required'});
    const link = await sb(`/rest/v1/profiles?id=eq.${b.athlete_id}&coach_id=eq.${user.id}&select=id`, token, {method:'GET'});
    if(!link.ok || !link.data || !link.data.length) return res.status(403).json({error:'Not your athlete'});
    const patch = {};
    ['prs','maxes','gender','category'].forEach(k=>{ if(b[k]!==undefined) patch[k]=b[k]; });
    const r = await sb(`/rest/v1/profiles?id=eq.${b.athlete_id}`, token, {method:'PATCH', body: JSON.stringify(patch)});
    if(!r.ok) return res.status(500).json({error:'Could not save'});
    return res.status(200).json({ ok:true });
  }
  if(action === 'crm'){
    const b = req.body || {};
    if(!b.athlete_id) return res.status(400).json({error:'athlete_id required'});
    const row = {
      coach_id: user.id, athlete_id: b.athlete_id,
      start_date: b.start_date ?? null,
      monthly_price: b.monthly_price ?? null,
      status: b.status || 'active',
      notes: b.notes ?? null
    };
    const r = await sb('/rest/v1/coach_crm?on_conflict=coach_id,athlete_id', token, {
      method:'POST',
      headers:{ 'Prefer':'resolution=merge-duplicates' },
      body: JSON.stringify([row])
    });
    if(!r.ok) return res.status(500).json({error:'Could not save'});
    return res.status(200).json({ ok:true });
  }

  return res.status(400).json({error:'Unknown action'});
};
