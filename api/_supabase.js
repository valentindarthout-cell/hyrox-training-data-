// Shared Supabase helpers (underscore prefix = not exposed as a route)
const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;

function cors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
}

function userToken(req){
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

async function sb(path, token, opts){
  opts = opts || {};
  opts.headers = Object.assign({
    'apikey': ANON,
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  }, opts.headers || {});
  const res = await fetch(SUPABASE_URL + path, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch(e) { data = text; }
  return { ok: res.ok, status: res.status, data };
}

async function getUser(token){
  const r = await sb('/auth/v1/user', token, { method:'GET' });
  return r.ok ? r.data : null;
}

module.exports = { cors, userToken, sb, getUser, SUPABASE_URL, ANON };
