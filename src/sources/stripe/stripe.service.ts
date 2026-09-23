import Stripe from 'stripe';
import { env } from '../../shared/config/env';
import type { FetchResult, SourceAdapter } from '../../ingestion/ingestion.types';
import { StripeChargeSchema } from './stripe.schema';
import { mapStripeCharge } from './stripe.mapper';

const MAX_CHARGES = 200;

/**
 * Pulls charges from Stripe test mode. Only runs when STRIPE_SECRET_KEY is set;
 * otherwise the orchestrator marks it "skipped" and the rest of the system runs
 * without it.
 */
export const stripeAdapter: SourceAdapter = {
  name: 'stripe',
  isConfigured() {
    return env.STRIPE_SECRET_KEY.length > 0;
  },
  async fetch(): Promise<FetchResult> {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const valid: FetchResult['valid'] = [];
    const invalid: FetchResult['invalid'] = [];
    let count = 0;
    for await (const charge of stripe.charges.list({ limit: 100 })) {
      const parsed = StripeChargeSchema.safeParse(charge);
      if (!parsed.success) {
        invalid.push({ payload: charge, error: parsed.error.message });
      } else {
        try {
          valid.push(mapStripeCharge(parsed.data));
        } catch (e) {
          invalid.push({ payload: charge, error: e instanceof Error ? e.message : String(e) });
        }
      }
      if (++count >= MAX_CHARGES) break;
    }
    return { valid, invalid };
  },
};
