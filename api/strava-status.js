const { cors, userToken, sb, getUser } = require('./_supabase.js');

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(200).end();
  const token = userToken(req);
  if(!token) return res.status(401).json({error:'Not authenticated'});
  const user = await getUser(token);
  if(!user) return res.status(401).json({error:'Session expired'});

  const r = await sb(`/rest/v1/strava_tokens?user_id=eq.${user.id}&select=strava_athlete_id`, token, {method:'GET'});
  const connected = r.ok && r.data && r.data.length > 0;
  return res.status(200).json({ connected });
};
