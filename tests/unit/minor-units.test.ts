import { describe, it, expect } from 'vitest';
import {
  currencyExponent,
  decimalStringToMinor,
  integerToMinor,
} from '../../src/shared/money/minor-units';

describe('decimalStringToMinor (no floating point, ever)', () => {
  it('converts common decimals exactly', () => {
    expect(decimalStringToMinor('1250.50')).toBe(125050n);
    expect(decimalStringToMinor('1250.5')).toBe(125050n);
    expect(decimalStringToMinor('1250')).toBe(125000n);
    expect(decimalStringToMinor('0.05')).toBe(5n);
    expect(decimalStringToMinor('0')).toBe(0n);
    expect(decimalStringToMinor('9999.99')).toBe(999999n);
  });

  it('does NOT lose precision the way parseFloat would', () => {
    // parseFloat('1250.50') * 100 === 125049.99999999999; ours is exact.
    expect(decimalStringToMinor('1250.50')).toBe(125050n);
  });

  it('refuses to silently round more precision than the currency allows', () => {
    expect(() => decimalStringToMinor('1250.999')).toThrow(/fractional digits/);
  });

  it('rejects non-numeric input', () => {
    expect(() => decimalStringToMinor('abc')).toThrow();
    expect(() => decimalStringToMinor('')).toThrow();
  });
});

describe('integerToMinor', () => {
  it('passes through integer minor units', () => {
    expect(integerToMinor(100000)).toBe(100000n);
    expect(integerToMinor(0)).toBe(0n);
    expect(integerToMinor(42n)).toBe(42n);
  });

  it('rejects a non-integer (a float must never sneak in)', () => {
    expect(() => integerToMinor(1.5)).toThrow(/integer/);
  });

  it('rejects an unsafe (silently-rounded) integer', () => {
    expect(() => integerToMinor(90071992547409910)).toThrow(/safe integer/);
  });
});

describe('currencyExponent', () => {
  it('defaults to 2 for common currencies', () => {
    expect(currencyExponent('INR')).toBe(2);
    expect(currencyExponent('USD')).toBe(2);
    expect(currencyExponent('eur')).toBe(2);
  });

  it('knows the 0- and 3-decimal exceptions', () => {
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('KWD')).toBe(3);
  });

  it('scales a decimal correctly for a 0-decimal currency', () => {
    expect(decimalStringToMinor('5000', currencyExponent('JPY'))).toBe(5000n); // not 500000n
  });
});
