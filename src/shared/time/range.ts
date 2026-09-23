import { DateTime, IANAZone } from 'luxon';
import { RangeParseError } from '../errors/app-error';

/** True if `tz` is a valid IANA timezone name (e.g. "Asia/Kolkata", "UTC"). */
export function isValidTimeZone(tz: string): boolean {
  return IANAZone.isValidZone(tz);
}

export interface ResolvedRange {
  /** Absolute instant, inclusive. */
  from: Date;
  /** Absolute instant, exclusive. */
  to: Date;
  /** The IANA timezone the range and all bucketing are evaluated in. */
  tz: string;
}

/**
 * Resolve one ISO value into an absolute instant.
 *
 * - A bare date ("2026-01-01") is read as LOCAL MIDNIGHT in `tz`.
 * - A datetime with an explicit offset ("2026-01-01T00:00:00+05:30") keeps that
 *   offset; the resulting instant is correct regardless of `tz`.
 * - A datetime without an offset is interpreted as wall-clock time in `tz`.
 */
export function resolveInstant(value: string, tz: string): Date {
  const dt = DateTime.fromISO(value.trim(), { zone: tz });
  if (!dt.isValid) {
    throw new RangeParseError(`invalid date/time "${value}": ${dt.invalidReason ?? 'unparseable'}`);
  }
  return dt.toJSDate();
}

/**
 * Resolve a half-open range [from, to) in a timezone. Both endpoints of every
 * query in this service go through here, so the two views cannot interpret a
 * range differently.
 */
export function resolveRange(fromRaw: string, toRaw: string, tz: string): ResolvedRange {
  if (!isValidTimeZone(tz)) {
    throw new RangeParseError(`unknown timezone: "${tz}"`);
  }
  const from = resolveInstant(fromRaw, tz);
  const to = resolveInstant(toRaw, tz);
  if (to.getTime() <= from.getTime()) {
    throw new RangeParseError('`to` must be strictly after `from` (the range is half-open [from, to))');
  }
  return { from, to, tz };
}
