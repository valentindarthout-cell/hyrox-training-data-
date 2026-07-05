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

  if(action === 'bulk'){
    const days = Math.min(parseInt(req.query.days) || 7, 30);
    const before = Math.floor(Date.now()/1000);
    const after = before - days*86400;

    // 1. list activities in range
    const listRes = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&before=${before}&per_page=60`, {
      headers:{ 'Authorization':'Bearer '+accessToken }
    });
    const acts = await listRes.json();
    if(!listRes.ok) return res.status(500).json({error:'Could not reach Strava'});
    const capped = (acts||[]).slice(0, 40);   // stay within serverless time limits
    if(!capped.length) return res.status(200).json({imported:0, skipped:0, message:'No Strava activities found in that period'});

    // 2. existing sessions in range (dedupe + per-day count)
    const startDate = new Date(after*1000).toISOString().slice(0,10);
    const endDate = new Date(before*1000).toISOString().slice(0,10);
    const existing = await sb(`/rest/v1/sessions?user_id=eq.${user.id}&session_date=gte.${startDate}&session_date=lte.${endDate}&select=session_date,session_index,strava_id`, token, {method:'GET'});
    const existingRows = (existing.ok && existing.data) || [];
    const knownStravaIds = new Set(existingRows.filter(r=>r.strava_id).map(r=>String(r.strava_id)));
    const perDayCount = {};
    existingRows.forEach(r=>{ perDayCount[r.session_date]=(perDayCount[r.session_date]||0)+1; });

    // 3. fetch details + zones in parallel, map to session rows
    const results = await Promise.all(capped.map(async a => {
      if(knownStravaIds.has(String(a.id))) return {skip:'duplicate'};
      try{
        const [dRes, zones] = await Promise.all([
          fetch(`https://www.strava.com/api/v3/activities/${a.id}`, {headers:{'Authorization':'Bearer '+accessToken}}).then(r=>r.ok?r.json():null),
          fetchZones(a.id, accessToken)
        ]);
        const act = dRes || a;
        const dateStr = (act.start_date_local||'').slice(0,10);
        if(!dateStr) return {skip:'no date'};

        const subtype = TYPE_MAP[act.type];
        const isStrength = ['WeightTraining','Crossfit','Workout'].includes(act.type);
        const durMin = act.moving_time ? Math.round(act.moving_time/60) : null;
        const distKm = act.distance ? +(act.distance/1000).toFixed(2) : null;

        let pace=null, pace_unit=null;
        if(subtype && durMin>0 && distKm>0){
          if(['Run','Treadmill'].includes(subtype)){ pace=mmss(durMin/distKm*60); pace_unit='min/km'; }
          else if(['Bike outdoor','Bike indoor'].includes(subtype)){ pace=mmss(durMin/distKm*60); pace_unit='/km'; }
        }
        let rpe=null;
        if(zones){
          rpe=Math.round((zones[0]*2+zones[1]*4+zones[2]*6+zones[3]*8+zones[4]*10)/100);
          if(zones[4]>=10) rpe=Math.max(rpe,9);
          else if(zones[3]+zones[4]>=40) rpe=Math.max(rpe,7);
          rpe=Math.min(Math.max(rpe,3),10);
        }
        return { row:{
          user_id: user.id,
          session_date: dateStr,
          strava_id: act.id,
          name: act.name || null,
          workout_type: isStrength ? 'strength' : 'endurance',
          subtypes: subtype ? [subtype] : [],
          duration_min: durMin,
          volume: isStrength ? null : distKm,
          volume_unit: 'km',
          pace, pace_unit,
          avg_hr: act.average_heartrate ? Math.round(act.average_heartrate) : null,
          kcal: act.calories ? Math.round(act.calories) : null,
          rpe,
          workout_desc: act.description || null,
          zone1: zones?zones[0]:null, zone2: zones?zones[1]:null, zone3: zones?zones[2]:null,
          zone4: zones?zones[3]:null, zone5: zones?zones[4]:null
        }};
      }catch(e){ return {skip:'fetch failed'}; }
    }));

    // 4. assign session_index respecting the 3/day cap, insert
    const toInsert=[];
    let skipped=0;
    results.forEach(r=>{
      if(!r.row){ skipped++; return; }
      const d=r.row.session_date;
      const count=perDayCount[d]||0;
      if(count>=3){ skipped++; return; }
      r.row.session_index=count+1;
      perDayCount[d]=count+1;
      toInsert.push(r.row);
    });

    if(toInsert.length){
      const ins = await sb('/rest/v1/sessions', token, { method:'POST', body: JSON.stringify(toInsert) });
      if(!ins.ok) return res.status(500).json({error:'Could not save imported sessions'});
    }
    return res.status(200).json({
      imported: toInsert.length, skipped,
      items: toInsert.map(r=>({name:r.name, date:r.session_date, type:r.workout_type}))
    });
  }

  return res.status(400).json({error:'Unknown action'});
};

function mmss(totalSec){
  const m=Math.floor(totalSec/60), s=Math.round(totalSec%60);
  return m+':'+String(s===60?0:s).padStart(2,'0');
}
