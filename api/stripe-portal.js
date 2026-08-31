const { cors, userToken, sb, getUser } = require('./_supabase.js');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-03-31.basil' });

module.exports = async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS') return res.status(200).end();
  try{
    const token = userToken(req);
    if(!token) return res.status(401).json({error:'Not authenticated'});
    const user = await getUser(token);
    if(!user) return res.status(401).json({error:'Session expired'});

    const link = await sb(`/rest/v1/profiles?id=eq.${user.id}&select=coach_id`, token, {method:'GET'});
    const coachId = link.ok && link.data && link.data[0] && link.data[0].coach_id;
    if(!coachId) return res.status(400).json({error:'You are not linked to a coach yet'});

        const custR = await sb('/rest/v1/rpc/my_stripe_customer_id', token, {method:'POST', body:'{}'});
    const customerId = custR.ok ? custR.data : null;
    if(!customerId) return res.status(400).json({error:"No subscription found yet — subscribe first."});

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${req.headers.origin}/`
    });

    return res.status(200).json({ url: session.url });
  }catch(e){
    console.error('stripe-portal error:', e);
    return res.status(500).json({ error: e.message || 'Could not open billing portal' });
  }
};
