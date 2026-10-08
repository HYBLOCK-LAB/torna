/**
 * Submission and receipt checks (PROJECT_SPEC 10.6 steps ③ -> ④).
 *
 * Rules from shared/abi/README.md that this file enforces:
 *  - success = a matching AdvanceIssued log from the configured Torna address,
 *    NOT receipt.status (AdvanceRejected also produces a successful receipt);
 *  - before (re)submitting, check positionOf(refundKey): if the advance already
 *    exists, do NOT submit again — just re-sync the ledger (t7);
 *  - never invent a new refundKey because a receipt or response was lost.
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  parseEventLogs,
  type Abi,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem';

import { advanceAbi } from '../../../shared/abi/advance';
import type { AdvanceRequest } from '../../../shared/abi/eip712';
import { tornaEvents } from '../../../shared/abi/events';
import { mockUsdcPermitAbi } from '../../../shared/abi/permit';
import { repaymentAbi, type RepaymentRequest } from '../../../shared/abi/repayment';
import { positionStateName, POSITION_STATES } from '../../../shared/abi/states';
import type { PositionState } from '../../../shared/types/snapshot';
import { refundKeyOf } from './hash';
import { buildAdvanceRequest, buildRepaymentRequest, type RefundRow } from './request';
import {
  signAdvanceRequest,
  signPermit,
  signRepaymentRequest,
  type Deployment,
} from './sign';

type Signer = Parameters<typeof signAdvanceRequest>[0];

export interface AdapterClients {
  publicClient: PublicClient;
  /** Wallet of the submitter (mnemonic index 2, SUBMITTER_ROLE). */
  submitter: WalletClient<Transport, Chain | undefined, Account>;
}

export interface OnChainPosition {
  refundKey: Hex;
  issuer: Address;
  acquirerHash: Hex;
  amount: bigint;
  fee: bigint;
  issuerMargin: bigint;
  poolCoverage: bigint;
  maturity: bigint;
  state: PositionState;
}

/** Latest block timestamp; all deadlines/maturities are based on chain time. */
export async function chainNow(publicClient: PublicClient): Promise<bigint> {
  return (await publicClient.getBlock()).timestamp;
}

/** Read the chain id from the RPC and refuse to sign for a different chain. */
export async function assertChainId(publicClient: PublicClient, expected: number): Promise<void> {
  const actual = await publicClient.getChainId();
  if (actual !== expected) throw new Error(`Connected chain ${actual} is not ${expected}`);
}

function isRevert(error: unknown): boolean {
  return error instanceof BaseError
    && error.walk(e => e instanceof ContractFunctionRevertedError) instanceof ContractFunctionRevertedError;
}

/** positionOf reverts for unknown keys; that is reported as null here. */
export async function readPosition(
    clients: Pick<AdapterClients, 'publicClient'>, d: Deployment, refundKey: Hex,
): Promise<OnChainPosition | null> {
  let raw;
  try {
    raw = await clients.publicClient.readContract({
      address: d.torna, abi: advanceAbi, functionName: 'positionOf', args: [refundKey],
    });
  } catch (error) {
    if (isRevert(error)) return null;
    throw error;
  }
  if (!raw.exists) return null;
  return {
    refundKey,
    issuer: raw.issuer,
    acquirerHash: raw.acquirerHash,
    amount: raw.amount,
    fee: raw.fee,
    issuerMargin: raw.issuerMargin,
    poolCoverage: raw.poolCoverage,
    maturity: raw.maturity,
    state: positionStateName(raw.state),
  };
}

export type AdvanceOutcome =
  | { status: 'issued'; refundKey: Hex; request: AdvanceRequest; txHash: Hex; blockNumber: bigint }
  | { status: 'already-issued'; refundKey: Hex; position: OnChainPosition }
  | { status: 'rejected'; refundKey: Hex; reason: number; txHash: Hex; blockNumber: bigint };

/**
 * Advance one DB refund. Idempotent across retries: an already-advanced key is
 * reported as 'already-issued' without sending a transaction.
 */
