import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error';
import { logger } from '../logger';

/** 404 for unmatched routes. */
export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'not_found', message: `no route for ${req.method} ${req.path}` },
    correlationId: req.correlationId,
  });
}

/**
 * Central error handler. Translates known errors into consistent JSON. Never
 * leaks a stack trace to the client; 5xx errors are logged with the correlation
 * id so they can be traced.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const correlationId = req.correlationId;

  if (err instanceof ZodError) {
    logger.warn('validation error', { correlationId, issues: err.issues });
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'invalid request parameters',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      correlationId,
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error(err.message, { correlationId, code: err.code, stack: err.stack });
    } else {
      logger.warn(err.message, { correlationId, code: err.code });
    }
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
      correlationId,
    });
    return;
  }

  logger.error('unhandled error', {
    correlationId,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  res.status(500).json({
    error: { code: 'internal_error', message: 'internal server error' },
    correlationId,
  });
}
