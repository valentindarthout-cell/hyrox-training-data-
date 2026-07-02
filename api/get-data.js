const { cors, userToken, sb, getUser } = require('./_supabase.js');

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  const token = userToken(req);
  if(!token) return res.status(401).json({error:'Not authenticated'});
  const user = await getUser(token);
  if(!user) return res.status(401).json({error:'Session expired'});

  const { start, end } = req.query || {};
  if(!start || !end) return res.status(400).json({error:'start and end required'});

  const sess = await sb(`/rest/v1/sessions?user_id=eq.${user.id}&session_date=gte.${start}&session_date=lte.${end}&order=session_date.asc,session_index.asc`, token, {method:'GET'});
  const phys = await sb(`/rest/v1/daily_physiology?user_id=eq.${user.id}&day=gte.${start}&day=lte.${end}&order=day.asc`, token, {method:'GET'});
  // most recent physiology on/before end date (for prefill)
  const last = await sb(`/rest/v1/daily_physiology?user_id=eq.${user.id}&day=lte.${end}&order=day.desc&limit=1`, token, {method:'GET'});

  if(!sess.ok || !phys.ok) return res.status(500).json({error:'Could not load data'});
  return res.status(200).json({
    sessions: sess.data || [],
    physiology: phys.data || [],
    lastPhysiology: (last.ok && last.data && last.data[0]) || null
  });
};
