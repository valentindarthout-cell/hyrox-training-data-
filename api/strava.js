// Consolidated Strava data endpoint: GET ?action=status|list|detail|zones
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

const TYPE_MAP = {
  Run:'Run', TrailRun:'Run', VirtualRun:'Treadmill',
  Ride:'Bike outdoor', VirtualRide:'Bike indoor', GravelRide:'Bike outdoor',
  Rowing:'Row erg', Elliptical:'Elliptical', StairStepper:'Stair Stepper',
  WeightTraining:null, Workout:null, Crossfit:null
};

async function fetchZones(activityId, accessToken){
  try{
    const r = await fetch(`https://www.strava.com/api/v3/activities/${activityId}/zones`, {
      headers:{ 'Authorization':'Bearer '+accessToken }
    });
    if(!r.ok) return null;
    const data = await r.json();
    const hr = (data || []).find(z => z.type === 'heartrate');
    if(!hr || !hr.distribution_buckets || !hr.distribution_buckets.length) return null;

    const buckets = hr.distribution_buckets;
    const totalTime = buckets.reduce((sum,b)=>sum+b.time,0);
    if(totalTime <= 0) return null;

    const n = buckets.length;
    const zonePct = [0,0,0,0,0];
    buckets.forEach((b,i)=>{
      const targetZone = Math.min(4, Math.floor(i * 5 / n));
      zonePct[targetZone] += b.time;
    });
    let pct5 = zonePct.map(t => Math.round((t/totalTime*100)/5)*5);
    let diff = 100 - pct5.reduce((a,b)=>a+b,0);
    if(diff !== 0){
      const maxIdx = pct5.indexOf(Math.max(...pct5));
      pct5[maxIdx] = Math.max(0, pct5[maxIdx] + diff);
    }
    return pct5.reduce((a,b)=>a+b,0) === 100 ? pct5 : null;
  }catch(e){ return null; }
}

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(200).end();
  const token = userToken(req);
  if(!token) return res.status(401).json({error:'Not authenticated'});
  const user = await getUser(token);
  if(!user) return res.status(401).json({error:'Session expired'});

  const { action, id } = req.query || {};

  if(action === 'status'){
    const r = await sb(`/rest/v1/strava_tokens?user_id=eq.${user.id}&select=strava_athlete_id`, token, {method:'GET'});
    return res.status(200).json({ connected: r.ok && r.data && r.data.length > 0 });
  }

  const accessToken = await getValidAccessToken(user, token);
  if(!accessToken) return res.status(400).json({error:'Strava not connected'});

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
    const zones = await fetchZones(id, accessToken);
    return res.status(200).json({ session:{
      name: a.name || null,
      workout_type: 'endurance',
      subtypes: subtype ? [subtype] : [],
      duration_min: a.moving_time ? Math.round(a.moving_time/60) : null,
      distance_km: a.distance ? +(a.distance/1000).toFixed(2) : null,
      avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
      calories: a.calories ? Math.round(a.calories) : null,
      workout_description: a.description || null,
      session_date: (a.start_date_local||'').slice(0,10),
      zones: zones
    }});
  }

  if(action === 'zones'){
    const r = await fetch('https://www.strava.com/api/v3/athlete/zones', {
      headers:{ 'Authorization':'Bearer '+accessToken }
    });
    const data = await r.json();
    if(!r.ok) return res.status(500).json({error:'Could not reach Strava'});
    const hr = data && data.heart_rate;
    if(!hr || !hr.zones || !hr.zones.length) return res.status(404).json({error:'No heart rate zones configured on Strava'});
    const z = hr.zones;
    return res.status(200).json({ boundaries:{
      hr_z1_max: z[0] ? z[0].max : null,
      hr_z2_max: z[1] ? z[1].max : null,
      hr_z3_max: z[2] ? z[2].max : null,
      hr_z4_max: z[3] ? z[3].max : null,
    }});
  }

  return res.status(400).json({error:'Unknown action'});
};
