/** DB refund row -> AdvanceRequest (PROJECT_SPEC 10.6 steps ① -> ②). */
import type { Address } from 'viem';

import type { AdvanceRequest } from '../../../shared/abi/eip712';
import type { RepaymentRequest } from '../../../shared/abi/repayment';
import { dbAmountToBaseUnits } from './amount';
import { acquirerHashOf, refundKeyOf } from './hash';
import { computeMaturity } from './maturity';

/** Columns the adapter needs from public.refunds (see packages/ledger/schema.sql). */
export interface RefundRow {
  refund_id: string;
  issuer_id: string;
  acquirer_id: string;
  /** numeric(14,2) as returned by Postgres, e.g. "1000.00". */
  amount: string;
  confirmed_at: Date | string;
}

export const DEFAULT_DEADLINE_SECONDS = 10n * 60n; // spec 10.6: now + 10 minutes

export interface AdvanceRequestInput {
  /** On-chain address of the signing issuer (mnemonic index 3..7). */
  issuer: Address;
  /** Torna.advanceNonces(issuer), read right before signing. */
  nonce: bigint;
  /** Latest block timestamp of the connected chain. */
  chainNow: bigint;
  deadlineSeconds?: bigint;
}

export function buildAdvanceRequest(row: RefundRow, input: AdvanceRequestInput): AdvanceRequest {
  return {
    refundKey: refundKeyOf(row.refund_id),
    issuer: input.issuer,
    acquirerHash: acquirerHashOf(row.acquirer_id),
    amount: dbAmountToBaseUnits(row.amount),
    maturity: computeMaturity(row.confirmed_at, input.chainNow),
    nonce: input.nonce,
    deadline: input.chainNow + (input.deadlineSeconds ?? DEFAULT_DEADLINE_SECONDS),
  };
}

export interface RepaymentRequestInput {
  issuer: Address;
  /** Torna.repaymentNonces(issuer). */
  nonce: bigint;
  chainNow: bigint;
  /** Full principal copied from positionOf(refundKey).amount, never recomputed. */
  principal: bigint;
  deadlineSeconds?: bigint;
}

export function buildRepaymentRequest(refundId: string, input: RepaymentRequestInput): RepaymentRequest {
  return {
    refundKey: refundKeyOf(refundId),
    issuer: input.issuer,
    amount: input.principal,
    nonce: input.nonce,
    deadline: input.chainNow + (input.deadlineSeconds ?? DEFAULT_DEADLINE_SECONDS),
  };
}
