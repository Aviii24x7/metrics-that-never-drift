import { describe, it, expect } from 'vitest';
import { StripeChargeSchema } from '../../src/sources/stripe/stripe.schema';
import { mapStripeCharge } from '../../src/sources/stripe/stripe.mapper';

describe('stripe mapper', () => {
  it('normalizes a charge and copies status verbatim', () => {
    const charge = StripeChargeSchema.parse({
      id: 'ch_1',
      amount: 100000,
      currency: 'usd',
      status: 'succeeded',
      created: 1767225600,
      metadata: {},
    });
    const c = mapStripeCharge(charge);
    expect(c.source).toBe('stripe');
    expect(c.externalId).toBe('ch_1');
    expect(c.rawStatus).toBe('succeeded'); // verbatim, not interpreted
    expect(c.amountMinor).toBe(100000n);
    expect(c.currency).toBe('USD');
    expect(c.occurredAt.getTime()).toBe(1767225600 * 1000);
  });

  it('prefers metadata.occurred_at over created', () => {
    const charge = StripeChargeSchema.parse({
      id: 'ch_2',
      amount: 5000,
      currency: 'usd',
      status: 'succeeded',
      created: 1767225600,
      metadata: { occurred_at: '2026-05-01T00:00:00Z' },
    });
    const c = mapStripeCharge(charge);
    expect(c.occurredAt.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });
});
