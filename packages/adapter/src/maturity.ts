/**
 * Maturity for an AdvanceRequest.
 *
 * Spec 10.6: maturity = confirmed_at + 5 business days.
 * Contract: a non-future maturity REVERTS (shared/abi/README.md, advance submission).
 *
 * ASSUMPTION (pending Minseo's answer, 2026-09-22): the one-year seed has
 * confirmed_at in 2025, so confirmed_at + 5 business days is in the past for
 * almost every refund. We therefore count 5 business days from
 * max(confirmed_at, chain time). For a fresh refund this equals the spec rule;
 * for a historical one it matches the t0 runner, which uses chain time.
 */
export const BUSINESS_DAYS_TO_MATURITY = 5;
const DAY = 86_400n;

/** Add N business days (Mon-Fri, UTC; public holidays ignored). */
export function addBusinessDays(unixSeconds: bigint, days: number = BUSINESS_DAYS_TO_MATURITY): bigint {
  if (!Number.isInteger(days) || days < 0) throw new RangeError('days must be a non-negative integer');
  let t = unixSeconds;
  let left = days;
  while (left > 0) {
    t += DAY;
    const weekday = new Date(Number(t) * 1000).getUTCDay(); // 0 Sun .. 6 Sat
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return t;
}

export function toUnixSeconds(value: Date | string): bigint {
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) throw new RangeError(`Invalid timestamp: ${String(value)}`);
  return BigInt(Math.floor(ms / 1000));
}

export function computeMaturity(confirmedAt: Date | string, chainNow: bigint): bigint {
  const confirmed = toUnixSeconds(confirmedAt);
  const base = confirmed > chainNow ? confirmed : chainNow;
  return addBusinessDays(base, BUSINESS_DAYS_TO_MATURITY);
}
