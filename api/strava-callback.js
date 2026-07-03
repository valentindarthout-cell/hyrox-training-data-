// Strava redirects here after the athlete authorizes. Exchange code for tokens, save, redirect back to app.
const { cors, sb, ANON, SUPABASE_URL } = require('./_supabase.js');

module.exports = async function handler(req, res){
  cors(res);
  const { code, state, error } = req.query || {};
  const appUrl = process.env.APP_URL || 'https://hyrox-training-data.vercel.app';

  if(error || !code || !state){
    res.writeHead(302, { Location: `${appUrl}/?strava=error` });
    return res.end();
  }

  let uid, userJwt;
  try{
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    uid = decoded.uid; userJwt = decoded.token;
  }catch(e){
    res.writeHead(302, { Location: `${appUrl}/?strava=error` });
    return res.end();
  }

  try{
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code, grant_type:'authorization_code'
      })
    });
    const tok = await tokenRes.json();
    if(!tokenRes.ok || !tok.access_token){
      res.writeHead(302, { Location: `${appUrl}/?strava=error` });
      return res.end();
    }

    const row = {
      user_id: uid,
      strava_athlete_id: tok.athlete && tok.athlete.id,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: tok.expires_at
    };
    await fetch(`${SUPABASE_URL}/rest/v1/strava_tokens?on_conflict=user_id`, {
      method:'POST',
      headers:{
        'apikey': ANON, 'Authorization':'Bearer '+userJwt,
        'Content-Type':'application/json', 'Prefer':'resolution=merge-duplicates'
      },
      body: JSON.stringify([row])
    });

    res.writeHead(302, { Location: `${appUrl}/?strava=connected` });
    res.end();
  }catch(e){
    res.writeHead(302, { Location: `${appUrl}/?strava=error` });
    res.end();
  }
};
