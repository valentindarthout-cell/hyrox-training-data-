// OCTA. workouts endpoint — templates, assignments, week labels, landing publish
// Field name note: the taxonomy column is ALWAYS "subtypes" (matches sessions/workouts/
// assignments tables). Never send "modalities" — that name only exists in the AI JSON
// output shape (api/ai.js) and must be mapped to subtypes before reaching this file.
const { cors, userToken, sb, getUser } = require('./_supabase.js');


/* ---------------- TrainRox result parser (consolidated here: Vercel function limit) ---------------- */
const TR_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const TR_TIME = '(\\d{1,2}:\\d{2}(?::\\d{2})?)';
const TR_STATIONS = [
  ['ski','SkiErg'], ['sled_push','Sled Push'], ['sled_pull','Sled Pull'],
  ['burpees','BBJ'], ['row','Row'], ['farmers','Farmers C\\.'],
  ['lunges','S\\. Lunges'], ['wallballs','Wall Balls'],
];
function trStrip(html){
  return html
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,'\n')
    .replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&rsquo;/g,"'")
    .replace(/&nbsp;/g,' ').replace(/&quot;/g,'"')
    .replace(/[ \t]+/g,' ')
    .replace(/\n{2,}/g,'\n')
    .trim();
}
function trNorm(t){
  const p=t.split(':');
  if(p.length===3 && p[0]==='0') return p[1]+':'+p[2];
  return t;
}
function trParse(html){
  const text = trStrip(html);
  let raceName=null;
  const ogM = html.match(/property="og:title"\s+content="([^"]+)"/i);
  if(ogM){
    raceName = ogM[1]
      .replace(/&amp;/g,'&').replace(/&#39;/g,"'")
      .replace(/^.*?['\u2019]s\s+/,'')
      .replace(/\s+Race Results.*$/i,'')
      .trim();
  }
  let division=null;
  const divM = text.match(/(HYROX\s+(?:PRO|OPEN)\s+(?:DOUBLES\s+)?(?:MEN|WOMEN))/i);
  if(divM) division = divM[1].replace(/\s+/g,' ').toUpperCase();
  let total=null;
  const totM = text.match(new RegExp('Finish time\\D{0,20}'+TR_TIME,'i'));
  if(totM) total=trNorm(totM[1]);
  let runTotal=null, roxzone=null;
  const aggM = text.match(new RegExp('Running\\D{0,15}'+TR_TIME+'[\\s\\S]{0,60}?Stations\\D{0,15}'+TR_TIME+'[\\s\\S]{0,60}?Roxzone\\D{0,15}'+TR_TIME,'i'));
  if(aggM){ runTotal=trNorm(aggM[1]); roxzone=trNorm(aggM[3]); }
  const secM = text.match(/###\s*Splits([\s\S]*?)###\s*Rank/i);
  const splitsText = secM ? secM[1] : text;
  const splits={};
  TR_STATIONS.forEach(([key,label])=>{
    const m = splitsText.match(new RegExp(label+'\\D{0,10}'+TR_TIME,'i'));
    if(m) splits[key]=trNorm(m[1]);
  });
  if(runTotal) splits.run_total=runTotal;
  if(roxzone) splits.roxzone=roxzone;
  for(let i=1;i<=8;i++){
    const m = splitsText.match(new RegExp('Run '+i+'\\D{0,10}'+TR_TIME,'i'));
    if(m) splits['run_'+i]=trNorm(m[1]);
  }
  if(!total) return null;
  return { race_name: raceName||'HYROX race', race_date:null, division, total_time: total, splits };
}

function slugify(s){
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40) || 'coach';
}
function dbErr(r, fallback){
  const d = r && r.data;
  const detail = d && (d.message || d.hint || d.details || (typeof d==='string'? d : null));
  return fallback + (detail? ' — ' + detail : ' (HTTP '+(r?r.status:'?')+')');
}

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(200).end();
  const token = userToken(req);
  if(!token) return res.status(401).json({error:'Not authenticated'});
  const user = await getUser(token);
  if(!user) return res.status(401).json({error:'Session expired'});

  const action = (req.method === 'GET' ? req.query.action : (req.body||{}).action) || '';

  /* ---------------- coach: templates ---------------- */
  if(action === 'templates'){
    const r = await sb(`/rest/v1/workouts?coach_id=eq.${user.id}&order=created_at.desc`, token, {method:'GET'});
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not load library')});
    return res.status(200).json({ templates: r.data||[] });
  }

  if(action === 'save-template'){
    const w = (req.body||{}).workout || {};
    const row = {
      coach_id: user.id,
      title: w.title || 'Untitled',
      workout_type: w.workout_type || 'hyrox',
      duration_min: w.duration_min ?? null,
      objective: w.objective || null,
      blocks: w.blocks || [],
      stations: w.stations || {},
      subtypes: w.subtypes || []
    };
    let r;
    if(w.id){
      r = await sb(`/rest/v1/workouts?id=eq.${w.id}&coach_id=eq.${user.id}`, token, {
        method:'PATCH', headers:{'Prefer':'return=representation'}, body: JSON.stringify(row)
      });
    }else{
      r = await sb('/rest/v1/workouts', token, {
        method:'POST', headers:{'Prefer':'return=representation'}, body: JSON.stringify([row])
      });
    }
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not save workout')});
    return res.status(200).json({ workout: Array.isArray(r.data)? r.data[0] : r.data });
  }

  if(action === 'delete-template'){
    const { id } = req.body||{};
    const r = await sb(`/rest/v1/workouts?id=eq.${id}&coach_id=eq.${user.id}`, token, {method:'DELETE'});
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not delete')});
    return res.status(200).json({ ok:true });
  }

  /* ---------------- coach: assignment ---------------- */
  if(action === 'assign'){
    const { workout_id, athlete_ids, date } = req.body||{};
    if(!workout_id || !athlete_ids || !athlete_ids.length || !date)
      return res.status(400).json({error:'workout, athletes and date required'});
    const wr = await sb(`/rest/v1/workouts?id=eq.${workout_id}&coach_id=eq.${user.id}`, token, {method:'GET'});
    const w = wr.ok && wr.data && wr.data[0];
    if(!w) return res.status(404).json({error:'Workout not found'});
    const rows = athlete_ids.map(aid => ({
      workout_id: w.id, coach_id: user.id, athlete_id: aid, date,
      title: w.title, workout_type: w.workout_type, duration_min: w.duration_min,
      objective: w.objective, blocks: w.blocks, stations: w.stations,
      subtypes: w.subtypes || []
    }));
    const r = await sb('/rest/v1/assignments', token, {method:'POST', body: JSON.stringify(rows)});
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not assign')});
    return res.status(200).json({ assigned: rows.length });
  }

  if(action === 'create-assignment'){
    const b = req.body||{};
    if(!b.athlete_id || !b.date) return res.status(400).json({error:'athlete_id and date required'});
    const row = {
      workout_id: b.workout_id || null, coach_id: user.id, athlete_id: b.athlete_id, date: b.date,
      title: b.title || 'Workout', workout_type: b.workout_type || 'hyrox',
      duration_min: b.duration_min ?? null, objective: b.objective || null,
      blocks: b.blocks || [], stations: b.stations || {},
      subtypes: b.subtypes || []
    };
    const r = await sb('/rest/v1/assignments', token, {
      method:'POST', headers:{'Prefer':'return=representation'}, body: JSON.stringify([row])
    });
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not create')});
    return res.status(200).json({ assignment: Array.isArray(r.data)? r.data[0] : null });
  }

  if(action === 'assignments'){
    const { athlete_id, start, end } = req.query||{};
    if(!athlete_id || !start || !end) return res.status(400).json({error:'athlete_id, start, end required'});
    const r = await sb(`/rest/v1/assignments?coach_id=eq.${user.id}&athlete_id=eq.${athlete_id}&date=gte.${start}&date=lte.${end}&order=date.asc`, token, {method:'GET'});
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not load')});
    return res.status(200).json({ assignments: r.data||[] });
  }

  if(action === 'update-assignment'){
    const b = req.body||{};
    if(!b.id) return res.status(400).json({error:'id required'});
    const patch = {};
    ['title','workout_type','duration_min','objective','blocks','stations','date','subtypes'].forEach(k=>{
      if(b[k] !== undefined) patch[k] = b[k];
    });
    const r = await sb(`/rest/v1/assignments?id=eq.${b.id}&coach_id=eq.${user.id}`, token, {
      method:'PATCH', body: JSON.stringify(patch)
    });
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not update')});
    return res.status(200).json({ ok:true });
  }

  if(action === 'delete-assignment'){
    const { id } = req.body||{};
    const r = await sb(`/rest/v1/assignments?id=eq.${id}&coach_id=eq.${user.id}`, token, {method:'DELETE'});
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not delete')});
    return res.status(200).json({ ok:true });
  }

  if(action === 'week-label'){
    const { athlete_id, week_start, label } = req.body||{};
    if(!athlete_id || !week_start) return res.status(400).json({error:'athlete_id and week_start required'});
    if(!label){
      await sb(`/rest/v1/week_labels?athlete_id=eq.${athlete_id}&week_start=eq.${week_start}&coach_id=eq.${user.id}`, token, {method:'DELETE'});
      return res.status(200).json({ ok:true });
    }
    const r = await sb('/rest/v1/week_labels?on_conflict=athlete_id,week_start', token, {
      method:'POST', headers:{'Prefer':'resolution=merge-duplicates'},
      body: JSON.stringify([{ athlete_id, coach_id: user.id, week_start, label }])
    });
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not save label')});
    return res.status(200).json({ ok:true });
  }

  /* ---------------- coach: landing publish ---------------- */
  if(action === 'publish-landing'){
    const b = req.body||{};
    const pr = await sb(`/rest/v1/profiles?id=eq.${user.id}`, token, {method:'GET'});
    const prof = (pr.ok && pr.data && pr.data[0]) || {};
    let slug = b.slug ? slugify(b.slug) : slugify(prof.program_name || prof.email);
    const row = {
      coach_id: user.id, slug,
      headline: b.headline||null, bio: b.bio ?? prof.program_desc ?? null,
      ig_url: b.ig_url||null, website: b.website ?? prof.program_url ?? null,
      logo_url: prof.logo_url||null, photo_url: b.photo_url||null,
      program_name: prof.program_name||null, invite_code: prof.invite_code||null,
      published: b.published !== false, updated_at: new Date().toISOString()
    };
    let r = await sb('/rest/v1/coach_public?on_conflict=coach_id', token, {
      method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=representation'},
      body: JSON.stringify([row])
    });
    if(!r.ok && r.status === 409){
      row.slug = slug + '-' + Math.floor(Math.random()*900+100);
      r = await sb('/rest/v1/coach_public?on_conflict=coach_id', token, {
        method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=representation'},
        body: JSON.stringify([row])
      });
    }
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not publish')});
    return res.status(200).json({ landing: Array.isArray(r.data)? r.data[0] : row });
  }

  if(action === 'my-landing'){
    const r = await sb(`/rest/v1/coach_public?coach_id=eq.${user.id}`, token, {method:'GET'});
    return res.status(200).json({ landing: (r.ok && r.data && r.data[0]) || null });
  }

  /* ---------------- TrainRox import ---------------- */
  if(action === 'import-trainrox'){
    const { url } = req.query || {};
    if(!url) return res.status(400).json({error:'url required'});
    let target;
    try{ target = new URL(url); }catch(e){ return res.status(400).json({error:'Invalid URL'}); }
    if(!/(^|\.)trainrox\.com$/.test(target.hostname) || !/^\/results\//.test(target.pathname))
      return res.status(400).json({error:'Paste a TrainRox result URL (trainrox.com/results/…)'});
    let html;
    try{
      const r = await fetch(target.toString(), { headers:{ 'User-Agent':TR_UA, 'Accept':'text/html' }, redirect:'follow' });
      if(!r.ok) return res.status(502).json({error:'TrainRox responded with '+r.status+' — check the URL'});
      html = await r.text();
    }catch(e){
      return res.status(502).json({error:'Could not reach TrainRox — try again or use manual entry'});
    }
    const parsed = trParse(html);
    if(!parsed) return res.status(422).json({error:'Could not read this result page — use manual entry.'});
    return res.status(200).json({ result: parsed, source:'trainrox' });
  }

  /* ---------------- race results ---------------- */
  if(action === 'results'){
    const target = (req.query||{}).athlete_id || user.id;
    const r = await sb(`/rest/v1/race_results?athlete_id=eq.${target}&order=created_at.desc`, token, {method:'GET'});
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not load results')});
    return res.status(200).json({ results: r.data||[] });
  }

  if(action === 'save-result'){
    const b = req.body||{};
    if(!b.total_time) return res.status(400).json({error:'Total time required'});
    const row = {
      athlete_id: user.id, source: b.source||'manual',
      race_name: b.race_name||null, race_date: b.race_date||null,
      division: b.division||null, total_time: b.total_time,
      splits: b.splits||{}, is_reference: !!b.is_reference
    };
    const r = await sb('/rest/v1/race_results', token, {
      method:'POST', headers:{'Prefer':'return=representation'}, body: JSON.stringify([row])
    });
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not save result')});
    return res.status(200).json({ result: Array.isArray(r.data)? r.data[0] : null });
  }

  if(action === 'update-result'){
    const b = req.body||{};
    if(!b.id) return res.status(400).json({error:'id required'});
    const patch = {};
    ['race_name','race_date','division','total_time','splits'].forEach(k=>{
      if(b[k] !== undefined) patch[k]=b[k];
    });
    const r = await sb(`/rest/v1/race_results?id=eq.${b.id}&athlete_id=eq.${user.id}`, token, {
      method:'PATCH', body: JSON.stringify(patch)
    });
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not update result')});
    return res.status(200).json({ ok:true });
  }

  if(action === 'set-reference'){
    const { id } = req.body||{};
    if(!id) return res.status(400).json({error:'id required'});
    const clear = await sb(`/rest/v1/race_results?athlete_id=eq.${user.id}&is_reference=eq.true`, token, {
      method:'PATCH', body: JSON.stringify({ is_reference:false })
    });
    if(!clear.ok) return res.status(500).json({error: dbErr(clear,'Could not update')});
    const r = await sb(`/rest/v1/race_results?id=eq.${id}&athlete_id=eq.${user.id}`, token, {
      method:'PATCH', body: JSON.stringify({ is_reference:true })
    });
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not set reference')});
    return res.status(200).json({ ok:true });
  }

  if(action === 'delete-result'){
    const { id } = req.body||{};
    const r = await sb(`/rest/v1/race_results?id=eq.${id}&athlete_id=eq.${user.id}`, token, {method:'DELETE'});
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not delete result')});
    return res.status(200).json({ ok:true });
  }

  /* ---------------- races (calendar) ---------------- */
  if(action === 'races'){
    const target = (req.query||{}).athlete_id || user.id;
    const r = await sb(`/rest/v1/races?athlete_id=eq.${target}&order=race_date.asc`, token, {method:'GET'});
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not load races')});
    return res.status(200).json({ races: r.data||[] });
  }

  if(action === 'save-race'){
    const b = req.body||{};
    if(!b.name) return res.status(400).json({error:'Race name required'});
    const row = {
      athlete_id: user.id, name: b.name, race_date: b.race_date||null,
      divisions: b.divisions||[], priority: b.priority||null,
      location: b.location||null, goal_time: b.goal_time||null
    };
    let r;
    if(b.id){
      r = await sb(`/rest/v1/races?id=eq.${b.id}&athlete_id=eq.${user.id}`, token, {
        method:'PATCH', headers:{'Prefer':'return=representation'}, body: JSON.stringify(row)
      });
    }else{
      r = await sb('/rest/v1/races', token, {
        method:'POST', headers:{'Prefer':'return=representation'}, body: JSON.stringify([row])
      });
    }
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not save race')});
    return res.status(200).json({ race: Array.isArray(r.data)? r.data[0] : null });
  }

  if(action === 'delete-race'){
    const { id } = req.body||{};
    const r = await sb(`/rest/v1/races?id=eq.${id}&athlete_id=eq.${user.id}`, token, {method:'DELETE'});
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not delete race')});
    return res.status(200).json({ ok:true });
  }

  /* ---------------- athlete ---------------- */
  if(action === 'my-assignments'){
    const { start, end } = req.query||{};
    if(!start || !end) return res.status(400).json({error:'start and end required'});
    const a = await sb(`/rest/v1/assignments?athlete_id=eq.${user.id}&date=gte.${start}&date=lte.${end}&order=date.asc`, token, {method:'GET'});
    const l = await sb(`/rest/v1/week_labels?athlete_id=eq.${user.id}&week_start=gte.${start}&week_start=lte.${end}`, token, {method:'GET'});
    if(!a.ok) return res.status(500).json({error: dbErr(a,'Could not load')});
    return res.status(200).json({ assignments: a.data||[], labels: (l.ok && l.data)||[] });
  }

  if(action === 'complete'){
    const { id, difficulty } = req.body||{};
    if(!id) return res.status(400).json({error:'id required'});
    const r = await sb(`/rest/v1/assignments?id=eq.${id}&athlete_id=eq.${user.id}`, token, {
      method:'PATCH', body: JSON.stringify({ status:'done', difficulty: difficulty ?? null })
    });
    if(!r.ok) return res.status(500).json({error: dbErr(r,'Could not update')});
    return res.status(200).json({ ok:true });
  }

  return res.status(400).json({error:'Unknown action'});
};
