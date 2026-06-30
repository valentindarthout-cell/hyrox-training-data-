module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  try {
    const { email, password } = req.body;
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': process.env.SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password })
    });
    const data = await r.json();
    if (data.error) { res.status(400).json({ error: data.error.message || data.msg }); return; }
    res.status(200).json({ user: data.user, token: data.access_token });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
