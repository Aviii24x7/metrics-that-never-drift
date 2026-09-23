/**
 * Application errors carry an HTTP status and a stable machine-readable code so
 * the error handler can translate any thrown error into a consistent response.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** 400 — the caller sent something invalid. */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'validation_error', details);
  }
}

/** 400 — a date range or timezone could not be resolved. */
export class RangeParseError extends ValidationError {
  constructor(message: string) {
    super(message);
  }
}

/** 503 — the database was unreachable or a query failed. */
export class DatabaseError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 503, 'database_error', details);
  }
}
