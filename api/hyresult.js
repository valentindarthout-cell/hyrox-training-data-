// OCTA. api/hyresult.js — import ONE race from a TrainRox result URL.
// e.g. https://www.trainrox.com/results/1456995/valentin-darthout-berlin-2026
// Verified against live pages: server-rendered, includes race name, division,
// total, running total, roxzone, all 8 station splits, all 8 run laps.
const { cors, userToken, getUser } = require('./_supabase.js');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const TIME_RE = '(\\d{1,2}:\\d{2}(?::\\d{2})?)';

function stripTags(html){
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
function normTime(t){
  const p=t.split(':');
  if(p.length===3 && p[0]==='0') return p[1]+':'+p[2];   // "0:58:17" -> "58:17"
  return t;
}

const TR_STATIONS = [
  ['ski','SkiErg'], ['sled_push','Sled Push'], ['sled_pull','Sled Pull'],
  ['burpees','BBJ'], ['row','Row'], ['farmers','Farmers C\\.'],
  ['lunges','S\\. Lunges'], ['wallballs','Wall Balls'],
];

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(200).end();
  const token = userToken(req);
  if(!token) return res.status(401).json({error:'Not authenticated'});
  const user = await getUser(token);
  if(!user) return res.status(401).json({error:'Session expired'});

  const { url } = req.query || {};
  if(!url) return res.status(400).json({error:'url required'});
  let target;
  try{ target = new URL(url); }catch(e){ return res.status(400).json({error:'Invalid URL'}); }
  if(!/(^|\.)trainrox\.com$/.test(target.hostname) || !/^\/results\//.test(target.pathname))
    return res.status(400).json({error:'Paste a TrainRox result URL (trainrox.com/results/…)'});

  let html;
  try{
    const r = await fetch(target.toString(), { headers:{ 'User-Agent':UA, 'Accept':'text/html' }, redirect:'follow' });
    if(!r.ok) return res.status(502).json({error:'TrainRox responded with '+r.status+' — check the URL'});
    html = await r.text();
  }catch(e){
    return res.status(502).json({error:'Could not reach TrainRox — try again or use manual entry'});
  }

  const text = stripTags(html);

  // race name from og:title: "Valentin Darthout's HYROX Berlin 2026 Race Results & Analysis - TrainRox"
  let raceName=null;
  const ogM = html.match(/property="og:title"\s+content="([^"]+)"/i);
  if(ogM){
    raceName = ogM[1]
      .replace(/&amp;/g,'&').replace(/&#39;/g,"'")
      .replace(/^.*?['’]s\s+/,'')
      .replace(/\s+Race Results.*$/i,'')
      .trim();
  }

  // division
  let division=null;
  const divM = text.match(/(HYROX\s+(?:PRO|OPEN)\s+(?:DOUBLES\s+)?(?:MEN|WOMEN))/i);
  if(divM) division = divM[1].replace(/\s+/g,' ').toUpperCase();

  // finish time
  let total=null;
  const totM = text.match(new RegExp('Finish time\\D{0,20}'+TIME_RE,'i'));
  if(totM) total=normTime(totM[1]);

  // running / stations / roxzone aggregates
  let runTotal=null, roxzone=null;
  const aggM = text.match(new RegExp('Running\\D{0,15}'+TIME_RE+'[\\s\\S]{0,60}?Stations\\D{0,15}'+TIME_RE+'[\\s\\S]{0,60}?Roxzone\\D{0,15}'+TIME_RE,'i'));
  if(aggM){ runTotal=normTime(aggM[1]); roxzone=normTime(aggM[3]); }

  // splits section bounded to avoid false matches
  const secM = text.match(/###\s*Splits([\s\S]*?)###\s*Rank/i);
  const splitsText = secM ? secM[1] : text;
  const splits={};
  TR_STATIONS.forEach(([key,label])=>{
    const m = splitsText.match(new RegExp(label+'\\D{0,10}'+TIME_RE,'i'));
    if(m) splits[key]=normTime(m[1]);
  });
  if(runTotal) splits.run_total=runTotal;
  if(roxzone) splits.roxzone=roxzone;
  for(let i=1;i<=8;i++){
    const m = splitsText.match(new RegExp('Run '+i+'\\D{0,10}'+TIME_RE,'i'));
    if(m) splits['run_'+i]=normTime(m[1]);
  }

  if(!total)
    return res.status(422).json({error:'Could not read this result page — the layout may have changed. Use manual entry.'});

  return res.status(200).json({ result: {
    race_name: raceName||'HYROX race', race_date:null, division,
    total_time: total, splits
  }, source:'trainrox' });
};
