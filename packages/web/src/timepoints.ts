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
import type { CopyKey } from '@shared/copy';

export interface TimepointGroup {
  key: string;
  /** Category name. Keys already exist in shared/copy.ts. */
  copy: CopyKey;
  ids: readonly TimepointId[];
}

export const TIMEPOINT_GROUPS: readonly TimepointGroup[] = [
  // t0 is the cardholder's own run-through, not an operational event.
  { key: 'experience', copy: 'cat.experience', ids: ['t0'] },
  { key: 'normal',     copy: 'cat.normal',     ids: ['t1'] },
  // t3b is the recovery settlement that closes t3, so it sits with it.
  { key: 'fund',       copy: 'cat.fund',       ids: ['t2', 't3', 't3b', 't4'] },
  { key: 'ops',        copy: 'cat.ops',        ids: ['t5', 't6', 't7'] },
  { key: 'verify',     copy: 'cat.verify',     ids: ['t8'] },
  // t9b is the capital that arrives after t9, same thread.
  { key: 'grow',       copy: 'cat.grow',       ids: ['t9', 't9b'] },
];

/** Every id must appear exactly once, or a timepoint becomes unreachable. */
export function groupOf(id: TimepointId): TimepointGroup {
  const g = TIMEPOINT_GROUPS.find((x) => x.ids.includes(id));
  if (!g) throw new Error(`Timepoint ${id} is in no group — it would be unreachable in the navigator.`);
  return g;
}
