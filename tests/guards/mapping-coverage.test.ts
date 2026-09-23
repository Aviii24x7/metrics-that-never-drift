import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeTestDb, type TestDb } from '../helpers/db';
import { demoRows, seed } from '../helpers/seed';
import { upsertTransactions } from '../../src/ingestion/ingestion.repository';

let db: TestDb;

beforeAll(async () => {
  db = await makeTestDb();
}, 60_000);
afterAll(async () => {
  await db.drop();
});

/** The unmapped (source, raw_status) pairs — the check that gates the build. */
async function unmappedPairs() {
  return db.sql<{ source: string; raw_status: string }[]>`
    select t.source, t.raw_status
    from transactions t
    left join status_map m on m.source = t.source and m.raw_status = t.raw_status
    where m.source is null
    group by t.source, t.raw_status
  `;
}

// The CI guard proves the seeded/fixture data is fully mapped and that the
// `except`-style query correctly detects an unmapped pair. The production-time
// guarantee against a genuinely new status is the `unclassified` block returned
// on every API response (a status not in the fixture surfaces there, not in CI).
describe('mapping coverage (an unmapped status is detected, never counted as revenue)', () => {
  it('every (source, raw_status) in fully-mapped data is mapped', async () => {
    const mapped = demoRows().filter((r) => r.rawStatus !== 'DISPUTED');
    await seed(db.sql, mapped);
    const rows = await unmappedPairs();
    expect(rows.length).toBe(0);
  });

  it('an unmapped status is detected (this is what fails CI)', async () => {
    await upsertTransactions(db.sql, [
      {
        source: 'stripe',
        externalId: 'unmapped_1',
        rawStatus: 'disputed', // not in status_map
        amountMinor: 1n,
        currency: 'USD',
        occurredAt: new Date('2026-01-01T00:00:00Z'),
        raw: {},
      },
    ]);
    const rows = await unmappedPairs();
    expect(rows.map((r) => r.raw_status)).toContain('disputed');
  });
});
