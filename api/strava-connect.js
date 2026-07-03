// Redirects the browser to Strava's OAuth authorization page
const { cors, userToken, getUser } = require('./_supabase.js');

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(200).end();
  const token = userToken(req) || (req.query && req.query.token);
  if(!token) return res.status(401).json({error:'Not authenticated'});
  const user = await getUser(token);
  if(!user) return res.status(401).json({error:'Session expired'});

  const clientId = process.env.STRAVA_CLIENT_ID;
  const redirectUri = process.env.STRAVA_REDIRECT_URI; // e.g. https://hyrox-training-data.vercel.app/api/strava-callback
  const state = Buffer.from(JSON.stringify({ uid: user.id, token })).toString('base64url');

  const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&approval_prompt=auto&scope=activity:read_all&state=${state}`;
  res.writeHead(302, { Location: url });
  res.end();
};
