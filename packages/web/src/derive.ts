/**
 * Torna — every figure the front end computes.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 * When the real bundle lands and a number looks wrong, the first question is
 * "did the chain produce this, or did we?". That question has to be answerable
 * in one place. Everything in this file is ours; everything else on screen came
 * out of a snapshot untouched.
 *
 * ── The rule ──────────────────────────────────────────────────────────────
 * The front end MUST NOT recompute a value the chain already produced. Net
 * asset value, loss rate, utilisation, every limit — those are in the snapshot
 * and are used as they are. Recomputing one creates a second answer, and when
 * the two disagree nobody can say which is right.
 *
 * What is allowed here is only:
 *   · ARRANGEMENT — splitting snapshot values into buckets for a chart,
 *   · SUMMING — adding snapshot values that are already final,
 *   · RATIOS against a frozen protocol parameter.
 *
 * Every function below states which of the three it is. If a new one cannot
 * say, it does not belong here — it belongs in the snapshot, and B(민서) has to
 * produce it.
 *
 * Owner: A(서진)
 */

import type { Snapshot } from '@shared/types/snapshot';
import { PARAMS } from '@shared/params';

/* ── pool ────────────────────────────────────────────────────── */

/**
 * SUMMING. Everything a member has at stake: LP net asset value, the protocol
 * reserve, and collateral still posted by issuers. All three are snapshot
 * fields; this only adds them.
 */
export function totalValueLocked(s: Snapshot): number {
  const collateral = s.issuers.reduce((a, i) => a + i.collateralRemaining, 0);
  return s.pool.netAssetValue + s.pool.reserve + collateral;
}

/**
 * SUMMING. The reserve accrued since launch = what is left, plus what has been
 * spent, less the seed it started with. `reserveSeed` is a frozen parameter,
 * not a measurement.
 */
export function reserveAccrued(s: Snapshot): number {
  return Math.max(0, s.pool.reserve + s.pool.reserveUsed - PARAMS.reserveSeed);
}

/**
 * ARRANGEMENT. Confirmed loss is carried by three layers, and the snapshot
 * carries the last two outright. The issuer margin share is therefore the
 * remainder — not a recomputation, an identity:
 *   lossTotal = issuerMargin + reserveUsed + lpLossApplied
 */
export function marginAbsorbed(s: Snapshot): number {
  return Math.max(0, s.metrics.lossTotal - s.pool.reserveUsed - s.pool.lpLossApplied);
}

/* ── withdrawal ──────────────────────────────────────────────── */

export interface WithdrawalSplit {
  /** Payable at once. */
  instant: number;
  /** Owed, waiting for advances to come back. */
  queued: number;
  /** Frozen behind a position still awaiting a ruling. */
  locked: number;
  /** Pool exposure of everything under review, before the reserve absorbs. */
  reviewCoverage: number;
}

/**
 * ARRANGEMENT. Splits LP net asset value into three buckets for the withdrawal
 * panel. No new money is created — the three add back up to netAssetValue.
 *
 * Positions awaiting a ruling expose the pool by their poolCoverage. The
 * reserve absorbs first, so only the part above the reserve can ever reach an
 * LP's withdrawal, and only that part is locked.
 */
export function withdrawalSplit(s: Snapshot): WithdrawalSplit {
  const underReview = s.positions.filter((p) => p.state === 'Review' || p.state === 'CapHeld');
  const reviewCoverage = underReview.reduce((a, p) => a + p.poolCoverage, 0);
  const locked = Math.max(0, reviewCoverage - s.pool.reserve);
  const free = Math.max(0, s.pool.netAssetValue - locked);
  const instant = Math.max(0, Math.min(s.pool.cashAvailable, free));
  return { instant, queued: Math.max(0, free - instant), locked, reviewCoverage };
}

/* ── issuer ──────────────────────────────────────────────────── */

export interface IssuerMargin {
  /** Collateral the open positions require at the protocol's collateral ratio. */
  required: number;
  /** required ÷ collateral remaining, as a percentage. Above 100 is a shortfall. */
  usagePct: number;
  /** How much more this issuer could still advance. */
  headroom: number;
  /** Collateral not pledged against an open position. */
  free: number;
}

/**
 * RATIO against a frozen parameter. `outstanding`, `collateralRemaining` and
 * `effectiveLimit` all come from the chain; the collateral ratio is a contract
 * constant mirrored in params.ts.
 */
export function issuerMargin(
  issuer: { outstanding: number; collateralRemaining: number; effectiveLimit: number },
): IssuerMargin {
  const required = issuer.outstanding * (PARAMS.issuerCollateralPct / 100);
  return {
    required,
    usagePct: issuer.collateralRemaining > 0 ? (required / issuer.collateralRemaining) * 100 : 0,
    headroom: Math.max(0, issuer.effectiveLimit - issuer.outstanding),
    free: Math.max(0, issuer.collateralRemaining - required),
  };
}

/**
 * RATIO against a frozen parameter. Which constraint is actually binding this
 * issuer's limit — its own collateral, or its share of the pool. The mockup
 * marked this, and it is the whole point of timepoint 9: five issuers with
 * different collateral all hit the same ceiling because the pool is thin.
 */
