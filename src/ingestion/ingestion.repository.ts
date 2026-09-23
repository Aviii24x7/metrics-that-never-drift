import type { Db } from '../shared/db/client';
import type { CanonicalTransaction } from './ingestion.types';

export interface UpsertResult {
  written: number;
  updated: number;
  /** Rows the database rejected (e.g. out-of-range value). Isolated, not fatal. */
  failed: { payload: unknown; error: string }[];
}

/**
 * Idempotent upsert keyed on (source, external_id). Re-running a sync never
 * inflates revenue; a corrected record updates in place rather than duplicating.
 * The `xmax = 0` trick distinguishes an insert from an update in one statement.
 *
 * Each row is isolated: a database-level failure on one row (bad value, etc.) is
 * captured and reported, and the rest of the batch still commits. (Each statement
 * autocommits, so one rejection does not poison the others.)
 */
export async function upsertTransactions(
  db: Db,
  rows: CanonicalTransaction[],
): Promise<UpsertResult> {
  let written = 0;
  let updated = 0;
  const failed: UpsertResult['failed'] = [];
  for (const r of rows) {
    try {
      const result = await db<{ inserted: boolean }[]>`
        insert into transactions
          (source, external_id, raw_status, amount_minor, currency, occurred_at, raw)
        values
          (${r.source}, ${r.externalId}, ${r.rawStatus}, ${r.amountMinor.toString()}::bigint,
           ${r.currency}, ${r.occurredAt}, ${db.json(r.raw as never)})
        on conflict (source, external_id) do update set
          raw_status   = excluded.raw_status,
          amount_minor = excluded.amount_minor,
          currency     = excluded.currency,
          occurred_at  = excluded.occurred_at,
          raw          = excluded.raw
        returning (xmax = 0) as inserted
      `;
      if (result[0]?.inserted) written++;
      else updated++;
    } catch (e) {
      failed.push({ payload: r.raw ?? r, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { written, updated, failed };
}

/** Record a record that failed validation, so the batch can continue past it. */
export async function quarantine(
  db: Db,
  source: string,
  payload: unknown,
  error: string,
): Promise<void> {
  await db`
    insert into ingest_quarantine (source, payload, error)
    values (${source}, ${db.json(payload as never)}, ${error})
  `;
}
