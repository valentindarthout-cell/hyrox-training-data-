const { cors, userToken, getUser, SUPABASE_URL, ANON } = require('./_supabase.js');

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  const token = userToken(req);
  if(!token) return res.status(401).json({error:'Not authenticated'});
  const user = await getUser(token);
  if(!user) return res.status(401).json({error:'Session expired'});

  const { image, content_type } = req.body || {};
  if(!image) return res.status(400).json({error:'No image provided'});

  const ext = (content_type || 'image/png').split('/')[1].replace('jpeg','jpg');
  const path = `${user.id}/logo.${ext}`;
  const buffer = Buffer.from(image, 'base64');
  if(buffer.length > 2 * 1024 * 1024) return res.status(400).json({error:'Logo must be under 2 MB'});

  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/logos/${path}`, {
    method:'POST',
    headers:{
      'apikey': ANON,
      'Authorization': 'Bearer ' + token,
      'Content-Type': content_type || 'image/png',
      'x-upsert': 'true'
    },
    body: buffer
  });
  if(!up.ok){
    const err = await up.json().catch(() => ({}));
    return res.status(500).json({error: err.message || 'Upload failed'});
  }

  const logo_url = `${SUPABASE_URL}/storage/v1/object/public/logos/${path}?v=${Date.now()}`;
  // save url on profile
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
    method:'PATCH',
    headers:{ 'apikey': ANON, 'Authorization':'Bearer '+token, 'Content-Type':'application/json' },
    body: JSON.stringify({ logo_url })
  });
  return res.status(200).json({ logo_url });
};