export async function advanceRefund(args: {
  clients: AdapterClients;
  deployment: Deployment;
  issuer: Signer;
  row: RefundRow;
}): Promise<AdvanceOutcome> {
  const { clients, deployment: d, issuer, row } = args;
  const { publicClient, submitter } = clients;
  const refundKey = refundKeyOf(row.refund_id);

  const existing = await readPosition(clients, d, refundKey);
  if (existing) return { status: 'already-issued', refundKey, position: existing };

  const now = await chainNow(publicClient);
  const nonce = await publicClient.readContract({
    address: d.torna, abi: advanceAbi, functionName: 'advanceNonces', args: [issuer.address],
  });
  const request = buildAdvanceRequest(row, { issuer: issuer.address, nonce, chainNow: now });
  const signature = await signAdvanceRequest(issuer, d, request);

  const [fee] = await publicClient.readContract({
    address: d.torna, abi: advanceAbi, functionName: 'quoteAdvanceFee', args: [request.amount],
  });
  const tokenNonce = await publicClient.readContract({
    address: d.asset, abi: mockUsdcPermitAbi, functionName: 'nonces', args: [issuer.address],
  });
  const feePermit = await signPermit(issuer, d, { value: fee, nonce: tokenNonce, deadline: request.deadline });

  const txHash = await submitter.writeContract({
    address: d.torna,
    // Loosely typed on purpose: viem's tuple inference collapses these args to `never`.
    abi: advanceAbi as Abi,
    functionName: 'advanceWithPermit',
    args: [request, signature, feePermit],
    account: submitter.account,
    chain: submitter.chain,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') throw new Error(`advance ${row.refund_id} reverted (${txHash})`);

  const fromTorna = receipt.logs.filter(l => l.address.toLowerCase() === d.torna.toLowerCase());
  const issued = parseEventLogs({ abi: tornaEvents, eventName: 'AdvanceIssued', logs: fromTorna })
    .find(e => e.args.refundKey === refundKey
      && e.args.issuer?.toLowerCase() === request.issuer.toLowerCase()
      && e.args.amount === request.amount
      && e.args.maturity === request.maturity);
  if (issued) return { status: 'issued', refundKey, request, txHash, blockNumber: receipt.blockNumber };

  const rejected = parseEventLogs({ abi: tornaEvents, eventName: 'AdvanceRejected', logs: fromTorna })
    .find(e => e.args.refundKey === refundKey);
  if (rejected) {
    return { status: 'rejected', refundKey, reason: Number(rejected.args.reason), txHash, blockNumber: receipt.blockNumber };
  }
  throw new Error(`advance ${row.refund_id}: receipt ${txHash} has neither AdvanceIssued nor AdvanceRejected`);
}

export type RepayOutcome =
  | { status: 'repaid'; refundKey: Hex; request: RepaymentRequest; txHash: Hex; blockNumber: bigint }
  | { status: 'already-repaid'; refundKey: Hex; position: OnChainPosition };

/** Full-principal repayment signed by the issuer (Advanced or Review positions). */
export async function repayRefund(args: {
  clients: AdapterClients;
  deployment: Deployment;
  issuer: Signer;
  refundId: string;
}): Promise<RepayOutcome> {
  const { clients, deployment: d, issuer, refundId } = args;
  const { publicClient, submitter } = clients;
  const refundKey = refundKeyOf(refundId);
  const position = await readPosition(clients, d, refundKey);
  if (!position) throw new Error(`repay ${refundId}: no on-chain position`);
  if (position.state === 'Repaid') return { status: 'already-repaid', refundKey, position };
  if (position.state !== 'Advanced' && position.state !== 'Review') {
    throw new Error(`repay ${refundId}: position is ${position.state}`);
  }

  const now = await chainNow(publicClient);
  const nonce = await publicClient.readContract({
    address: d.torna, abi: repaymentAbi, functionName: 'repaymentNonces', args: [issuer.address],
  });
  const request = buildRepaymentRequest(refundId, {
    issuer: issuer.address, nonce, chainNow: now, principal: position.amount,
  });
  const signature = await signRepaymentRequest(issuer, d, request);
  const tokenNonce = await publicClient.readContract({
    address: d.asset, abi: mockUsdcPermitAbi, functionName: 'nonces', args: [issuer.address],
  });
  const permit = await signPermit(issuer, d, { value: request.amount, nonce: tokenNonce, deadline: request.deadline });

  const txHash = await submitter.writeContract({
    address: d.torna,
    abi: repaymentAbi as Abi,
    functionName: 'repayWithPermit',
    args: [request, signature, permit],
    account: submitter.account,
    chain: submitter.chain,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') throw new Error(`repay ${refundId} reverted (${txHash})`);
  const fromTorna = receipt.logs.filter(l => l.address.toLowerCase() === d.torna.toLowerCase());
  const repaid = parseEventLogs({ abi: tornaEvents, eventName: 'AdvanceRepaid', logs: fromTorna })
    .find(e => e.args.refundKey === refundKey && e.args.amount === request.amount);
  if (!repaid) throw new Error(`repay ${refundId}: receipt ${txHash} has no matching AdvanceRepaid`);
  return { status: 'repaid', refundKey, request, txHash, blockNumber: receipt.blockNumber };
}

export { POSITION_STATES };
