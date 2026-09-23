import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
import { DateTime } from 'luxon';
import { makeTestDb, type TestDb } from '../helpers/db';
import { seed, groundTruthTotals } from '../helpers/seed';
import { getBreakdown } from '../../src/metrics/metrics.repository';
import { getSummary, foldBucketsToTotals } from '../../src/metrics/metrics.service';
import { resolveRange } from '../../src/shared/time/range';
import type { CurrencyTotal } from '../../src/metrics/metrics.types';

let db: TestDb;

beforeAll(async () => {
  db = await makeTestDb();
  await seed(db.sql);
}, 60_000);
afterAll(async () => {
  await db.drop();
});

const BASE = DateTime.fromISO('2025-06-01T00:00:00Z', { zone: 'utc' });
const RUNS = Number(process.env.RECON_RUNS ?? 60);
const ZONES = ['UTC', 'Asia/Kolkata', 'America/Los_Angeles'] as const;
const BUCKETS = ['day', 'week'] as const;

function toMap(totals: CurrencyTotal[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const t of totals) m[t.currency] = t.amountMinor;
  return m;
}

describe('reconciliation: the two views always agree', () => {
  it('sum(breakdown) === independent ground truth for random ranges/zones/buckets', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 730 }), // start offset in days
        fc.integer({ min: 1, max: 420 }), // length in days
        fc.constantFrom(...ZONES),
        fc.constantFrom(...BUCKETS),
        async (startOff, len, tz, bucket) => {
          const fromISO = BASE.plus({ days: startOff }).toISODate()!;
          const toISO = BASE.plus({ days: startOff + len }).toISODate()!;
          const range = resolveRange(fromISO, toISO, tz);

          // Independent, un-bucketed ground truth vs the folded breakdown —
          // strict integer equality, no tolerance. A timezone/gap-fill bug that
          // drops or double-counts a row is caught here.
          const truth = await groundTruthTotals(db.sql, range.from, range.to);
          const buckets = await getBreakdown(db.sql, range, bucket);
          expect(toMap(foldBucketsToTotals(buckets))).toEqual(truth);
        },
      ),
      { numRuns: RUNS },
    );
  }, 120_000);

  it('the summary path equals the ground truth across timezones', async () => {
    for (const tz of ZONES) {
      const range = resolveRange('2025-06-01', '2027-06-01', tz);
      const truth = await groundTruthTotals(db.sql, range.from, range.to);
      const summary = await getSummary(db.sql, range);
      expect(toMap(summary.totals)).toEqual(truth);
    }
  }, 60_000);
});
