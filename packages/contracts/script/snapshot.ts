import type { Snapshot } from '../../../shared/types/snapshot';
import type { CapturePoint, RunContext } from './runtime/types';
import { ScaffoldNotImplementedError } from './runtime/errors';

/** Future: query state at point.blockNumber and logs through that same block.
 * Convert six-decimal base units only at the serialization boundary.
 * No missing pool metrics may be silently filled with zero or sample values.
 */
export async function captureSnapshot(_context: RunContext, _point: CapturePoint): Promise<Snapshot> {
  throw new ScaffoldNotImplementedError('Block-pinned snapshot reader');
}

/** Future: validate schema/identity, create a new run directory, and write with no overwrite. */
export async function saveSnapshot(_context: RunContext, _snapshot: Snapshot): Promise<void> {
  throw new ScaffoldNotImplementedError('Snapshot writer');
}

/** Future: check twelve snapshots and Minjae's same-run labels before writing a manifest. */
export async function finalizeBundle(_context: RunContext): Promise<void> {
  throw new ScaffoldNotImplementedError('Bundle finalizer');
}
