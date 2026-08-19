const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qzbydxxqyqvloeogrycx.supabase.co';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Billing portal is not configured yet. Please contact the site owner.' });
    return;
  }

  try {
    const body = req.body || {};
    const schoolId = body.schoolId;
    if (!schoolId) {
      res.status(400).json({ error: 'Missing schoolId' });
      return;
    }

    const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: school, error } = await supabase
      .from('schools')
      .select('stripe_customer_id')
      .eq('id', schoolId)
      .single();

    if (error || !school || !school.stripe_customer_id) {
      res.status(400).json({ error: 'No billing account found for this school yet. Complete checkout first.' });
      return;
    }

    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const origin = req.headers.origin || ('https://' + req.headers.host);

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: school.stripe_customer_id,
      return_url: origin + '/'
    });

    res.status(200).json({ url: portalSession.url });
  } catch (err) {
    console.error('create-portal-session error:', err);
    res.status(500).json({ error: err.message });
  }
};
