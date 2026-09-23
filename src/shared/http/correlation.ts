import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

/**
 * Assign a correlation id to every request (reusing an inbound
 * `x-correlation-id` if present) and echo it on the response. Errors are logged
 * and returned with this id so a failure can be traced without a stack trace.
 */
export function correlation(req: Request, res: Response, next: NextFunction): void {
  const id = req.header('x-correlation-id') || randomUUID();
  req.correlationId = id;
  res.setHeader('x-correlation-id', id);
  next();
}
