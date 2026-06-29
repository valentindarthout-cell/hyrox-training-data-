module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { image, mediaType } = req.body;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
    body: JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1000,messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:mediaType,data:image}},{type:'text',text:'Fitness screenshot. JSON only no markdown: {"name":"string","duration_min":null,"distance_km":null,"avg_hr":null,"calories":null,"workout_description":"string or null"}'}]}]})
  });
  const raw = await r.text();
  console.log('RAW:',raw);
  const data = JSON.parse(raw);
  const parsed = JSON.parse(data.content[0].text);
  res.status(200).json(parsed);
};
