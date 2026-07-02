// Claude Vision — reads a fitness app screenshot and extracts session data
const { cors } = require('./_supabase.js');

const PROMPTS = {
  endurance: `Extract the workout data from this fitness app screenshot. Respond ONLY with a JSON object, no markdown, no preamble:
{"name": string|null, "duration_min": int|null, "distance_km": number|null, "avg_hr": int|null, "calories": int|null, "zones": [z1,z2,z3,z4,z5] as integer percentages summing to 100 or null, "workout_description": string|null}
For workout_description: keep ONLY the structured workout content (intervals, sets, distances, paces). Remove app UI text, motivational notes, coach comments, and anything not describing the actual workout. Format it cleanly with line breaks between parts. Use null for anything not visible.`,
  hyrox: `Extract the workout data from this fitness app screenshot of a Hyrox-style training session. Respond ONLY with a JSON object, no markdown, no preamble:
{"name": string|null, "duration_min": int|null, "avg_hr": int|null, "calories": int|null, "zones": [z1,z2,z3,z4,z5] as integer percentages summing to 100 or null, "workout_description": string|null, "compromised_run_km": number|null, "ski_erg_m": int|null, "sled_push_m": int|null, "sled_pull_m": int|null, "burpees_reps": int|null, "row_erg_m": int|null, "farmers_m": int|null, "lunges_m": int|null, "wallballs_reps": int|null}
Rules: burpee broad jumps expressed in meters convert to reps at 2 m = 1 rep. Lunges expressed in reps convert to meters at 1 rep = 1 m. Sum quantities across rounds (e.g. 4 rounds of 250 m ski = 1000 m).
For workout_description: keep ONLY the structured workout content. Remove app UI text, notes, and coach comments. Use null for anything not visible.`,
  strength: `Extract the workout data from this fitness app screenshot of a strength session. Respond ONLY with a JSON object, no markdown, no preamble:
{"name": string|null, "duration_min": int|null, "avg_hr": int|null, "calories": int|null, "zones": [z1,z2,z3,z4,z5] as integer percentages summing to 100 or null, "workout_description": string|null}
For workout_description: keep ONLY the structured workout content (exercises, sets, reps, loads). Remove app UI text, notes, and coach comments. Format cleanly with line breaks. Use null for anything not visible.`
};

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  const { image, media_type, workout_type } = req.body || {};
  if(!image) return res.status(400).json({error:'No image provided'});
  const prompt = PROMPTS[workout_type] || PROMPTS.endurance;

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
        max_tokens: 1500,
        messages:[{
          role:'user',
          content:[
            { type:'image', source:{ type:'base64', media_type: media_type || 'image/png', data: image } },
            { type:'text', text: prompt }
          ]
        }]
      })
    });
    const data = await r.json();
    if(!r.ok) return res.status(500).json({error: (data.error && data.error.message) || 'AI request failed'});
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    const clean = text.replace(/```json|```/g,'').trim();
    let extracted;
    try{ extracted = JSON.parse(clean); }
    catch(e){ return res.status(500).json({error:'Could not read the screenshot — try a clearer image'}); }
    return res.status(200).json({ extracted });
  }catch(e){
    return res.status(500).json({error:'AI request failed'});
  }
};
