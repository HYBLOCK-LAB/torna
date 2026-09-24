/**
 * The normal "outgoing + return" path for one refund (PROJECT_SPEC 6 ② -> ⑤).
 *
 * Decision (2026-09-22): the card ledger is credited right after the advance is
 * confirmed by an AdvanceIssued log — balance restored in seconds (spec 6 ⑤).
 *
 * This path NEVER sends the LedgerCreditConfirmed acknowledgement. If the
 * ledger write fails, the refund is put on the retry queue instead, and only
 * the retry job (retry.ts) may acknowledge it later (timepoint t7).
 *
 * The adapter stays DB-agnostic: the ledger write and the queue are injected
 * (packages/ledger: creditLedger, ledgerRetryStore).
 */
import type { Hex } from 'viem';

import { advanceRefund, type AdvanceOutcome } from './chain';
import type { RefundRow } from './request';
import type { LedgerRetryStore } from './retry';

export type CreditLedger = (refundKey: Hex, dbAmount: string, chainTxHash: Hex | null) => Promise<boolean>;

export type ProcessOutcome = AdvanceOutcome & {
  /** true = balance credited now, false = already credited or queued, null = rejected. */
  credited: boolean | null;
  /** The ledger write failed and the refund is on the retry queue. */
  retryQueued: boolean;
};

export async function processRefund(
    args: Parameters<typeof advanceRefund>[0] & {
      creditLedger: CreditLedger;
      /** Without a store, a failed ledger write is rethrown. */
      retryStore?: Pick<LedgerRetryStore, 'enqueue'>;
    },
): Promise<ProcessOutcome> {
  const outcome = await advanceRefund(args);
  if (outcome.status === 'rejected') return { ...outcome, credited: null, retryQueued: false };

  const txHash = outcome.status === 'issued' ? outcome.txHash : null;
  try {
    const credited = await args.creditLedger(outcome.refundKey, args.row.amount, txHash);
    return { ...outcome, credited, retryQueued: false };
  } catch (error) {
    if (!args.retryStore) throw error;
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
    await args.retryStore.enqueue(outcome.refundKey, txHash, reason);
    return { ...outcome, credited: false, retryQueued: true };
  }
}
