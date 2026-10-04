/**
 * Snapshot bundle loader.
 *
 * A snapshot is the COMPLETE state at one timepoint. Selecting a timepoint
 * REPLACES the state — it never applies a delta on top of the previous one.
 * That is what makes the demo safe to view in any order.
 *
 * Swap `BUNDLE_DIR` from 'sample' to the real run folder once B(민서) has produced it.
 */

import type { Snapshot, BundleManifest, TimepointId, LabelMap } from '@shared/types/snapshot';
import { TIMEPOINT_ORDER } from '@shared/types/snapshot';

/**
 * The run the demo reads. `sample` is the hand-built bundle used while the
 * contract was being written; `run-testnet-20261001-a` is the real Monad
 * Testnet run — one deployment, 13 timepoints, 806 events, produced by
 * B(민서) and verified against the acceptance table in PROJECT_SPEC ch.7.
 */
const BUNDLE_DIR = 'run-testnet-20261001-a';

const snapshotFiles = import.meta.glob<Snapshot>(
  '../../../shared/snapshots/*/t*.json',
  { eager: true, import: 'default' },
);
const manifestFiles = import.meta.glob<BundleManifest>(
  '../../../shared/snapshots/*/manifest.json',
  { eager: true, import: 'default' },
);
const labelFiles = import.meta.glob<LabelMap>(
  '../../../shared/labels/*.json',
  { eager: true, import: 'default' },
);

function pick<T>(files: Record<string, T>, dir: string, name: string): T | null {
  const hit = Object.entries(files).find(([p]) => p.includes(`/${dir}/`) && p.endsWith(name));
  return hit ? hit[1] : null;
}

export const manifest = pick(manifestFiles, BUNDLE_DIR, 'manifest.json');

export const snapshots: Record<TimepointId, Snapshot> = (() => {
  const out = {} as Record<TimepointId, Snapshot>;
  for (const id of TIMEPOINT_ORDER) {
    const s = pick(snapshotFiles, BUNDLE_DIR, `${id}.json`);
    if (s) out[id] = s;
  }
  return out;
})();

export const labels: LabelMap | null =
  Object.entries(labelFiles)
    .map(([, v]) => v)
    .find((v) => v?.runId === manifest?.runId) ?? null;

/**
 * Refuse a mixed bundle. Every snapshot from one run carries the same runId;
 * if they differ, someone regenerated part of a run and the numbers will not add up.
 */
export function assertBundleIntegrity(): void {
  const loaded = TIMEPOINT_ORDER.filter((id) => snapshots[id]);
  if (loaded.length !== TIMEPOINT_ORDER.length) {
    const missing = TIMEPOINT_ORDER.filter((id) => !snapshots[id]);
    throw new Error(`Snapshot bundle is incomplete. Missing: ${missing.join(', ')}`);
  }
  const runIds = new Set(loaded.map((id) => snapshots[id].runId));
  if (runIds.size > 1) {
    throw new Error(
      `Snapshot bundle mixes runIds (${[...runIds].join(', ')}). ` +
        'Regenerate the whole run — partial regeneration is not allowed.',
    );
  }
  if (!labels) {
    throw new Error(
      `No label map for run "${manifest?.runId}". The chain stores only hashes, ` +
        'so refund ids and acquirer names cannot be rendered without it.',
    );
  }
}

/**
 * The chain stores only hashes. Everything readable comes from the label map.
 * If a lookup misses, show the shortened hash rather than crashing — but
 * `pnpm verify:bundle` should have caught a missing entry long before this.
 */
export function refundLabel(refundKey: string): string {
  return labels?.refunds?.[refundKey]?.refundId ?? short(refundKey);
}

export function acquirerLabel(acquirerHash: string): string {
  return labels?.acquirers?.[acquirerHash]?.displayName ?? short(acquirerHash);
}

/** ACQ-α — for tiles and table cells, where the display name does not fit. */
export function acquirerId(acquirerHash: string): string {
  return labels?.acquirers?.[acquirerHash]?.acquirerId ?? short(acquirerHash);
}

export function issuerRegion(issuerKey: string): string {
  return labels?.issuers?.[issuerKey]?.region ?? '';
}

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

export const timepointIds = TIMEPOINT_ORDER;

/**
 * The cardholder walkthrough, as it actually ran on chain.
 *
 * The phone tab is a local state machine — it has to be, so a visitor can
 * replay it as often as they like without touching the bundle. But the
 * figures it prints behind the cardholder, and the transactions it points
 * at, are the ones t0 recorded: REF-2026-001 was advanced and repaid on
 * Monad Testnet, and these are those two transactions. Nothing here is
 * typed in by hand, so a re-run of the bundle cannot leave the phone behind.
 *
 * Pool cash is the LP side only (`cashAvailable`); the protocol reserve is
 * held apart and never counted in it.
 */
export interface CardholderRun {
  chainId: number;
  advanceTx: string | null;
  advanceBlock: number | null;
  repayTx: string | null;
  /** LP cash before the advance: the deposits, nothing earned yet. */
  poolCashBefore: number;
  /** After 1,000 went out and the LP share of the fee came in. */
  poolCashAdvanced: number;
  /** After T+5 repayment — t0's recorded figure. */
  poolCashRepaid: number;
  /** The whole fee the issuer paid: LP + reserve + protocol shares. */
  fee: number;
}

export const cardholderRun: CardholderRun | null = (() => {
  const s = snapshots.t0;
  if (!s) return null;
  const ev = (name: string) => s.events.find((e) => e.name === name) ?? null;
  const advanced = ev('AdvanceIssued');
  const repaid = ev('AdvanceRepaid');
  const seeded = ev('ReserveSeeded')?.amount ?? 0;
  const principal = advanced?.amount ?? 0;
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  return {
    chainId: s.chainId,
    advanceTx: advanced?.txHash ?? null,
    advanceBlock: advanced?.blockNumber ?? null,
    repayTx: repaid?.txHash ?? null,
    poolCashBefore: round(s.pool.cashAvailable - s.pool.lpFeeAccrued),
    poolCashAdvanced: round(s.pool.cashAvailable - principal),
    poolCashRepaid: s.pool.cashAvailable,
    fee: round(s.pool.lpFeeAccrued + s.pool.protocolFee + (s.pool.reserve - seeded)),
  };
})();
