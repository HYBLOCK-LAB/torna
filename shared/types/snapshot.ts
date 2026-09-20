/**
 * Torna — snapshot schema
 *
 * A snapshot is the COMPLETE state at one timepoint, not a delta.
 * Selecting a timepoint replaces the whole state, which is why the demo
 * can be viewed in any order.
 *
 * Owner: A(서진) (frontend). B(민서) and C(민재) must produce files matching this shape.
 * Verify with: pnpm verify:bundle <folder>
 *
 * Amounts are USDC units (numbers), NOT 6-decimal integers.
 * On-chain values are converted once, in the adapter.
 */

export type TimepointId =
  | 't0' | 't1' | 't2' | 't3' | 't3b' | 't4'
  | 't5' | 't6' | 't7' | 't8' | 't9' | 't9b';

export const TIMEPOINT_ORDER: readonly TimepointId[] = [
  't0', 't1', 't2', 't3', 't3b', 't4', 't5', 't6', 't7', 't8', 't9', 't9b',
] as const;

/** Position lifecycle. Spelling must match the contract enum and the DB column. */
export type PositionState =
  | 'Registered'
  | 'Advanced'
  | 'Repaid'
  | 'Overdue'
  | 'Review'
  | 'CoveredLoss'
  | 'CapHeld'
  | 'RecoveryRecorded';

/** Issuer lifecycle. Collateral at zero means Suspended. */
export type IssuerState = 'Active' | 'MarginCall' | 'Suspended' | 'Deregistered';

export interface Bilingual {
  en: string;
  ko: string;
}

export interface PoolState {
  /** Principal deposited by LPs. */
  lpDeposits: number;
  /** Fees accrued to LPs since inception. */
  lpFeeAccrued: number;
  /** Losses charged to LPs since inception. */
  lpLossApplied: number;
  /** lpDeposits + lpFeeAccrued - lpLossApplied */
  netAssetValue: number;
  /** Principal currently advanced and not yet repaid. */
  advancedOutstanding: number;
  /** netAssetValue - advancedOutstanding - externalDeployed */
  cashAvailable: number;
  /** Protocol reserve available to absorb loss. */
  reserve: number;
  /** Reserve consumed since inception. */
  reserveUsed: number;
  /** Amount held above the single-event cap, awaiting recovery. */
  capHeld: number;
  /** Idle funds placed with an external venue. */
  externalDeployed: number;
  externalFrozen: boolean;
  /** Protocol fee accrued. */
  protocolFee: number;
}

export interface IssuerSnapshot {
  key: string;
  /** Registered on chain by registerIssuer(). */
  name: string;
  /** keccak256(acquirerId). Resolve through the label map. */
  acquirerHash: string;
  collateralInitial: number;
  collateralRemaining: number;
  outstanding: number;
  /** min(collateral / 15% * rampFactor, poolCapacity * max(40%, 1/issuerCount)) */
  effectiveLimit: number;
  rampUp: boolean;
  state: IssuerState;
}

export interface LiquidityProviderSnapshot {
  name: string;
  deposit: number;
  sharePct: number;
}

export interface PositionSnapshot {
  /**
   * keccak256(refundId). The chain stores ONLY this — the readable refund id
   * lives in the DB, so resolve it through the label map.
   */
  refundKey: string;
  /** Issuer key as registered on chain. */
  issuer: string;
  /** keccak256(acquirerId). Resolve through the label map. */
  acquirerHash: string;
  amount: number;
  fee: number;
  /** Issuer's first-loss share (20% of amount). */
  issuerMargin: number;
  /** Pool's exposure (amount - issuerMargin). */
  poolCoverage: number;
  state: PositionState;
  evidence: string | null;
  txHash: string;
  /** Sequence index of the timepoint that created this position. */
  createdAtTimepoint: number;
}

export interface Metrics {
  cumulativeCount: number;
  cumulativeAdvanced: number;
  lossTotal: number;
  lossRatePct: number;
  repayRatePct: number;
  utilizationPct: number;
  acquirerTopExposure: number;
  acquirerExposureLimit: number;
  lpDepositCap: number;
  rejectedRequests: number;
}

export interface EventLogEntry {
  blockNumber: number;
  name: string;
  target: string;
  amount: number;
  txHash: string;
  /**
   * Sequence index of the timepoint that emitted this event. Optional: the
   * chain does not carry it, so a dump that cannot resolve it simply omits it
   * and the row renders without a scenario tag.
   */
  timepointSeq?: number;
}

export interface Snapshot {
  schemaVersion: 1;
  /** Every snapshot in one bundle MUST carry the same runId. */
  runId: string;
  timepointId: TimepointId;
  /** Position in TIMEPOINT_ORDER. */
  seq: number;
  label: Bilingual;
  chainId: number;
  contract: string;
  blockNumber: number;
  capturedAt: string;
  amountUnit: 'USDC';
  note?: string;
  pool: PoolState;
  issuers: IssuerSnapshot[];
  liquidityProviders: LiquidityProviderSnapshot[];
  positions: PositionSnapshot[];
  metrics: Metrics;
  events: EventLogEntry[];
}

export interface BundleManifest {
  schemaVersion: 1;
  runId: string;
  generatedAt: string;
  source: string;
  timepoints: Array<{
    timepointId: TimepointId;
    seq: number;
    label: Bilingual;
    file: string;
  }>;
}

/**
 * Hash -> human readable label.
 *
 * The chain stores only keccak256 hashes, so the issuer console and the
 * verifier screen cannot render a refund id or an acquirer name without this.
 * Dumped once per run from the card issuer DB by C(민재), NOT per timepoint.
 *
 * The public view deliberately keeps showing hashes: which issuer is exposed
 * is not disclosed there.
 *
 * Every refundKey and acquirerHash that appears in the bundle must have an
 * entry here. `pnpm verify:bundle` enforces that.
 */
export interface LabelMap {
  runId: string;
  note?: string;
  /** keccak256(refundId) -> refund */
  refunds: Record<string, {
    refundId: string;
    amountUsdc: number;
    confirmedAt?: string;
  }>;
  /** keccak256(acquirerId) -> acquirer */
  acquirers: Record<string, {
    acquirerId: string;
    displayName: string;
  }>;
  /** issuer key -> display info that is not on chain */
  issuers: Record<string, {
    name: string;
    region: string;
  }>;
}
