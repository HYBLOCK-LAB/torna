import type { RunContext } from './runtime/types';
import { ScaffoldNotImplementedError } from './runtime/errors';

/** Future: validate local network/roles, deploy MockUSDC + Torna, await receipts.
 * No default mnemonic, private key, network or auto-broadcast is provided.
 * Bootstrap funding and issuer setup must then be explicit, receipt-checked actions.
 */
export async function deployProtocol(): Promise<RunContext> {
  throw new ScaffoldNotImplementedError('Protocol deployment');
}
