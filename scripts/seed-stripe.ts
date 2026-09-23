import Stripe from 'stripe';
import { env, hasStripe } from '../src/shared/config/env';
import { logger } from '../src/shared/logger';

/**
 * Create real sample charges in your Stripe TEST-MODE account, so the Stripe
 * adapter has real data to pull. A fresh Stripe test account is empty; this
 * populates it. After running this, run `pnpm ingest` to fetch these charges
 * into the transactions table.
 *
 * Requires STRIPE_SECRET_KEY (an sk_test_... key). Uses Stripe's built-in test
 * payment methods (no real card, no money). `metadata.occurred_at` gives each
 * charge a real event date (test charges are otherwise stamped "now"), which the
 * mapper prefers — see src/sources/stripe/stripe.mapper.ts.
 */
if (!hasStripe()) {
  console.error('Set STRIPE_SECRET_KEY (sk_test_...) in .env first. See the README for how to get a test key.');
  process.exit(1);
}

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

interface Spec {
  amount: number; // integer minor units (cents)
  currency: string;
  occurredAt: string; // ISO — spreads the data across months
  decline?: boolean; // use a card that is declined -> a "failed" charge
}

const specs: Spec[] = [
  { amount: 100_000, currency: 'usd', occurredAt: '2026-01-15T10:00:00Z' },
  { amount: 29_900, currency: 'usd', occurredAt: '2026-02-10T12:00:00Z' },
  { amount: 45_050, currency: 'usd', occurredAt: '2026-03-20T08:00:00Z' },
  { amount: 8_800, currency: 'usd', occurredAt: '2026-05-02T09:00:00Z' },
  { amount: 15_000, currency: 'usd', occurredAt: '2026-06-14T14:00:00Z' },
  { amount: 8_000, currency: 'usd', occurredAt: '2026-02-12T09:00:00Z', decline: true }, // -> status "failed"
];

let succeeded = 0;
let failed = 0;

for (const s of specs) {
  try {
    const pi = await stripe.paymentIntents.create({
      amount: s.amount,
      currency: s.currency,
      payment_method: s.decline ? 'pm_card_chargeDeclined' : 'pm_card_visa',
      confirm: true,
      description: 'metrics-never-drift test seed',
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    // Stamp the real event date onto the resulting charge so range queries work.
    if (pi.latest_charge) {
      await stripe.charges.update(String(pi.latest_charge), { metadata: { occurred_at: s.occurredAt } });
    }
    succeeded++;
  } catch (e) {
    // A declined test card throws a card_error; the "failed" charge still exists
    // in Stripe and will be pulled (and correctly NOT counted as revenue).
    if (e instanceof Stripe.errors.StripeCardError) {
      failed++;
    } else {
      logger.error('stripe seed error', { error: e instanceof Error ? e.message : String(e) });
    }
  }
}

logger.info('created Stripe test charges', { succeeded, failed });
console.log('\nNext: pnpm ingest   (the Stripe adapter will pull these charges into transactions)');
