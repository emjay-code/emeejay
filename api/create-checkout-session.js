const Stripe = require('stripe');

// The live price for the Emeejay Assess annual school subscription (£200/year GBP).
// This is a public identifier (not a secret) so it's safe to hardcode.
const PRICE_ID = 'price_1U7wJ7PxrDDtMoFv3rn3tOpJ';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(500).json({ error: 'Payments are not configured yet. Please contact the site owner.' });
    return;
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const body = req.body || {};
    const schoolId = body.schoolId;
    const schoolName = body.schoolName || '';
    const email = body.email;
    // Only passed when a school is completing payment setup for the very first time,
    // right after signup - see startPaymentSetupCheckout() in the client. Existing
    // "Upgrade" flows (past_due/canceled schools, or schools that already had a trial)
    // never send this, so they never get a second free trial.
    const trialDays = Number(body.trialDays) > 0 ? Math.floor(Number(body.trialDays)) : undefined;

    if (!schoolId) {
      res.status(400).json({ error: 'Missing schoolId' });
      return;
    }

    const origin = req.headers.origin || ('https://' + req.headers.host);

    const subscriptionData = { metadata: { school_id: schoolId } };
    if (trialDays) {
      subscriptionData.trial_period_days = trialDays;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: origin + '/?checkout=success',
      cancel_url: origin + '/?checkout=cancel',
      client_reference_id: schoolId,
      customer_email: email || undefined,
      metadata: { school_id: schoolId, school_name: schoolName },
      subscription_data: subscriptionData,
      managed_payments: { enabled: false }
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    res.status(500).json({ error: err.message });
  }
};
