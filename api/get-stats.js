module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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
    const period = req.query.period || 'week';
    const now = new Date();
    let fromDate;
    if (period === 'week') { fromDate = new Date(now); fromDate.setDate(now.getDate() - 7); }
    else if (period === 'month') { fromDate = new Date(now); fromDate.setMonth(now.getMonth() - 1); }
    else { fromDate = new Date(now); fromDate.setFullYear(now.getFullYear() - 1); }
    const fromStr = fromDate.toISOString().split('T')[0];
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/sessions?user_id=eq.${userData.id}&session_date=gte.${fromStr}&order=session_date.asc`, {
      headers: { 'apikey': process.env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
    });
    const sessions = await r.json();
    res.status(200).json({ sessions });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
