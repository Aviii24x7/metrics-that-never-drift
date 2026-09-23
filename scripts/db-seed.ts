import { sql } from '../src/shared/db/client';
import { upsertTransactions } from '../src/ingestion/ingestion.repository';
import type { CanonicalTransaction } from '../src/ingestion/ingestion.types';
import { logger } from '../src/shared/logger';

/**
 * Seed representative Stripe (USD) and Razorpay (INR) rows directly, so the full
 * multi-source, multi-currency demo works without live API keys. Legacy-ERP data
 * comes from the CSV via `pnpm ingest`. Idempotent (upsert on source+external_id).
 */
function at(iso: string): Date {
  return new Date(iso);
}

const stripe: CanonicalTransaction[] = [
  { source: 'stripe', externalId: 'ch_seed_001', rawStatus: 'succeeded', amountMinor: 100000n, currency: 'USD', occurredAt: at('2026-01-15T10:00:00Z'), raw: { seeded: true } },
  { source: 'stripe', externalId: 'ch_seed_002', rawStatus: 'succeeded', amountMinor: 29900n, currency: 'USD', occurredAt: at('2026-02-10T12:00:00Z'), raw: { seeded: true } },
  { source: 'stripe', externalId: 'ch_seed_003', rawStatus: 'succeeded', amountMinor: 45050n, currency: 'USD', occurredAt: at('2026-03-20T08:00:00Z'), raw: { seeded: true } },
  { source: 'stripe', externalId: 'ch_seed_004', rawStatus: 'pending', amountMinor: 5000n, currency: 'USD', occurredAt: at('2026-02-11T09:00:00Z'), raw: { seeded: true } },
  { source: 'stripe', externalId: 'ch_seed_005', rawStatus: 'failed', amountMinor: 8000n, currency: 'USD', occurredAt: at('2026-02-12T09:00:00Z'), raw: { seeded: true } },
  { source: 'stripe', externalId: 'ch_seed_006', rawStatus: 'canceled', amountMinor: 12000n, currency: 'USD', occurredAt: at('2026-03-01T09:00:00Z'), raw: { seeded: true } },
];

const razorpay: CanonicalTransaction[] = [
  { source: 'razorpay', externalId: 'pay_seed_001', rawStatus: 'captured', amountMinor: 25000000n, currency: 'INR', occurredAt: at('2026-01-05T06:00:00Z'), raw: { seeded: true } },
  { source: 'razorpay', externalId: 'pay_seed_002', rawStatus: 'captured', amountMinor: 12550000n, currency: 'INR', occurredAt: at('2026-02-14T09:00:00Z'), raw: { seeded: true } },
  // Boundary row: 18:30Z == 2026-04-01 00:00 IST.
  { source: 'razorpay', externalId: 'pay_seed_003', rawStatus: 'captured', amountMinor: 9900000n, currency: 'INR', occurredAt: at('2026-03-31T18:30:00Z'), raw: { seeded: true } },
  { source: 'razorpay', externalId: 'pay_seed_004', rawStatus: 'authorized', amountMinor: 5000000n, currency: 'INR', occurredAt: at('2026-02-20T09:00:00Z'), raw: { seeded: true } },
  { source: 'razorpay', externalId: 'pay_seed_005', rawStatus: 'refunded', amountMinor: 3000000n, currency: 'INR', occurredAt: at('2026-03-05T09:00:00Z'), raw: { seeded: true } },
  { source: 'razorpay', externalId: 'pay_seed_006', rawStatus: 'failed', amountMinor: 1500000n, currency: 'INR', occurredAt: at('2026-03-06T09:00:00Z'), raw: { seeded: true } },
];

const counts = await upsertTransactions(sql, [...stripe, ...razorpay]);
logger.info('seeded stripe + razorpay stand-in rows', {
  total: stripe.length + razorpay.length,
  ...counts,
});
await sql.end();
