/**
 * Maturity for an AdvanceRequest.
 *
 * Team decision (2026-09-22, Seojin): count from CHAIN TIME, not confirmed_at.
 * The one-year seed is replayed now rather than uploaded as history, and the
 * contract reverts a non-future maturity, so confirmed_at can never produce a
 * usable maturity. confirmed_at stays in the DB as the card-ledger record.
 *
 * Scenario refunds that must mature during the run (t1/t2 review, t3 correlated
 * loss, t5 late repayment) carry refunds.maturity_override_seconds (120), so the
 * runner can wait out the maturity instead of an admin forcing the state.
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

/**
 * chain time + 5 business days, or chain time + overrideSeconds when the
 * refund row sets one. Always strictly in the future.
 */
export function computeMaturity(chainNow: bigint, overrideSeconds?: number | null): bigint {
  if (overrideSeconds === undefined || overrideSeconds === null) {
    return addBusinessDays(chainNow, BUSINESS_DAYS_TO_MATURITY);
  }
  if (!Number.isInteger(overrideSeconds) || overrideSeconds <= 0) {
    throw new RangeError(`maturity_override_seconds must be a positive integer, got ${overrideSeconds}`);
  }
  return chainNow + BigInt(overrideSeconds);
}
