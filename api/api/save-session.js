module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) { res.status(401).json({ error: 'Not logged in' }); return; }

    const userRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': process.env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
    });
    const userData = await userRes.json();
    if (!userData.id) { res.status(401).json({ error: 'Invalid token' }); return; }

    const s = req.body;
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        user_id: userData.id,
        session_date: s.session_date,
        num_sessions: s.num_sessions,
        s1_name: s.s1_name, s1_duration_min: s.s1_duration_min, s1_run_km: s.s1_run_km,
        s1_pace: s.s1_pace, s1_hr: s.s1_hr, s1_kcal: s.s1_kcal, s1_rpe: s.s1_rpe, s1_workout: s.s1_workout,
        s2_name: s.s2_name, s2_duration_min: s.s2_duration_min, s2_run_km: s.s2_run_km,
        s2_pace: s.s2_pace, s2_hr: s.s2_hr, s2_kcal: s.s2_kcal, s2_rpe: s.s2_rpe,
        tot_time_min: s.tot_time_min, tot_run_km: s.tot_run_km, tot_kcal: s.tot_kcal
      })
    });
    if (r.status === 201) { res.status(200).json({ success: true }); return; }
    const err = await r.json();
    res.status(500).json({ error: JSON.stringify(err) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
