import type { Request, Response, NextFunction } from 'express';
import { sql } from '../shared/db/client';
import { resolveRange } from '../shared/time/range';
import { AppError, DatabaseError } from '../shared/errors/app-error';
import { BreakdownQuery, SummaryQuery } from './metrics.schema';
import { DEFINITION_LABEL } from './metrics.definition';
import * as service from './metrics.service';

/** Run a database call, mapping unexpected failures to a 503 (never a stack trace). */
async function runDb<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new DatabaseError('database query failed', {
      cause: e instanceof Error ? e.message : String(e),
    });
  }
}

/** GET /metrics/revenue/summary — one total per currency, folded from the breakdown. */
export async function summary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = SummaryQuery.parse(req.query); // ZodError -> 400
    const range = resolveRange(q.from, q.to, q.tz); // RangeParseError -> 400
    const result = await runDb(() => service.getSummary(sql, range, q.currency));
    res.json({
      range: { from: range.from.toISOString(), to: range.to.toISOString(), tz: range.tz },
      definition: DEFINITION_LABEL,
      totals: result.totals,
      unclassified: result.unclassified,
    });
  } catch (e) {
    next(e);
  }
}

/** GET /metrics/revenue/breakdown — one entry per bucket per currency. */
export async function breakdown(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = BreakdownQuery.parse(req.query);
    const range = resolveRange(q.from, q.to, q.tz);
    const result = await runDb(() => service.getBreakdown(sql, range, q.bucket, q.currency));
    res.json({
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        tz: range.tz,
        bucket: q.bucket,
      },
      definition: DEFINITION_LABEL,
      buckets: result.buckets,
      unclassified: result.unclassified,
    });
  } catch (e) {
    next(e);
  }
}
