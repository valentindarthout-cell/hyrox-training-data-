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

const WORKOUT_LIBRARY = `Classic Hyrox session patterns (adapt to the objective):
- Hyrox simulation: 8x(1km run + station) in race order, full or half distances
- Compromised running: alternate runs with stations at race pace
- Station intervals: rounds of ski / sled / wall balls with controlled rest
- Sled block: repeats of push + pull with short runs between
- Erg intervals: ski or row repeats at target /500m pace
- Wall ball density: sets with runs between
Classic running: zone base runs, threshold blocks (I4), VMA intervals (I5), progressive runs, long runs with race-pace blocks.
Classic strength: squat/deadlift/bench/press strength work at %1RM, strength-endurance circuits, sled and carry work.`;

const HYROX_STANDARDS = `STRICT programming standards — always use these values:
- Run / Ski erg / Row erg interval distances: only 200m, 250m, 400m, 500m, 800m, 1km, 1 mile, 1.5km, 2km, 3km, 4km, 5km (never below 200m).
- Wall balls: rep sets only from 10, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100. Ball weight expressed relative to race: "race weight ball", "lighter than race weight", "heavier than race weight".
- Sled push / sled pull: lengths only in multiples of 10m, 12.5m or 15m (e.g. 2x12.5m, 25m, 50m). Load expressed relative to race weight: "lighter than race weight", "race weight", "heavier than race weight".
- Sandbag lunges: load relative to race weight (lighter / race weight / heavier).
- Rest periods: only 30s, 45s, 60s, 90s, 2min, 3min or 5min.
- Barbell lifts: sets x reps @%1RM (e.g. 5x5 @75%).
- Run/erg pacing: reference zones I1-I6 when pacing matters (e.g. "4x1km @ I4").`;

const WORKOUT_PROMPT = (duration, objective, type, intensity) => `You are an elite Hyrox coach. Create ONE ${type} workout of about ${duration} minutes for this objective: "${objective}".
Overall station-load intent: ${intensity||'race weight'}.
${HYROX_STANDARDS}
Inspiration patterns:
${WORKOUT_LIBRARY}

Respond ONLY with a JSON object, no markdown, no preamble:
{"title": string, "blocks": [{"name": "Warm-up"|"Main"|"Finisher"|"Cool-down", "text": string}], "stations": {"run_km": number|null, "compromised_run_km": number|null, "ski_erg_m": int|null, "sled_push_m": int|null, "sled_pull_m": int|null, "burpees_reps": int|null, "row_erg_m": int|null, "farmers_m": int|null, "lunges_m": int|null, "wallballs_reps": int|null}}
Rules: "text" is the written workout for that block, formatted with line breaks, concise and coach-professional (French or English matching the objective language). Always include Warm-up and Main; Finisher and Cool-down only when relevant. In stations, sum TOTAL volumes across the whole workout; compromised_run_km = running mixed with stations, run_km = pure running. Use null when not applicable.`;

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
    const { duration_min, objective, workout_type, intensity } = req.body || {};
    if(!objective || !objective.trim()) return res.status(400).json({error:'Describe the objective first'});
    try{
      const extracted = await callClaude({
        model:'claude-sonnet-4-6', max_tokens: 2000,
        messages:[{ role:'user', content: WORKOUT_PROMPT(duration_min||60, objective.trim(), workout_type||'hyrox', intensity) }]
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
