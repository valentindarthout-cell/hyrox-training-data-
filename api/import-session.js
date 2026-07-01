module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  try {
    const { image, mediaType, workoutType } = req.body;
    if (!image) { res.status(400).json({ error: 'No image' }); return; }

    const prompt = workoutType === 'hyrox'
      ? `This is a Hyrox workout screenshot. Respond ONLY with JSON, no markdown:
{"name":"workout name","duration_min":null,"distance_km":null,"avg_hr":null,"calories":null,
"zone1_pct":null,"zone2_pct":null,"zone3_pct":null,"zone4_pct":null,"zone5_pct":null,
"workout_description":"full workout on separate lines max 400 chars or null",
"compromised_run_km":null,"sled_push_m":null,"sled_pull_m":null,
"wallballs_reps":null,"burpees_reps":null,"lunges_reps":null}`
      : workoutType === 'strength'
      ? `This is a strength training screenshot. Respond ONLY with JSON, no markdown:
{"name":"workout name","duration_min":null,"avg_hr":null,"calories":null,
"zone1_pct":null,"zone2_pct":null,"zone3_pct":null,"zone4_pct":null,"zone5_pct":null,
"workout_description":"full workout on separate lines max 400 chars or null"}`
      : `This is an endurance training screenshot (Garmin, Strava, Fitr or similar). Respond ONLY with JSON, no markdown:
{"name":"workout name","duration_min":null,"distance_km":null,"avg_hr":null,"calories":null,
"avg_pace":"string like 5:30 or null","avg_watts":null,
"zone1_pct":null,"zone2_pct":null,"zone3_pct":null,"zone4_pct":null,"zone5_pct":null,
"workout_description":"full workout on separate lines max 400 chars or null"}`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: prompt }
        ]}]
      })
    });

    const raw = await r.text();
    const data = JSON.parse(raw);
    if (data.error) { res.status(500).json({ error: data.error.message }); return; }
    const text = data.content[0].text;
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.status(200).json(parsed);
  } catch(e) {
    console.log('ERR:', e.message);
    res.status(500).json({ error: e.message });
  }
}
