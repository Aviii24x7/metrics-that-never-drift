/**
 * THE definition of the metric, in one place.
 *
 * This is the ONLY file in the codebase (TypeScript) permitted to name a
 * canonical status literal. The single-implementation guard test
 * (tests/guards/single-implementation.test.ts) enforces that. The allow-list is
 * passed into SQL as a parameter, so the SQL definition never hardcodes it
 * either — there is exactly one declaration of "what counts as collected".
 */

/** The closed set of canonical statuses every provider vocabulary maps onto. */
export const CANONICAL_STATUSES = ['collected', 'pending', 'failed', 'refunded', 'voided'] as const;

export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number];

/**
 * The revenue decision as a TOTAL mapping: every canonical status must be
 * explicitly marked collected (true) or not (false). Because this is a
 * `Record<CanonicalStatus, boolean>`, adding a sixth canonical status fails to
 * compile until its true/false is decided here — so the revenue-inclusion
 * decision itself is exhaustiveness-checked, not just a label.
 */
export const COLLECTED_BY_STATUS: Record<CanonicalStatus, boolean> = {
  collected: true,
  pending: false,
  failed: false,
  refunded: false,
  voided: false,
};

/**
 * The allow-list derived from that decision: the canonical statuses that count
 * as collected revenue. Anything not in this list is not revenue — including a
 * brand-new, never-before-seen status, which is the point of an allow-list.
 */
export const COLLECTED_STATUSES: readonly CanonicalStatus[] = CANONICAL_STATUSES.filter(
  (s) => COLLECTED_BY_STATUS[s],
);

/** Compile-time exhaustiveness guard: an unhandled case becomes a type error. */
export function assertNever(x: never): never {
  throw new Error(`unhandled canonical status: ${String(x)}`);
}

/**
 * A human-readable label per canonical status.
 *
 * The `switch` is exhaustive over CanonicalStatus: adding a sixth canonical
 * status makes this fail to compile until the new case is handled. That is the
 * E5-S4 tripwire — a new status cannot be half-applied.
 */
export function canonicalLabel(status: CanonicalStatus): string {
  switch (status) {
    case 'collected':
      return 'Collected';
    case 'pending':
      return 'Pending';
    case 'failed':
      return 'Failed';
    case 'refunded':
      return 'Refunded';
    case 'voided':
      return 'Voided';
    default:
      return assertNever(status);
  }
}

/** Whether a canonical status counts as collected revenue. */
export function isCollected(status: CanonicalStatus): boolean {
  return COLLECTED_BY_STATUS[status];
}

/**
 * Human-readable statement of the rule, built from the allow-list so no literal
 * needs to be repeated elsewhere. Surfaced in every API response's `definition`
 * field so a screenshot is self-describing.
 */
export const DEFINITION_LABEL =
  `collected revenue = sum(amount_minor) grouped by currency, over transactions ` +
  `whose (source, raw_status) maps to a canonical status in ` +
  `{${COLLECTED_STATUSES.join(', ')}}, with occurred_at in [from, to) evaluated in the caller's timezone`;
