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

    const coachR = await sb(`/rest/v1/profiles?id=eq.${coachId}&select=stripe_price_id,program_name`, token, {method:'GET'});
    const coach = coachR.ok && coachR.data && coachR.data[0];
    if(!coach || !coach.stripe_price_id) return res.status(400).json({error:'This coach has not set up paid programs'});

    const crmR = await sb(`/rest/v1/coach_crm?coach_id=eq.${coachId}&athlete_id=eq.${user.id}`, token, {method:'GET'});
    let existingCustomer = crmR.ok && crmR.data && crmR.data[0] && crmR.data[0].stripe_customer_id;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: coach.stripe_price_id, quantity: 1 }],
      customer: existingCustomer || undefined,
      customer_email: existingCustomer ? undefined : user.email,
      allow_promotion_codes: true,
      subscription_data: { trial_period_days: 7 },
      success_url: `${req.headers.origin}/?payment=success`,
      cancel_url: `${req.headers.origin}/?payment=cancelled`,
      metadata: { coach_id: coachId, athlete_id: user.id }
    });

    return res.status(200).json({ url: session.url });
  }catch(e){
    console.error('stripe-checkout error:', e);
    return res.status(500).json({ error: e.message || 'Checkout failed' });
  }
};