export function limitBoundByPool(
  issuer: { collateralRemaining: number; effectiveLimit: number },
): boolean {
  const fromCollateral = issuer.collateralRemaining / (PARAMS.issuerCollateralPct / 100);
  return issuer.effectiveLimit < fromCollateral - 0.5;
}

/* ── concentration ───────────────────────────────────────────── */

/**
 * RATIO. The largest acquirer's share of outstanding. Both figures are snapshot
 * fields. This is a spread indicator shown to the public, never a limit — the
 * enforced limit is `metrics.acquirerExposureLimit`, an amount, and it is used
 * as it is.
 */
export function acquirerConcentrationPct(s: Snapshot): number {
  if (s.pool.advancedOutstanding <= 0) return 0;
  return (s.metrics.acquirerTopExposure / s.pool.advancedOutstanding) * 100;
}

/**
 * SUMMING. Deposit headroom against the cap the chain reports.
 */
export function lpDepositRoom(s: Snapshot): number {
  return Math.max(0, s.metrics.lpDepositCap - s.pool.lpDeposits);
}

/* ── the year before the demo ─────────────────────────────────── */

export interface YearOne {
  /** Refunds handled in that year, excluding the cardholder run. */
  count: number;
  /** Fee charged across the year, all three shares together. */
  feeTotal: number;
  lpShare: number;
  reserveShare: number;
  protocolShare: number;
  /** LP share against LP deposits — one year, so this is already annual. */
  annualPct: number;
  /** Of those refunds, the ones that closed: the year minus what is still under review. */
  closed: number;
}

/**
 * ARRANGEMENT. The "one year, assumed" panel is about a fixed stretch of
 * history, not about wherever the viewer currently is. It is t1 minus t0: t1
 * holds the year plus the cardholder run, t0 holds the run alone, so the
 * difference is the year by itself. Nothing is recomputed — every term is a
 * snapshot field, and when the real dump lands these figures follow it.
 */
export function yearOne(t0: Snapshot, t1: Snapshot): YearOne {
  const count = t1.metrics.cumulativeCount - t0.metrics.cumulativeCount;
  const lpShare = t1.pool.lpFeeAccrued - t0.pool.lpFeeAccrued;
  const reserveShare = t1.pool.reserve - t0.pool.reserve;
  const protocolShare = t1.pool.protocolFee - t0.pool.protocolFee;
  const stillOpen = t1.positions.filter((p) => p.state === 'Review' || p.state === 'Overdue').length;
  return {
    count,
    closed: Math.max(0, count - stillOpen),
    feeTotal: lpShare + reserveShare + protocolShare,
    lpShare,
    reserveShare,
    protocolShare,
    annualPct: t1.pool.lpDeposits > 0 ? (lpShare / t1.pool.lpDeposits) * 100 : 0,
  };
}

/**
 * SUMMING. What an LP is up or down overall: fees earned less losses borne.
 * Negative means the incidents have outrun the income so far.
 */
export function lpNetResult(s: Snapshot): number {
  return s.pool.lpFeeAccrued - s.pool.lpLossApplied;
}

/**
 * RATIO. The ceiling a brand-new issuer would open at — it posts no collateral
 * yet, so only the pool-side constraint applies. Same expression the snapshot
 * uses for an existing issuer's pool-bound limit: pool capacity times the
 * larger of the concentration cap and an equal share.
 */
export function newIssuerCap(s: Snapshot): number {
  const poolCapacity = Math.max(0, s.pool.netAssetValue - s.pool.externalDeployed);
  const share = Math.max(PARAMS.issuerConcentrationPct / 100, 1 / Math.max(1, s.issuers.length));
  return poolCapacity * share;
}

/* ── one LP's withdrawal ─────────────────────────────────────── */

export interface LpWithdrawal {
  /** Everything that LP owns: its share of net asset value. */
  equity: number;
  /** Paid at once — its share of the cash actually in the contract. */
  instant: number;
  /** The rest, which waits for advances to mature. */
  queued: number;
}

/**
 * RATIO. An exiting LP is paid its share, and the cash on hand is what caps
 * the immediate part — paying the first LP out of everyone else's money is the
 * failure this rule exists to prevent. Both terms are snapshot fields; the only
 * arithmetic is the share.
 */
export function lpWithdrawal(s: Snapshot, name: string): LpWithdrawal | null {
  const lp = s.liquidityProviders.find((l) => l.name === name);
  if (!lp) return null;
  const share = lp.sharePct / 100;
  const equity = s.pool.netAssetValue * share;
  const instant = Math.min(equity, s.pool.cashAvailable * share);
  return { equity, instant, queued: Math.max(0, equity - instant) };
}

/* ── one correlated-loss event, settled ──────────────────────── */

