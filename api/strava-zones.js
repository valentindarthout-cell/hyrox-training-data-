// Fetches the athlete's own configured heart-rate zone boundaries from Strava.
// Requires the athlete to have HR zones set up in their Strava account.
const { cors, userToken, sb, getUser } = require('./_supabase.js');

async function getValidAccessToken(user, token){
  const r = await sb(`/rest/v1/strava_tokens?user_id=eq.${user.id}`, token, {method:'GET'});
  if(!r.ok || !r.data || !r.data.length) return null;
  const row = r.data[0];
  const now = Math.floor(Date.now()/1000);
  if(row.expires_at && row.expires_at > now + 60) return row.access_token;

  const rr = await fetch('https://www.strava.com/oauth/token', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type:'refresh_token',
      refresh_token: row.refresh_token
    })
  });
  const tok = await rr.json();
  if(!rr.ok || !tok.access_token) return null;
  await sb(`/rest/v1/strava_tokens?user_id=eq.${user.id}`, token, {
    method:'PATCH',
    body: JSON.stringify({ access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: tok.expires_at })
  });
  return tok.access_token;
}

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(200).end();
  const token = userToken(req);
  if(!token) return res.status(401).json({error:'Not authenticated'});
  const user = await getUser(token);
  if(!user) return res.status(401).json({error:'Session expired'});

  const accessToken = await getValidAccessToken(user, token);
  if(!accessToken) return res.status(400).json({error:'Strava not connected'});

  try{
    const r = await fetch('https://www.strava.com/api/v3/athlete/zones', {
      headers:{ 'Authorization':'Bearer '+accessToken }
    });
    const data = await r.json();
    if(!r.ok) return res.status(500).json({error:'Could not reach Strava'});

    const hr = data && data.heart_rate;
    if(!hr || !hr.zones || !hr.zones.length){
      return res.status(404).json({error:'No heart rate zones configured on Strava'});
    }
    // Strava zones: array of {min, max}. Last zone's max is often -1 (open-ended).
    const z = hr.zones;
    const boundaries = {
      hr_z1_max: z[0] ? z[0].max : null,
      hr_z2_max: z[1] ? z[1].max : null,
      hr_z3_max: z[2] ? z[2].max : null,
      hr_z4_max: z[3] ? z[3].max : null,
    };
    return res.status(200).json({ boundaries });
  }catch(e){
    return res.status(500).json({error:'Could not reach Strava'});
  }
};
