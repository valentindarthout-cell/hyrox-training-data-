const { sb } = require('./_supabase.js');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-03-31.basil' });

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports.config = { api: { bodyParser: false } };

function buffer(req){
  return new Promise((resolve,reject)=>{
    const chunks=[];
    req.on('data', c=>chunks.push(c));
    req.on('end', ()=>resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).end();
  const buf = await buffer(req);
  let event;
  try{
    event = stripe.webhooks.constructEvent(buf, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  }catch(e){
    console.error('stripe-webhook signature error:', e.message);
    return res.status(400).json({error:'Webhook signature verification failed'});
  }

  console.log('stripe-webhook received:', event.type);

  async function svc(path, opts){
    if(!SERVICE_KEY) console.error('SUPABASE_SERVICE_ROLE_KEY is missing!');
    const r = await sb(path, SERVICE_KEY, { ...opts, headers:{...(opts&&opts.headers||{}), 'apikey':SERVICE_KEY} });
    if(!r.ok) console.error('stripe-webhook Supabase write FAILED:', path, JSON.stringify(r.data));
    return r;
  }

  try{
    if(event.type === 'checkout.session.completed'){
      const s = event.data.object;
      console.log('checkout.session.completed metadata:', JSON.stringify(s.metadata));
      const { coach_id, athlete_id } = s.metadata || {};
      if(!coach_id || !athlete_id){
        console.error('Missing coach_id/athlete_id in session metadata — cannot write coach_crm');
      }else{
        await svc(`/rest/v1/coach_crm?on_conflict=coach_id,athlete_id`, {
          method:'POST', headers:{'Prefer':'resolution=merge-duplicates'},
          body: JSON.stringify([{
            coach_id, athlete_id, status:'active',
            stripe_customer_id: s.customer, stripe_subscription_id: s.subscription,
            paid_until: new Date(Date.now()+32*86400000).toISOString()
          }])
        });
      }
    }

    if(event.type === 'invoice.paid'){
      const inv = event.data.object;
      const periodEnd = inv.lines && inv.lines.data[0] && inv.lines.data[0].period && inv.lines.data[0].period.end;
      if(periodEnd){
        await svc(`/rest/v1/coach_crm?stripe_subscription_id=eq.${inv.subscription}`, {
          method:'PATCH', body: JSON.stringify({ paid_until: new Date(periodEnd*1000).toISOString(), status:'active' })
        });
      }
    }

        if(event.type === 'invoice.payment_failed'){
      const obj = event.data.object;
      await svc(`/rest/v1/coach_crm?stripe_subscription_id=eq.${obj.subscription}`, {
        method:'PATCH', body: JSON.stringify({ status:'past_due', paid_until: new Date().toISOString() })
      });
    }

    if(event.type === 'customer.subscription.deleted'){
      const obj = event.data.object;
      await svc(`/rest/v1/coach_crm?stripe_subscription_id=eq.${obj.id}`, {
        method:'PATCH', body: JSON.stringify({ status:'churned', paid_until: new Date().toISOString() })
      });
    }
  }catch(e){
    console.error('stripe-webhook handler error:', e);
  }

  return res.status(200).json({ received:true });
};
