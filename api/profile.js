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
    const prof = (p.ok && p.data && p.data[0]) || {};
    let coach = null;
    if(prof.coach_id){
      const c = await sb(`/rest/v1/profiles?id=eq.${prof.coach_id}&select=program_name,program_desc,program_url,logo_url`, token, {method:'GET'});
      coach = (c.ok && c.data && c.data[0]) || null;
    }
    return res.status(200).json({
      profile: prof,
      body: (b.ok && b.data && b.data[0]) || null,
      coach
    });
  }

  if(req.method === 'PUT'){
    const body = req.body || {};
    const { weight_kg, height_cm } = body;
    const profileFields = {
      hrv_low: body.hrv_low, hrv_high: body.hrv_high,
      training_phase: body.training_phase, race_name: body.race_name,
      race_date: body.race_date, race_divisions: body.race_divisions,
      hr_z1_max: body.hr_z1_max, hr_z2_max: body.hr_z2_max,
      hr_z3_max: body.hr_z3_max, hr_z4_max: body.hr_z4_max,
      first_name: body.first_name, last_name: body.last_name,
      dob: body.dob, city: body.city, country: body.country
    };
    if(body.onboarded !== undefined) profileFields.onboarded = body.onboarded;
    if(body.streak_target !== undefined) profileFields.streak_target = body.streak_target;
    if(body.role !== undefined) profileFields.role = body.role;
    if(body.program_name !== undefined) profileFields.program_name = body.program_name;
    if(body.program_desc !== undefined) profileFields.program_desc = body.program_desc;
    if(body.program_url !== undefined) profileFields.program_url = body.program_url;
    if(body.currency !== undefined) profileFields.currency = body.currency;
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
