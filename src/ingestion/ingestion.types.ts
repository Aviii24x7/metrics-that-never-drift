/**
 * The one canonical row shape every source normalizes to. Declared here (not in
 * a source module) because it is the contract the write side shares.
 *
 * Note what is absent: there is no canonical-status or collected field. Adapters
 * map field names and amounts only; the meaning of rawStatus is assigned later,
 * at read time, by joining to status_map.
 */
export interface CanonicalTransaction {
  source: string;
  externalId: string;
  rawStatus: string;
  amountMinor: bigint;
  currency: string;
  occurredAt: Date;
  raw: unknown;
}

/** The result of pulling from one source: normalized rows plus rejects. */
export interface FetchResult {
  valid: CanonicalTransaction[];
  invalid: { payload: unknown; error: string }[];
}

export interface SourceAdapter {
  readonly name: string;
  /** Whether this source is configured to run (e.g. has API keys). */
  isConfigured(): boolean;
  /** Fetch and normalize rows from the source. May throw (isolated by the orchestrator). */
  fetch(): Promise<FetchResult>;
}
