const { cors, sb, ANON, SUPABASE_URL } = require('./_supabase.js');

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  const { email, password } = req.body || {};
  if(!email || !password) return res.status(400).json({error:'Email and password required'});
  const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method:'POST',
    headers:{ 'apikey': ANON, 'Content-Type':'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await r.json();
  if(!r.ok) return res.status(401).json({error: data.error_description || data.msg || 'Invalid credentials'});
  return res.status(200).json({ access_token: data.access_token, user_id: data.user && data.user.id });
};
