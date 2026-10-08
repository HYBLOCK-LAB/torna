/**
 * On-chain acknowledgement that a card-ledger credit was recovered (t7).
 *
 * Contract side (Minseo): confirmLedgerCredit(bytes32 refundKey), SUBMITTER_ROLE,
 * reverts for an unknown position or an already-confirmed key, moves no money,
 * emits LedgerCreditConfirmed(refundKey).
 *
 * The event ABI comes from shared/abi/events.ts and the function fragment from
 * shared/abi/ledger-credit.ts; test/conformance.test.ts checks the fragment
 * against the compiled shared/abi/Torna.json.
 */
import { parseEventLogs, type Hex } from 'viem';

import { tornaEvents } from '../../../shared/abi/events';
import { ledgerCreditAbi } from '../../../shared/abi/ledger-credit';
import type { AdapterClients } from './chain';
import type { Deployment } from './sign';

export const ledgerAckAbi = ledgerCreditAbi;

/** Condition 1: a matching AdvanceIssued log from Torna, read from the advance receipt. */
export async function hasAdvanceIssuedLog(
    clients: Pick<AdapterClients, 'publicClient'>, d: Deployment, refundKey: Hex, advanceTxHash: Hex,
): Promise<boolean> {
  const receipt = await clients.publicClient.getTransactionReceipt({ hash: advanceTxHash });
  if (receipt.status !== 'success') return false;
  const fromTorna = receipt.logs.filter(l => l.address.toLowerCase() === d.torna.toLowerCase());
  return parseEventLogs({ abi: tornaEvents, eventName: 'AdvanceIssued', logs: fromTorna })
    .some(e => e.args.refundKey === refundKey);
}

export type AckOutcome =
  | { status: 'confirmed'; txHash: Hex; blockNumber: bigint }
  | { status: 'contract-rejected'; detail: string };

/**
 * Condition 4 on chain: simulate first. The contract reverts for an
 * already-confirmed key, so a duplicate is caught here and never sent.
 * Success requires a matching LedgerCreditConfirmed log in the receipt.
 */
export async function confirmLedgerCredit(
    clients: AdapterClients, d: Deployment, refundKey: Hex,
): Promise<AckOutcome> {
  const { publicClient, submitter } = clients;
  try {
    await publicClient.simulateContract({
      address: d.torna, abi: ledgerAckAbi, functionName: 'confirmLedgerCredit',
      args: [refundKey], account: submitter.account,
    });
  } catch (error) {
    return { status: 'contract-rejected', detail: error instanceof Error ? error.message.split('\n')[0] : String(error) };
  }

  const txHash = await submitter.writeContract({
    address: d.torna, abi: ledgerAckAbi, functionName: 'confirmLedgerCredit',
    args: [refundKey], account: submitter.account, chain: submitter.chain,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') throw new Error(`confirmLedgerCredit reverted (${txHash})`);
  const fromTorna = receipt.logs.filter(l => l.address.toLowerCase() === d.torna.toLowerCase());
  const logged = parseEventLogs({ abi: tornaEvents, eventName: 'LedgerCreditConfirmed', logs: fromTorna })
    .some(e => e.args.refundKey === refundKey);
  if (!logged) throw new Error(`confirmLedgerCredit: receipt ${txHash} has no LedgerCreditConfirmed`);
  return { status: 'confirmed', txHash, blockNumber: receipt.blockNumber };
}
