/**
 * Money is stored and summed as integer minor units (paise, cents) in `bigint`.
 * Floating point is never used: `parseFloat('1250.50') * 100` is 125049.999… on
 * some inputs, and that is exactly the class of bug this service is built to
 * prevent. All conversions here are string/BigInt only.
 */

/**
 * Convert a decimal amount given as a STRING (e.g. "1250.50") to minor units
 * (e.g. 125050n) for a currency with `exponent` fractional digits (2 for
 * INR/USD). More fractional digits than the exponent is rejected rather than
 * silently rounded.
 */
export function decimalStringToMinor(amount: string, exponent = 2): bigint {
  const trimmed = amount.trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    throw new Error(`not a decimal amount: "${amount}"`);
  }
  const sign = match[1] ? -1n : 1n;
  const whole = match[2] ?? '0';
  const frac = match[3] ?? '';
  if (frac.length > exponent) {
    throw new Error(
      `amount "${amount}" has more than ${exponent} fractional digits; refusing to round`,
    );
  }
  const fracPadded = frac.padEnd(exponent, '0');
  return sign * BigInt(whole + fracPadded);
}

/**
 * Pass through an amount that is already in integer minor units (e.g. Stripe's
 * `amount` field). Rejects non-integers AND numbers outside the safe-integer
 * range (JSON.parse can silently round a huge integer), so a float or a rounded
 * value can never sneak in.
 */
export function integerToMinor(n: number | bigint): bigint {
  if (typeof n === 'bigint') return n;
  if (!Number.isSafeInteger(n)) {
    throw new Error(`expected a safe integer minor amount, got ${n}`);
  }
  return BigInt(n);
}

/**
 * ISO-4217 minor-unit digits by currency. Most currencies use 2; a handful use
 * 0 or 3. Defaults to 2 for unlisted codes (correct for the common case).
 */
const MINOR_UNIT_DIGITS: Record<string, number> = {
  JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, XOF: 0, XAF: 0, XPF: 0,
  BHD: 3, KWD: 3, OMR: 3, TND: 3, JOD: 3, IQD: 3,
};

/** Number of minor-unit digits for a currency (2 unless it is a known exception). */
export function currencyExponent(currency: string): number {
  return MINOR_UNIT_DIGITS[currency.toUpperCase()] ?? 2;
}
