// OCTA. workouts endpoint — templates, assignments, week labels, landing publish
// Coach:
//   GET  ?action=templates                       -> coach's workout library
//   POST {action:'save-template', workout}       -> create/update template
//   POST {action:'delete-template', id}
//   POST {action:'assign', workout_id, athlete_ids[], date}   -> copy to athletes
//   GET  ?action=assignments&athlete_id=&start=&end=          -> athlete's assignments (coach view)
//   POST {action:'update-assignment', id, ...fields}          -> edit one athlete's copy
//   POST {action:'delete-assignment', id}
//   POST {action:'week-label', athlete_id, week_start, label}
//   POST {action:'publish-landing', ...fields}   -> upsert coach_public
// Athlete:
//   GET  ?action=my-assignments&start=&end=      -> own assignments + week labels
//   POST {action:'complete', id, difficulty}     -> mark done
const { cors, userToken, sb, getUser } = require('./_supabase.js');

function slugify(s){
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40) || 'coach';
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
    if(!r.ok) return res.status(500).json({error:'Could not load library'});
    return res.status(200).json({ templates: r.data||[] });
  }

  if(action === 'save-template'){
    const w = (req.body||{}).workout || {};
    const row = {
      coach_id: user.id, title: w.title||'Untitled', workout_type: w.workout_type||'hyrox',
      duration_min: w.duration_min??null, objective: w.objective||null,
      blocks: w.blocks||[], stations: w.stations||{}
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
    if(!r.ok) return res.status(500).json({error:'Could not save workout'});
    return res.status(200).json({ workout: Array.isArray(r.data)? r.data[0] : r.data });
  }

  if(action === 'delete-template'){
    const { id } = req.body||{};
    const r = await sb(`/rest/v1/workouts?id=eq.${id}&coach_id=eq.${user.id}`, token, {method:'DELETE'});
    if(!r.ok) return res.status(500).json({error:'Could not delete'});
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
    const rows = athlete_ids.map(aid=>({
      workout_id: w.id, coach_id: user.id, athlete_id: aid, date,
      title: w.title, workout_type: w.workout_type, duration_min: w.duration_min,
      objective: w.objective, blocks: w.blocks, stations: w.stations
    }));
    const r = await sb('/rest/v1/assignments', token, {method:'POST', body: JSON.stringify(rows)});
    if(!r.ok) return res.status(500).json({error:'Could not assign'});
    return res.status(200).json({ assigned: rows.length });
  }

  if(action === 'assignments'){
    const { athlete_id, start, end } = req.query||{};
    if(!athlete_id || !start || !end) return res.status(400).json({error:'athlete_id, start, end required'});
    const r = await sb(`/rest/v1/assignments?coach_id=eq.${user.id}&athlete_id=eq.${athlete_id}&date=gte.${start}&date=lte.${end}&order=date.asc`, token, {method:'GET'});
    if(!r.ok) return res.status(500).json({error:'Could not load'});
    return res.status(200).json({ assignments: r.data||[] });
  }

  if(action === 'update-assignment'){
    const b = req.body||{};
    if(!b.id) return res.status(400).json({error:'id required'});
    const patch = {};
    ['title','workout_type','duration_min','objective','blocks','stations','date'].forEach(k=>{
      if(b[k] !== undefined) patch[k]=b[k];
    });
    const r = await sb(`/rest/v1/assignments?id=eq.${b.id}&coach_id=eq.${user.id}`, token, {
      method:'PATCH', body: JSON.stringify(patch)
    });
    if(!r.ok) return res.status(500).json({error:'Could not update'});
    return res.status(200).json({ ok:true });
  }

  if(action === 'delete-assignment'){
    const { id } = req.body||{};
    const r = await sb(`/rest/v1/assignments?id=eq.${id}&coach_id=eq.${user.id}`, token, {method:'DELETE'});
    if(!r.ok) return res.status(500).json({error:'Could not delete'});
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
    if(!r.ok) return res.status(500).json({error:'Could not save label'});
    return res.status(200).json({ ok:true });
  }

  /* ---------------- coach: landing publish ---------------- */
  if(action === 'publish-landing'){
    const b = req.body||{};
    // fetch profile for defaults + invite code
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
      // slug collision with another coach — suffix and retry once
      row.slug = slug + '-' + Math.floor(Math.random()*900+100);
      r = await sb('/rest/v1/coach_public?on_conflict=coach_id', token, {
        method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=representation'},
        body: JSON.stringify([row])
      });
    }
    if(!r.ok) return res.status(500).json({error:'Could not publish'});
    return res.status(200).json({ landing: Array.isArray(r.data)? r.data[0] : row });
  }

  if(action === 'my-landing'){
    const r = await sb(`/rest/v1/coach_public?coach_id=eq.${user.id}`, token, {method:'GET'});
    return res.status(200).json({ landing: (r.ok && r.data && r.data[0]) || null });
  }

  /* ---------------- athlete ---------------- */
  if(action === 'my-assignments'){
    const { start, end } = req.query||{};
    if(!start || !end) return res.status(400).json({error:'start and end required'});
    const a = await sb(`/rest/v1/assignments?athlete_id=eq.${user.id}&date=gte.${start}&date=lte.${end}&order=date.asc`, token, {method:'GET'});
    const l = await sb(`/rest/v1/week_labels?athlete_id=eq.${user.id}&week_start=gte.${start}&week_start=lte.${end}`, token, {method:'GET'});
    if(!a.ok) return res.status(500).json({error:'Could not load'});
    return res.status(200).json({ assignments: a.data||[], labels: (l.ok && l.data)||[] });
  }

  if(action === 'complete'){
    const { id, difficulty } = req.body||{};
    if(!id) return res.status(400).json({error:'id required'});
    const r = await sb(`/rest/v1/assignments?id=eq.${id}&athlete_id=eq.${user.id}`, token, {
      method:'PATCH', body: JSON.stringify({ status:'done', difficulty: difficulty??null })
    });
    if(!r.ok) return res.status(500).json({error:'Could not update'});
    return res.status(200).json({ ok:true });
  }

  return res.status(400).json({error:'Unknown action'});
};
