import type { Request, Response, NextFunction } from 'express';
import { sql } from '../shared/db/client';
import { AppError, DatabaseError, ValidationError } from '../shared/errors/app-error';
import { ALL_ADAPTERS, runIngestion, type SourceOutcome } from './ingestion.service';

function summarize(outcomes: SourceOutcome[]) {
  return outcomes.reduce(
    (acc, o) => ({
      written: acc.written + o.written,
      updated: acc.updated + o.updated,
      quarantined: acc.quarantined + o.quarantined,
      failed: acc.failed + (o.status === 'failed' ? 1 : 0),
    }),
    { written: 0, updated: 0, quarantined: 0, failed: 0 },
  );
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new DatabaseError('ingestion failed', {
      cause: e instanceof Error ? e.message : String(e),
    });
  }
}

/** POST /ingest/run — run every configured source, fault-isolated. */
export async function runAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sources = await run(() => runIngestion(sql));
    res.json({ ranAt: new Date().toISOString(), totals: summarize(sources), sources });
  } catch (e) {
    next(e);
  }
}

/** POST /sources/:source/sync — run one source. */
export async function syncOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const name = req.params.source;
    const adapter = ALL_ADAPTERS.find((a) => a.name === name);
    if (!adapter) {
      throw new ValidationError(
        `unknown source "${name}"; known sources: ${ALL_ADAPTERS.map((a) => a.name).join(', ')}`,
      );
    }
    const sources = await run(() => runIngestion(sql, [adapter]));
    res.json({ ranAt: new Date().toISOString(), totals: summarize(sources), sources });
  } catch (e) {
    next(e);
  }
}
