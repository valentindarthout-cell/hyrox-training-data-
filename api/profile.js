const { cors, userToken, sb, getUser } = require('./_supabase.js');

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(200).end();
  const token = userToken(req);
  if(!token) return res.status(401).json({error:'Not authenticated'});
  const user = await getUser(token);
  if(!user) return res.status(401).json({error:'Session expired'});

  if(req.method === 'GET'){
    const p = await sb(`/rest/v1/profiles?id=eq.${user.id}`, token, {method:'GET'});
    const b = await sb(`/rest/v1/body_metrics?user_id=eq.${user.id}&order=recorded_at.desc&limit=1`, token, {method:'GET'});
    return res.status(200).json({
      profile: (p.ok && p.data && p.data[0]) || {},
      body: (b.ok && b.data && b.data[0]) || null
    });
  }

  if(req.method === 'PUT'){
    const body = req.body || {};
    const { weight_kg, height_cm } = body;
    const profileFields = {
      age: body.age, hrv_low: body.hrv_low, hrv_high: body.hrv_high,
      training_phase: body.training_phase, race_name: body.race_name,
      race_date: body.race_date, race_divisions: body.race_divisions,
      hr_z1_max: body.hr_z1_max, hr_z2_max: body.hr_z2_max,
      hr_z3_max: body.hr_z3_max, hr_z4_max: body.hr_z4_max
    };
    const up = await sb(`/rest/v1/profiles?id=eq.${user.id}`, token, {
      method:'PATCH',
      headers:{ 'Prefer':'return=representation' },
      body: JSON.stringify(profileFields)
    });
    if(!up.ok) return res.status(500).json({error:'Could not save profile'});

    // record body metrics only if changed vs latest entry
    if(weight_kg != null || height_cm != null){
      const latest = await sb(`/rest/v1/body_metrics?user_id=eq.${user.id}&order=recorded_at.desc&limit=1`, token, {method:'GET'});
      const prev = (latest.ok && latest.data && latest.data[0]) || {};
      const changed = Number(prev.weight_kg) !== Number(weight_kg) || Number(prev.height_cm) !== Number(height_cm);
      if(changed){
        await sb('/rest/v1/body_metrics', token, {
          method:'POST',
          body: JSON.stringify([{ user_id: user.id, weight_kg, height_cm }])
        });
      }
    }
    return res.status(200).json({ profile: (up.data && up.data[0]) || profileFields });
  }

  return res.status(405).json({error:'Method not allowed'});
};
