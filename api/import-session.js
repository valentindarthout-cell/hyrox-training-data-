module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  try {
    const { image, mediaType } = req.body;
    if (!image) { res.status(400).json({ error: 'No image' }); return; }
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: image } }, { type: 'text', text: 'Fitness app screenshot. Respond ONLY with JSON, no markdown:\n{"name":"workout name","duration_min":number or null,"distance_km":number or null,"avg_hr":number or null,"calories":number or null,"workout_description":"full description max 400 chars or null"}' }] }] })
    });
    const raw = await r.text();
    console.log('RAW:', raw);
    const data = JSON.parse(raw);
    if (data.error) { res.status(500).json({ error: data.error.message }); return; }
    const text = data.content[0].text;
    const parsed = JSON.parse(text);
    res.status(200).json(parsed);
  } catch(e) {
    console.log('ERR:', e.message);
    res.status(500).json({ error: e.message });
  }
}
