const { cors, userToken, sb, getUser } = require('./_supabase.js');

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  const token = userToken(req);
  if(!token) return res.status(401).json({error:'Not authenticated'});
  const user = await getUser(token);
  if(!user) return res.status(401).json({error:'Session expired'});

  const { date, sessions, physiology } = req.body || {};
  if(!date) return res.status(400).json({error:'date required'});

  // validate zones server-side too
  for(const s of (sessions || [])){
    const tot = (s.zone1||0)+(s.zone2||0)+(s.zone3||0)+(s.zone4||0)+(s.zone5||0);
    if(tot !== 0 && tot !== 100) return res.status(400).json({error:'HR zones must total 100%'});
  }

  // replace sessions for this date
  const del = await sb(`/rest/v1/sessions?user_id=eq.${user.id}&session_date=eq.${date}`, token, {method:'DELETE'});
  if(!del.ok) return res.status(500).json({error:'Could not update sessions'});

  if(sessions && sessions.length){
    const rows = sessions.map(s => Object.assign({}, s, { user_id: user.id, session_date: date }));
    const ins = await sb('/rest/v1/sessions', token, { method:'POST', body: JSON.stringify(rows) });
    if(!ins.ok) return res.status(500).json({error:'Could not save sessions'});
  }

  if(physiology && Object.values(physiology).some(v => v !== null && v !== undefined)){
    const row = Object.assign({}, physiology, { user_id: user.id, day: date });
    const up = await sb('/rest/v1/daily_physiology?on_conflict=user_id,day', token, {
      method:'POST',
      headers:{ 'Prefer':'resolution=merge-duplicates' },
      body: JSON.stringify([row])
    });
    if(!up.ok) return res.status(500).json({error:'Could not save physiology'});
  }

  return res.status(200).json({ ok:true });
};
