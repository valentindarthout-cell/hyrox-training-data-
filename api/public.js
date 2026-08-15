// Public landing page data — anon access, only published rows (RLS enforced)
const { cors, SUPABASE_URL, ANON } = require('./_supabase.js');
module.exports = async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(200).end();
  const { slug } = req.query||{};
  if(!slug) return res.status(400).json({error:'slug required'});
  const r = await fetch(`${SUPABASE_URL}/rest/v1/coach_public?slug=eq.${encodeURIComponent(slug)}&published=eq.true`, {
    headers:{ 'apikey': ANON, 'Authorization':'Bearer '+ANON }
  });
  const data = await r.json().catch(()=>[]);
  if(!r.ok || !data.length) return res.status(404).json({error:'Not found'});
  const row = data[0];

  const [progRes, testRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/landing_programs?coach_id=eq.${row.coach_id}&order=position.asc`, {
      headers:{ 'apikey': ANON, 'Authorization':'Bearer '+ANON }
    }).then(r=>r.json()).catch(()=>[]),
    fetch(`${SUPABASE_URL}/rest/v1/landing_testimonials?coach_id=eq.${row.coach_id}&order=position.asc`, {
      headers:{ 'apikey': ANON, 'Authorization':'Bearer '+ANON }
    }).then(r=>r.json()).catch(()=>[])
  ]);

  // never expose more than the landing needs
  return res.status(200).json({ landing:{
    slug: row.slug, headline: row.headline, bio: row.bio, ig_url: row.ig_url,
    website: row.website, logo_url: row.logo_url, photo_url: row.photo_url,
    program_name: row.program_name, invite_code: row.invite_code, theme: row.theme||'light'
  }, programs: (progRes||[]).map(p=>({
    id:p.id, track_id:p.track_id, name:p.name, description:p.description, difficulty:p.difficulty,
    sessions_per_week:p.sessions_per_week, hours_per_week:p.hours_per_week,
    running_km_per_week:p.running_km_per_week, price:p.price, is_1on1:p.is_1on1, cta_type:p.cta_type
  })), testimonials: (testRes||[]).map(t=>({
    id:t.id, name:t.name, quote:t.quote, photo_url:t.photo_url, ig_handle:t.ig_handle
  })) });
};
