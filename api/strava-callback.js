// Strava redirects here after the athlete authorizes. Exchange code for tokens, save, redirect back to app.
const { sb, ANON, SUPABASE_URL } = require('./_supabase.js');

module.exports = async function handler(req, res){
  const { code, state, error } = req.query || {};
  const appUrl = process.env.APP_URL || 'https://hyrox-training-data.vercel.app';

  console.log('[strava-callback] hit. has code:', !!code, 'has state:', !!state, 'error param:', error);

  if(error || !code || !state){
    console.log('[strava-callback] missing code/state or Strava returned an error param:', error);
    res.writeHead(302, { Location: `${appUrl}/?strava=error&reason=missing_params` });
    return res.end();
  }

  let uid, userJwt;
  try{
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    uid = decoded.uid; userJwt = decoded.token;
    console.log('[strava-callback] decoded state OK. uid:', uid, 'jwt present:', !!userJwt);
  }catch(e){
    console.log('[strava-callback] failed to decode state:', e.message);
    res.writeHead(302, { Location: `${appUrl}/?strava=error&reason=bad_state` });
    return res.end();
  }

  try{
    const clientIdSet = !!process.env.STRAVA_CLIENT_ID;
    const clientSecretSet = !!process.env.STRAVA_CLIENT_SECRET;
    console.log('[strava-callback] env check. STRAVA_CLIENT_ID set:', clientIdSet, 'STRAVA_CLIENT_SECRET set:', clientSecretSet);

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
    console.log('[strava-callback] Strava token exchange status:', tokenRes.status, 'body:', JSON.stringify(tok).slice(0,500));

    if(!tokenRes.ok || !tok.access_token){
      res.writeHead(302, { Location: `${appUrl}/?strava=error&reason=token_exchange_failed` });
      return res.end();
    }

    const row = {
      user_id: uid,
      strava_athlete_id: tok.athlete && tok.athlete.id,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: tok.expires_at
    };
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/strava_tokens?on_conflict=user_id`, {
      method:'POST',
      headers:{
        'apikey': ANON, 'Authorization':'Bearer '+userJwt,
        'Content-Type':'application/json', 'Prefer':'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify([row])
    });
    const insertBody = await insertRes.text();
    console.log('[strava-callback] Supabase insert status:', insertRes.status, 'body:', insertBody.slice(0,500));

    if(!insertRes.ok){
      res.writeHead(302, { Location: `${appUrl}/?strava=error&reason=db_insert_failed` });
      return res.end();
    }

    res.writeHead(302, { Location: `${appUrl}/?strava=connected` });
    res.end();
  }catch(e){
    console.log('[strava-callback] unexpected exception:', e.message);
    res.writeHead(302, { Location: `${appUrl}/?strava=error&reason=exception` });
    res.end();
  }
};
