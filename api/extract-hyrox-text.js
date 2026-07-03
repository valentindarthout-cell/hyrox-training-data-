// Reads a free-text Hyrox workout description and extracts station quantities
const { cors } = require('./_supabase.js');

const PROMPT = `You will receive the free-text description of a Hyrox-style training session, written by an athlete (may be in French or English, may span multiple rounds/sets). Extract total station quantities SUMMED across all rounds. Respond ONLY with a JSON object, no markdown, no preamble:
{"ski_erg_m": int|null, "sled_push_m": int|null, "sled_pull_m": int|null, "burpees_reps": int|null, "row_erg_m": int|null, "farmers_m": int|null, "lunges_m": int|null, "wallballs_reps": int|null, "compromised_run_km": number|null}
Conversion rules: burpee broad jumps expressed in meters convert to reps at 2 m = 1 rep. Lunges expressed in reps convert to meters at 1 rep = 1 m. Running between stations counts as compromised_run_km. Sum across all rounds (e.g. "4x 250m ski" = 1000). Use null for any station not mentioned. Do not guess values not present in the text.`;

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  const { text } = req.body || {};
  if(!text || !text.trim()) return res.status(400).json({error:'No text provided'});

  try{
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version':'2023-06-01'
      },
      body: JSON.stringify({
        model:'claude-sonnet-4-6',
        max_tokens: 500,
        messages:[{ role:'user', content: PROMPT + '\n\nWorkout text:\n' + text }]
      })
    });
    const data = await r.json();
    if(!r.ok) return res.status(500).json({error:(data.error&&data.error.message)||'AI request failed'});
    const raw = (data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('');
    const clean = raw.replace(/```json|```/g,'').trim();
    let extracted;
    try{ extracted = JSON.parse(clean); }
    catch(e){ return res.status(500).json({error:'Could not parse the workout text'}); }
    return res.status(200).json({ extracted });
  }catch(e){
    return res.status(500).json({error:'AI request failed'});
  }
};
