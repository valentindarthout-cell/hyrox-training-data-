// Consolidated AI helper: POST { mode: 'screenshot'|'text', ... }
// mode=screenshot -> { image, media_type, workout_type }  (reads a fitness app screenshot)
// mode=text       -> { text }                              (reads a free-text Hyrox description)
const { cors } = require('./_supabase.js');

const SCREENSHOT_PROMPTS = {
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

const TEXT_PROMPT_HYROX = `You will receive the free-text description of a Hyrox-style training session, written by an athlete or copied from a training app like Fitr (may be in French or English, may span multiple rounds/sets). Respond ONLY with a JSON object, no markdown, no preamble:
{"name": string|null, "duration_min": int|null, "workout_description": string|null, "ski_erg_m": int|null, "sled_push_m": int|null, "sled_pull_m": int|null, "burpees_reps": int|null, "row_erg_m": int|null, "farmers_m": int|null, "lunges_m": int|null, "wallballs_reps": int|null, "compromised_run_km": number|null}
Conversion rules: burpee broad jumps expressed in meters convert to reps at 2 m = 1 rep. Lunges expressed in reps convert to meters at 1 rep = 1 m. Running between stations counts as compromised_run_km. Sum station quantities across all rounds (e.g. "4x 250m ski" = 1000).
For workout_description: reformat the workout cleanly with line breaks, keeping ONLY the structured workout content (remove coaching notes, app boilerplate, motivational text). Use null for anything not present. Do not guess values not present in the text.`;

const TEXT_PROMPT_GENERAL = `You will receive the free-text description of a training session, written by an athlete or copied from a training app like Fitr (may be in French or English). Respond ONLY with a JSON object, no markdown, no preamble:
{"name": string|null, "duration_min": int|null, "distance_km": number|null, "workout_description": string|null}
For workout_description: reformat the workout cleanly with line breaks, keeping ONLY the structured workout content (exercises, sets, reps, loads, intervals, paces). Remove coaching notes, app boilerplate, and motivational text. Use null for anything not present. Do not guess values not present in the text.`;

async function callClaude(body){
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version':'2023-06-01'
    },
    body: JSON.stringify(body)
  });
  const data = await r.json();
  if(!r.ok) throw new Error((data.error && data.error.message) || 'AI request failed');
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  const clean = text.replace(/```json|```/g,'').trim();
  return JSON.parse(clean);
}

const WORKOUT_LIBRARY = `Classic Hyrox session patterns (adapt loads/volumes to the objective):
- Hyrox simulation: 8x(1km run + station) in race order, full or half distances
- Compromised running: alternate 400-800m runs with stations at race pace
- Station EMOM/intervals: e.g. 5 rounds of 250m ski / 25m sled push / 15 wall balls, rest 2min
- Sled block: 8-12x25m push heavy + 8-12x25m pull, run 200m between
- Erg intervals: 6-10x250-500m ski or row @ target /500m pace, short rest
- Wall ball density: max reps sets of 20-30 with 1km run between
Classic running sessions:
- Zone base run: 40-90min @ I1-I2
- Threshold: 3-5x8-10min @ I4, 2min jog recovery
- VMA intervals: 8-12x400m or 4-6x1000m @ I5, equal recovery
- Progressive run: thirds I2 -> I3 -> I4
- Long run with race-pace blocks
Classic strength sessions:
- Lower: back squat 5x5 @75-85%, RDL 4x8, lunges 3x12/leg, core
- Upper: bench 5x5, strict press 4x6, rows 4x10, farmers carry
- Full body power: deadlift 5x3 @85%, push press 4x5, sled work
- Strength endurance: circuits 3-4 rounds of 10-15 reps compound moves, minimal rest`;

const WORKOUT_PROMPT = (duration, objective, type) => `You are an elite Hyrox coach. Create ONE ${type} workout of about ${duration} minutes for this objective: "${objective}".
Use these classic patterns as inspiration:
${WORKOUT_LIBRARY}

Respond ONLY with a JSON object, no markdown, no preamble:
{"title": string, "blocks": [{"name": string, "exercises": [{"name": string, "sets": int|null, "qty": number|null, "unit": "reps"|"m"|"km"|"min"|"s"|null, "load_pct": int|null, "load_ref": "deadlift"|"back_squat"|"front_squat"|"bench"|"strict_press"|null, "zone": "I1"|"I2"|"I3"|"I4"|"I5"|"I6"|null, "notes": string|null}]}], "stations": {"run_km": number|null, "compromised_run_km": number|null, "ski_erg_m": int|null, "sled_push_m": int|null, "sled_pull_m": int|null, "burpees_reps": int|null, "row_erg_m": int|null, "farmers_m": int|null, "lunges_m": int|null, "wallballs_reps": int|null}}
Rules: blocks are usually Warm-up / Main / Finisher (finisher optional). Use load_pct+load_ref for barbell lifts (percent of 1RM). Use zone for runs/ergs when pacing matters. In stations, sum TOTAL volumes across the whole workout; use compromised_run_km for running mixed with stations, run_km for pure running. Use null for anything not applicable. Keep exercise names short and standard.`;

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  const { mode } = req.body || {};

  if(mode === 'screenshot'){
    const { image, media_type, workout_type } = req.body || {};
    if(!image) return res.status(400).json({error:'No image provided'});
    const prompt = SCREENSHOT_PROMPTS[workout_type] || SCREENSHOT_PROMPTS.endurance;
    try{
      const extracted = await callClaude({
        model:'claude-sonnet-4-6', max_tokens: 1500,
        messages:[{ role:'user', content:[
          { type:'image', source:{ type:'base64', media_type: media_type || 'image/png', data: image } },
          { type:'text', text: prompt }
        ]}]
      });
      return res.status(200).json({ extracted });
    }catch(e){ return res.status(500).json({error: e.message || 'Could not read the screenshot'}); }
  }

  if(mode === 'workout'){
    const { duration_min, objective, workout_type } = req.body || {};
    if(!objective || !objective.trim()) return res.status(400).json({error:'Describe the objective first'});
    try{
      const extracted = await callClaude({
        model:'claude-sonnet-4-6', max_tokens: 2000,
        messages:[{ role:'user', content: WORKOUT_PROMPT(duration_min||60, objective.trim(), workout_type||'hyrox') }]
      });
      return res.status(200).json({ workout: extracted });
    }catch(e){ return res.status(500).json({error: e.message || 'Generation failed'}); }
  }

  if(mode === 'text'){
    const { text, workout_type } = req.body || {};
    if(!text || !text.trim()) return res.status(400).json({error:'No text provided'});
    const prompt = workout_type === 'hyrox' ? TEXT_PROMPT_HYROX : TEXT_PROMPT_GENERAL;
    try{
      const extracted = await callClaude({
        model:'claude-sonnet-4-6', max_tokens: 900,
        messages:[{ role:'user', content: prompt + '\n\nWorkout text:\n' + text }]
      });
      return res.status(200).json({ extracted });
    }catch(e){ return res.status(500).json({error: e.message || 'Could not read the workout text'}); }
  }

  return res.status(400).json({error:'Invalid mode'});
};
