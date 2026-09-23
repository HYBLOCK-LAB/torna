/**
 * The full "outgoing + return" path for one refund (PROJECT_SPEC 6 ② -> ⑤).
 *
 * Decision (2026-09-22): the card ledger is credited right after the advance is
 * confirmed by an AdvanceIssued log — balance restored in seconds (spec 6 ⑤),
 * not after the T+5 repayment.
 *
 * The adapter stays DB-agnostic: the ledger write is injected, so
 * packages/ledger's creditLedger (idempotent via UNIQUE(refund_key)) plugs in.
 */
import type { Hex } from 'viem';

import { advanceRefund, type AdvanceOutcome } from './chain';
import type { RefundRow } from './request';

export type CreditLedger = (refundKey: Hex, dbAmount: string, chainTxHash: Hex | null) => Promise<boolean>;

export type ProcessOutcome = AdvanceOutcome & { credited: boolean | null };

export async function processRefund(
    args: Parameters<typeof advanceRefund>[0] & { creditLedger: CreditLedger },
): Promise<ProcessOutcome> {
  const outcome = await advanceRefund(args);
  if (outcome.status === 'rejected') return { ...outcome, credited: null };
  // 'issued' or 'already-issued' (t7 retry): re-sync the ledger. A second call
  // for the same key is a no-op and returns false.
  const txHash = outcome.status === 'issued' ? outcome.txHash : null;
  const credited = await args.creditLedger(outcome.refundKey, args.row.amount, txHash);
  return { ...outcome, credited };
}
