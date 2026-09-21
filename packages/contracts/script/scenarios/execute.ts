import type { TimepointId } from '../../../../shared/types/snapshot';
import type { CapturePoint, RunContext } from '../runtime/types';
import { ScaffoldNotImplementedError } from '../runtime/errors';

/** Add real, sequential receipt-checked handlers here as each contract flow becomes available.
 * Do not invent refunds, tx hashes, business approvals or ledger results to satisfy a snapshot.
 */
export async function executeScenario(_context: RunContext, id: TimepointId): Promise<CapturePoint> {
  throw new ScaffoldNotImplementedError(`Scenario ${id}`);
}