export interface RecoverySettlement {
  /** Principal that went out through the acquirer that stopped settling. */
  principal: number;
  /** What came back, months later. */
  recovered: number;
  recoveredPct: number;
  /** Principal that never came back. */
  finalLoss: number;
  /** The part of it the issuer's posted collateral actually paid. */
  collateralBorne: number;
  /** The remainder, which the pool carries. */
  poolBorne: number;
  /** Over-recognised loss handed back to LP senior. */
  lpRestored: number;
  /** Over-recognised loss handed back to the reserve, if anything is left. */
  reserveRestored: number;
}

/**
 * ARRANGEMENT + SUMMING. Nothing here re-rules the event. `principal` and
 * `recovered` are read off the event log as the chain wrote them, the final
 * loss is their difference, the collateral share is how much of the issuer's
 * posted collateral is gone, and the pool carries the rest. The two restored
 * figures are how far the over-recognised loss was wound back between the two
 * snapshots. `recoveredPct` is the single ratio, recovered over principal.
 */
export function recoverySettlement(
  prev: Snapshot | null,
  s: Snapshot,
  issuerKey: string,
): RecoverySettlement | null {
  const amountOf = (name: string) => s.events.find((e) => e.name === name)?.amount ?? null;
  const principal = amountOf('CorrelatedExposureFlagged');
  const recovered = amountOf('RecoveryRecorded');
  if (principal === null || recovered === null) return null;

  const iss = s.issuers.find((i) => i.key === issuerKey);
  const finalLoss = Math.max(0, principal - recovered);
  const collateralBorne = iss ? Math.max(0, iss.collateralInitial - iss.collateralRemaining) : 0;

  return {
    principal,
    recovered,
    recoveredPct: principal > 0 ? (recovered / principal) * 100 : 0,
    finalLoss,
    collateralBorne,
    poolBorne: Math.max(0, finalLoss - collateralBorne),
    lpRestored: prev ? Math.max(0, prev.pool.lpLossApplied - s.pool.lpLossApplied) : 0,
    reserveRestored: prev ? Math.max(0, prev.pool.reserveUsed - s.pool.reserveUsed) : 0,
  };
}

/**
 * RATIO. The ceiling one event can recognise as confirmed loss — a frozen
 * percentage of LP deposits. Anything above it is held, not written off.
 */
export function singleEventCap(s: Snapshot): number {
  return s.pool.lpDeposits * (PARAMS.singleEventCapPct / 100);
}

/* ── how wide the pool is spread ─────────────────────────────── */

/** SUMMING. Registered issuers. */
export function issuerCount(s: Snapshot): number {
  return s.issuers.length;
}

/** SUMMING. Distinct acquirers those issuers route through. */
export function acquirerCount(s: Snapshot): number {
  return new Set(s.issuers.map((i) => i.acquirerHash)).size;
}

/**
 * RATIO against frozen parameters. The limit an issuer's OWN collateral
 * supports, after the ramp-up discount that applies in its first days. Compare
 * it with `effectiveLimit` to see whether collateral or the pool is binding.
 */
export function rampedCollateralLimit(
  issuer: { collateralRemaining: number; rampUp: boolean },
): number {
  const fromCollateral = issuer.collateralRemaining / (PARAMS.issuerCollateralPct / 100);
  return issuer.rampUp ? fromCollateral * (PARAMS.rampUpPct / 100) : fromCollateral;
}

/* ── one round of LP deposit applications ────────────────────── */

export interface DepositApplication {
  /** What this LP asked to put in. */
  requested: number;
  /** What the contract took. */
  accepted: number;
  /** What it refused, as the rejection event records it. */
  rejected: number;
}

/**
 * ARRANGEMENT. The accepted amount is this LP's deposit in the snapshot and
 * the refused amount is the logged `DepositRejected`; the request is their
 * sum. Nothing here decides anything — the contract already did.
 */
export function depositApplication(s: Snapshot, name: string): DepositApplication | null {
  const rejected = s.events.find((e) => e.name === 'DepositRejected' && e.target === name)?.amount;
  if (typeof rejected !== 'number') return null;
  const lp = s.liquidityProviders.find((l) => l.name === name);
  const accepted = lp ? lp.deposit : 0;
  return { requested: accepted + rejected, accepted, rejected };
}

/** SUMMING. Every deposit the contract refused in this round. */
export function depositRejectedTotal(s: Snapshot): number {
  return s.events
    .filter((e) => e.name === 'DepositRejected')
    .reduce((a, e) => a + e.amount, 0);
}

/** SUMMING. Everything applied for: what went in, plus what was refused. */
export function depositRequestedTotal(s: Snapshot): number {
  const accepted = s.events
    .filter((e) => e.name === 'DepositRejected')
    .reduce((a, e) => a + (s.liquidityProviders.find((l) => l.name === e.target)?.deposit ?? 0), 0);
  return accepted + depositRejectedTotal(s);
}

/** RATIO against a frozen parameter. The most one LP may hold. */
export function lpSingleCap(s: Snapshot): number {
  return s.metrics.lpDepositCap * (PARAMS.lpSingleCapPct / 100);
}

/** SUMMING. Liquidity providers in the pool. */
export function lpCount(s: Snapshot): number {
  return s.liquidityProviders.length;
}
