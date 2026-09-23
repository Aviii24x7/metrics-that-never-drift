import { describe, it, expect } from 'vitest';
import {
  CANONICAL_STATUSES,
  COLLECTED_STATUSES,
  assertNever,
  canonicalLabel,
  isCollected,
  DEFINITION_LABEL,
} from '../../src/metrics/metrics.definition';

describe('metrics.definition (the single source of truth)', () => {
  it('the allow-list is exactly ["collected"]', () => {
    expect([...COLLECTED_STATUSES]).toEqual(['collected']);
  });

  it('there are five canonical statuses', () => {
    expect(CANONICAL_STATUSES).toHaveLength(5);
    expect(new Set(CANONICAL_STATUSES)).toEqual(
      new Set(['collected', 'pending', 'failed', 'refunded', 'voided']),
    );
  });

  it('isCollected is true only for the allow-listed status', () => {
    expect(isCollected('collected')).toBe(true);
    for (const s of ['pending', 'failed', 'refunded', 'voided'] as const) {
      expect(isCollected(s)).toBe(false);
    }
  });

  it('canonicalLabel is exhaustive over every canonical status', () => {
    for (const s of CANONICAL_STATUSES) {
      expect(canonicalLabel(s)).toMatch(/^[A-Z]/);
    }
  });

  it('assertNever throws when reached at runtime', () => {
    expect(() => assertNever('surprise' as never)).toThrow(/unhandled canonical status/);
  });

  it('the definition label names the allow-list', () => {
    expect(DEFINITION_LABEL).toContain('{collected}');
  });
});
