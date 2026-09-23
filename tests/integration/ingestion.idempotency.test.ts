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

async function rowCount(): Promise<number> {
  const [r] = await db.sql<{ c: number }[]>`select count(*)::int as c from transactions`;
  return r?.c ?? 0;
}

describe('ingestion idempotency', () => {
  it('re-running ingestion never inflates the row count', async () => {
    const rows = demoRows();
    const first = await seed(db.sql, rows);
    const afterFirst = await rowCount();
    expect(first.written).toBe(rows.length);
    expect(afterFirst).toBe(rows.length);

    const second = await seed(db.sql, rows);
    const afterSecond = await rowCount();
    expect(second.written).toBe(0); // all updates, no new inserts
    expect(second.updated).toBe(rows.length);
    expect(afterSecond).toBe(afterFirst);
  });

  it('a corrected record updates in place rather than duplicating', async () => {
    const before = await rowCount();
    const original = demoRows()[0]!;
    const corrected = { ...original, amountMinor: 777n };
    const res = await upsertTransactions(db.sql, [corrected]);
    expect(res.updated).toBe(1);
    expect(await rowCount()).toBe(before);
    const [changed] = await db.sql<{ a: string }[]>`
      select amount_minor::text as a from transactions
      where source = ${original.source} and external_id = ${original.externalId}
    `;
    expect(changed?.a).toBe('777');
  });
});
