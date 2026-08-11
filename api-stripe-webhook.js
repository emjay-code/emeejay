const Stripe = require('stripe');
const getRawBody = require('raw-body');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qzbydxxqyqvloeogrycx.supabase.co';

function mapSubStatus(stripeStatus) {
  if (stripeStatus === 'active' || stripeStatus === 'trialing') return stripeStatus === 'trialing' ? 'trialing' : 'active';
  if (stripeStatus === 'past_due' || stripeStatus === 'unpaid') return 'past_due';
  if (stripeStatus === 'canceled' || stripeStatus === 'incomplete_expired') return 'canceled';
  return 'active';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing required env vars for stripe-webhook');
    res.status(500).json({ error: 'Webhook not configured' });
    return;
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  let event;

  try {
    const rawBody = await getRawBody(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).send('Webhook Error: ' + err.message);
    return;
  }

  const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const schoolId = session.client_reference_id || (session.metadata && session.metadata.school_id);
      if (schoolId) {
        await supabase
          .from('schools')
          .update({
            subscription_status: 'active',
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription
          })
          .eq('id', schoolId);
      }
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const schoolId = sub.metadata && sub.metadata.school_id;
      const status = event.type === 'customer.subscription.deleted' ? 'canceled' : mapSubStatus(sub.status);

      if (schoolId) {
        await supabase.from('schools').update({ subscription_status: status }).eq('id', schoolId);
      } else if (sub.customer) {
        await supabase.from('schools').update({ subscription_status: status }).eq('stripe_customer_id', sub.customer);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('stripe-webhook handling error:', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
