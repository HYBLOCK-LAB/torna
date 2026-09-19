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

/** Change this one line when the real bundle lands. */
const BUNDLE_DIR = 'sample';

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

export function issuerRegion(issuerKey: string): string {
  return labels?.issuers?.[issuerKey]?.region ?? '';
}

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

export const timepointIds = TIMEPOINT_ORDER;
