import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeTestDb, type TestDb } from '../helpers/db';
import { upsertTransactions } from '../../src/ingestion/ingestion.repository';
import { getBreakdown } from '../../src/metrics/metrics.repository';
import { resolveRange } from '../../src/shared/time/range';

let db: TestDb;

beforeAll(async () => {
  db = await makeTestDb();
  // One collected row at 18:30Z == 2026-04-01 00:00 in Asia/Kolkata.
  await upsertTransactions(db.sql, [
    {
      source: 'razorpay',
      externalId: 'boundary_1',
      rawStatus: 'captured',
      amountMinor: 1_000_000n,
      currency: 'INR',
      occurredAt: new Date('2026-03-31T18:30:00Z'),
      raw: { test: true },
    },
  ]);
}, 60_000);
afterAll(async () => {
  await db.drop();
});

async function nonEmpty(tz: string) {
  const range = resolveRange('2026-03-01', '2026-05-01', tz);
  const buckets = await getBreakdown(db.sql, range, 'day');
  return buckets.filter((b) => b.amountMinor !== '0');
}

describe('timezone bucketing (the same instant, different local day)', () => {
  it('buckets into 2026-03-31 in UTC', async () => {
    const b = await nonEmpty('UTC');
    expect(b).toHaveLength(1);
    expect(b[0]!.bucketStart).toBe('2026-03-31');
  });

  it('buckets into 2026-04-01 in Asia/Kolkata', async () => {
    const b = await nonEmpty('Asia/Kolkata');
    expect(b).toHaveLength(1);
    expect(b[0]!.bucketStart).toBe('2026-04-01');
  });

  it('does not drop the final bucket across a DST fall-back at the range end', async () => {
    // Regression: America/Havana falls back at 2026-11-01T05:00Z. A collected row
    // just inside the range must not vanish from the (zero-filled) breakdown.
    await upsertTransactions(db.sql, [
      {
        source: 'razorpay',
        externalId: 'dst_1',
        rawStatus: 'captured',
        amountMinor: 500_000n,
        currency: 'INR',
        occurredAt: new Date('2026-11-01T04:30:00Z'), // 00:30 local (pre-transition)
        raw: { test: true },
      },
    ]);
    const range = resolveRange('2026-10-31T00:00:00-04:00', '2026-11-01T00:00:00-05:00', 'America/Havana');
    const buckets = await getBreakdown(db.sql, range, 'day');
    const total = buckets.reduce((sum, b) => sum + BigInt(b.amountMinor), 0n);
    expect(total).toBe(500_000n); // was 0n before the fix (final bucket dropped)
  });
});
