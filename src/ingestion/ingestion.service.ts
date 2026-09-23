import type { Db } from '../shared/db/client';
import { logger } from '../shared/logger';
import type { SourceAdapter } from './ingestion.types';
import * as repo from './ingestion.repository';
import { legacyErpAdapter } from '../sources/legacy-erp/legacy-erp.service';
import { stripeAdapter } from '../sources/stripe/stripe.service';
import { razorpayAdapter } from '../sources/razorpay/razorpay.service';

/** Every source the system knows about. */
export const ALL_ADAPTERS: SourceAdapter[] = [legacyErpAdapter, stripeAdapter, razorpayAdapter];

export interface SourceOutcome {
  source: string;
  status: 'ok' | 'skipped' | 'failed';
  written: number;
  updated: number;
  quarantined: number;
  durationMs: number;
  error?: string;
}

/**
 * Run each source in turn, isolating failures: one source throwing (bad key,
 * network, missing file) never prevents the others from completing. Returns a
 * per-source outcome so the caller can see exactly what happened.
 */
export async function runIngestion(
  db: Db,
  adapters: SourceAdapter[] = ALL_ADAPTERS,
): Promise<SourceOutcome[]> {
  const outcomes: SourceOutcome[] = [];

  for (const adapter of adapters) {
    const start = Date.now();

    if (!adapter.isConfigured()) {
      outcomes.push({
        source: adapter.name,
        status: 'skipped',
        written: 0,
        updated: 0,
        quarantined: 0,
        durationMs: Date.now() - start,
        error: 'not configured (no credentials)',
      });
      continue;
    }

    try {
      const { valid, invalid } = await adapter.fetch();
      const counts = await repo.upsertTransactions(db, valid);
      // Both validation rejects and DB-level rejects go to quarantine. Quarantine
      // is best-effort: a failed quarantine insert is logged, never fatal, so it
      // cannot mask work already committed.
      const rejects = [...invalid, ...counts.failed];
      for (const bad of rejects) {
        try {
          await repo.quarantine(db, adapter.name, bad.payload, bad.error);
        } catch (qe) {
          logger.error('quarantine write failed', {
            source: adapter.name,
            error: qe instanceof Error ? qe.message : String(qe),
          });
        }
      }
      const outcome: SourceOutcome = {
        source: adapter.name,
        status: 'ok',
        written: counts.written,
        updated: counts.updated,
        quarantined: rejects.length,
        durationMs: Date.now() - start,
      };
      logger.info('ingest source complete', { ...outcome });
      outcomes.push(outcome);
    } catch (e) {
      const outcome: SourceOutcome = {
        source: adapter.name,
        status: 'failed',
        written: 0,
        updated: 0,
        quarantined: 0,
        durationMs: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      };
      logger.error('ingest source failed', { ...outcome });
      outcomes.push(outcome); // isolate: continue with the next source
    }
  }

  return outcomes;
}
