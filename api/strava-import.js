// action=list -> recent activities (id, name, date, type, distance, duration)
// action=detail&id=... -> full mapped session fields for one activity
const { cors, userToken, sb, getUser, SUPABASE_URL, ANON } = require('./_supabase.js');

async function getValidAccessToken(user, token){
  const r = await sb(`/rest/v1/strava_tokens?user_id=eq.${user.id}`, token, {method:'GET'});
  if(!r.ok || !r.data || !r.data.length) return null;
  const row = r.data[0];
  const now = Math.floor(Date.now()/1000);
  if(row.expires_at && row.expires_at > now + 60) return row.access_token;

  // refresh
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

// map Strava activity type -> our modality subtype
const TYPE_MAP = {
  Run:'Run', TrailRun:'Run', VirtualRun:'Treadmill',
  Ride:'Bike outdoor', VirtualRide:'Bike indoor', GravelRide:'Bike outdoor',
  Rowing:'Row erg', Elliptical:'Elliptical', StairStepper:'Stair Stepper',
  WeightTraining:null, Workout:null, Crossfit:null
};

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(200).end();
  const token = userToken(req);
  if(!token) return res.status(401).json({error:'Not authenticated'});
  const user = await getUser(token);
  if(!user) return res.status(401).json({error:'Session expired'});

  const accessToken = await getValidAccessToken(user, token);
  if(!accessToken) return res.status(400).json({error:'Strava not connected'});

  const { action, id } = req.query || {};

  if(action === 'list'){
    const r = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=15', {
      headers:{ 'Authorization':'Bearer '+accessToken }
    });
    const acts = await r.json();
    if(!r.ok) return res.status(500).json({error:'Could not reach Strava'});
    return res.status(200).json({ activities: (acts||[]).map(a=>({
      id:a.id, name:a.name, type:a.type, date:a.start_date_local,
      distance_km: a.distance ? +(a.distance/1000).toFixed(2) : null,
      duration_min: a.moving_time ? Math.round(a.moving_time/60) : null
    })) });
  }

  if(action === 'detail' && id){
    const r = await fetch(`https://www.strava.com/api/v3/activities/${id}`, {
      headers:{ 'Authorization':'Bearer '+accessToken }
    });
    const a = await r.json();
    if(!r.ok) return res.status(500).json({error:'Could not reach Strava'});

    const subtype = TYPE_MAP[a.type] || null;
    const zones = {};
    // Strava doesn't reliably expose HR zone distribution via this endpoint; left null, user can fill.
    return res.status(200).json({ session:{
      name: a.name || null,
      workout_type: 'endurance',
      subtypes: subtype ? [subtype] : [],
      duration_min: a.moving_time ? Math.round(a.moving_time/60) : null,
      distance_km: a.distance ? +(a.distance/1000).toFixed(2) : null,
      avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
      calories: a.calories ? Math.round(a.calories) : null,
      workout_description: a.description || null,
      session_date: (a.start_date_local||'').slice(0,10)
    }});
  }

  return res.status(400).json({error:'Unknown action'});
};
