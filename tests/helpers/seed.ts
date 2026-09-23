import type { Db } from '../../src/shared/db/client';
import type { CanonicalTransaction } from '../../src/ingestion/ingestion.types';
import { upsertTransactions } from '../../src/ingestion/ingestion.repository';
import { COLLECTED_STATUSES } from '../../src/metrics/metrics.definition';

function row(
  source: string,
  externalId: string,
  rawStatus: string,
  amountMinor: bigint,
  currency: string,
  iso: string,
): CanonicalTransaction {
  return { source, externalId, rawStatus, amountMinor, currency, occurredAt: new Date(iso), raw: { test: true } };
}

/**
 * A deterministic dataset spread across two years, two currencies, all three
 * sources, mapped and unmapped statuses, and rows on either side of the
 * Asia/Kolkata midnight boundary. Used by the reconciliation and coverage tests.
 */
export function demoRows(): CanonicalTransaction[] {
  return [
    // stripe (USD) — collected
    row('stripe', 's1', 'succeeded', 100000n, 'USD', '2025-07-15T10:00:00Z'),
    row('stripe', 's2', 'succeeded', 29900n, 'USD', '2026-02-10T12:00:00Z'),
    row('stripe', 's3', 'succeeded', 45050n, 'USD', '2026-11-20T08:00:00Z'),
    row('stripe', 's4', 'succeeded', 8800n, 'USD', '2027-03-02T00:30:00Z'),
    // stripe — not collected
    row('stripe', 's5', 'pending', 5000n, 'USD', '2026-02-11T09:00:00Z'),
    row('stripe', 's6', 'failed', 8000n, 'USD', '2026-02-12T09:00:00Z'),
    row('stripe', 's7', 'canceled', 12000n, 'USD', '2026-03-01T09:00:00Z'),
    // razorpay (INR) — collected
    row('razorpay', 'r1', 'captured', 25000000n, 'INR', '2025-09-05T06:00:00Z'),
    row('razorpay', 'r2', 'captured', 12550000n, 'INR', '2026-02-14T09:00:00Z'),
    // boundary: 18:30Z == next day 00:00 IST
    row('razorpay', 'r3', 'captured', 9900000n, 'INR', '2026-03-31T18:30:00Z'),
    row('razorpay', 'r4', 'captured', 1234567n, 'INR', '2027-01-10T20:00:00Z'),
    // razorpay — not collected
    row('razorpay', 'r5', 'authorized', 5000000n, 'INR', '2026-02-20T09:00:00Z'),
    row('razorpay', 'r6', 'refunded', 3000000n, 'INR', '2026-03-05T09:00:00Z'),
    // legacy (mixed) — collected + one non-collected + one UNMAPPED
    row('legacy_erp', 'l1', 'PAID', 125050n, 'INR', '2026-01-05T09:30:00Z'),
    row('legacy_erp', 'l2', 'PAID', 99000n, 'USD', '2026-06-22T14:00:00Z'),
    row('legacy_erp', 'l3', 'VOID', 120000n, 'USD', '2026-02-25T19:00:00Z'),
    row('legacy_erp', 'l4', 'DISPUTED', 99900n, 'INR', '2026-08-08T09:00:00Z'), // unmapped -> unclassified
  ];
}

export async function seed(db: Db, rows: CanonicalTransaction[] = demoRows()) {
  return upsertTransactions(db, rows);
}

/**
 * An INDEPENDENT ground-truth total: the sum of collected amounts in [from, to)
 * with NO bucketing. The reconciliation test asserts the bucketed breakdown sums
 * to exactly this — so a timezone/gap-fill bug that drops or double-counts a row
 * is caught.
 */
export async function groundTruthTotals(
  db: Db,
  from: Date,
  to: Date,
): Promise<Record<string, string>> {
  const rows = await db<{ currency: string; amount: string }[]>`
    select t.currency, sum(t.amount_minor)::text as amount
    from transactions t
    join status_map m on m.source = t.source and m.raw_status = t.raw_status
    where m.canonical = any(${[...COLLECTED_STATUSES]}::text[])
      and t.occurred_at >= ${from}
      and t.occurred_at <  ${to}
    group by t.currency
  `;
  const out: Record<string, string> = {};
  for (const r of rows) out[r.currency.trim()] = r.amount;
  return out;
}
