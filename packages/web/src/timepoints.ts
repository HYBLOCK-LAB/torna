/**
 * Torna — how the 12 timepoints are grouped in the navigator.
 *
 * This is presentation metadata, not protocol data. It deliberately does NOT
 * live in the snapshot: B(민서) produces state, and how the demo is sequenced
 * for a viewer is a front-end decision that may change up to the last day.
 *
 * The grouping is what makes "dim once viewed" work. A flat list of 12 goes
 * unreadable the moment you have seen most of them — which is exactly when a
 * judge is watching. A category filter keeps 1-4 cards on screen, so the dim
 * marks progress instead of hiding the navigation.
 *
 * Owner: A(서진)
 */

import type { TimepointId } from '@shared/types/snapshot';
import { t, type CopyKey, type Lang } from '@shared/copy';

export interface TimepointGroup {
  key: string;
  /** Category name. Keys already exist in shared/copy.ts. */
  copy: CopyKey;
  ids: readonly TimepointId[];
}

/**
 * t0 is deliberately absent. The cardholder run-through is not a scenario you
 * pick from a list — it is the cardholder screen itself, and it has its own tab.
 * Its snapshot still exists in the bundle and still serves as the "before" that
 * t1's deltas are measured against.
 */
export const TIMEPOINT_GROUPS: readonly TimepointGroup[] = [
  { key: 'normal',     copy: 'cat.normal',     ids: ['t1'] },
  // t3b, t4b and t9b are NOT here: they are second stages of t3, t4 and t9,
  // reached from those briefings only. See TimepointNarrative.follow.
  { key: 'fund',       copy: 'cat.fund',       ids: ['t2', 't3', 't4'] },
  { key: 'ops',        copy: 'cat.ops',        ids: ['t5', 't6', 't7'] },
  { key: 'verify',     copy: 'cat.verify',     ids: ['t8'] },
  { key: 'grow',       copy: 'cat.grow',       ids: ['t9'] },
];

/** Every id must appear exactly once, or a timepoint becomes unreachable. */
const FOLLOW_PARENT: Partial<Record<TimepointId, TimepointId>> = { t3b: 't3', t4b: 't4', t9b: 't9' };

export function groupOf(id: TimepointId): TimepointGroup {
  // A follow-up belongs to its parent's category, so opening one keeps the
  // navigator on the thread it continues.
  const key = FOLLOW_PARENT[id] ?? id;
  // t0 has no group by design, so fall back to the first one rather than throw.
  return TIMEPOINT_GROUPS.find((x) => x.ids.includes(key)) ?? TIMEPOINT_GROUPS[0];
}

/** Every timepoint the navigator offers, in order. */
export const NAV_TIMEPOINTS = TIMEPOINT_GROUPS.flatMap((g) => g.ids);

/**
 * Where a timepoint sits in the navigator's order. A follow-up answers with
 * its parent's position: it is not a stop of its own, so "what comes next" and
 * "rewind to before this" both have to reason about the parent.
 */
export function navIndexOf(id: TimepointId): number {
  return NAV_TIMEPOINTS.indexOf(FOLLOW_PARENT[id] ?? id);
}

/**
 * What a timepoint is CALLED on screen. `t3b` is a file key — it belongs in the
 * bundle and the console, not in front of a judge, and it stops meaning
 * anything the moment the ids change. Everything the viewer reads goes through
 * here: "Scenario 3 · follow-up".
 */
export function scenLabel(id: TimepointId, lang: Lang): string {
  const parent = FOLLOW_PARENT[id];
  const n = (parent ?? id).replace(/^t/, '');
  return t(parent ? 'scen.numFollow' : 'scen.num', lang).replace('{n}', n);
}

/** A second stage of another timepoint (t3b, t9b) rather than a stop of its own. */
export function isFollowUp(id: TimepointId): boolean {
  return FOLLOW_PARENT[id] !== undefined;
}

/**
 * The state a rewind lands on: everything up to but NOT including `id`.
 * A follow-up rewinds to its parent (the recovery undone, the incident still
 * standing); the first scenario rewinds to t0, the cardholder run alone.
 */
export function previousTimepoint(id: TimepointId): TimepointId {
  const parent = FOLLOW_PARENT[id];
  if (parent) return parent;
  const i = NAV_TIMEPOINTS.indexOf(id);
  return i > 0 ? NAV_TIMEPOINTS[i - 1] : ('t0' as TimepointId);
}
