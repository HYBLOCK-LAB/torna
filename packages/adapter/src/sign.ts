/**
 * Off-chain signatures made by the ISSUER. The submitter (index 2) sends the
 * transaction and pays gas; issuers never need gas (PROJECT_SPEC 14).
 * Struct definitions are imported from shared/abi, never re-typed here.
 */
import { hashTypedData, parseSignature, type Address, type Hex, type LocalAccount } from 'viem';

import type { PermitSignature } from '../../../shared/abi/collateral';
import {
  ADVANCE_REQUEST_PRIMARY_TYPE,
  advanceRequestTypes,
  tornaDomain,
  type AdvanceRequest,
} from '../../../shared/abi/eip712';
import {
  mockUsdcPermitDomain,
  PERMIT_PRIMARY_TYPE,
  permitTypes,
  type PermitMessage,
} from '../../../shared/abi/permit';
import {
  REPAYMENT_REQUEST_PRIMARY_TYPE,
  repaymentRequestTypes,
  type RepaymentRequest,
} from '../../../shared/abi/repayment';

export interface Deployment {
  /** Read from the RPC (eth_chainId), never hard-coded. */
  chainId: number;
  torna: Address;
  /** MockUSDC address. */
  asset: Address;
}

type Signer = Pick<LocalAccount, 'address' | 'signTypedData'>;

function assertSigner(account: Signer, expected: Address, what: string): void {
  if (account.address.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${what}: signer ${account.address} is not ${expected}`);
  }
}

export function advanceTypedData(d: Pick<Deployment, 'chainId' | 'torna'>, request: AdvanceRequest) {
  return {
    domain: tornaDomain(d.chainId, d.torna),
    types: advanceRequestTypes,
    primaryType: ADVANCE_REQUEST_PRIMARY_TYPE,
    message: request,
  } as const;
}

export function repaymentTypedData(d: Pick<Deployment, 'chainId' | 'torna'>, request: RepaymentRequest) {
  return {
    domain: tornaDomain(d.chainId, d.torna),
    types: repaymentRequestTypes,
    primaryType: REPAYMENT_REQUEST_PRIMARY_TYPE,
    message: request,
  } as const;
}

export function permitTypedData(d: Pick<Deployment, 'chainId' | 'asset'>, message: PermitMessage) {
  return {
    domain: mockUsdcPermitDomain(d.chainId, d.asset),
    types: permitTypes,
    primaryType: PERMIT_PRIMARY_TYPE,
    message,
  } as const;
}

/** EIP-712 digest, for conformance tests against shared/abi/fixtures. */
export const hashAdvanceRequest = (d: Pick<Deployment, 'chainId' | 'torna'>, r: AdvanceRequest): Hex =>
  hashTypedData(advanceTypedData(d, r));
export const hashRepaymentRequest = (d: Pick<Deployment, 'chainId' | 'torna'>, r: RepaymentRequest): Hex =>
  hashTypedData(repaymentTypedData(d, r));
export const hashPermit = (d: Pick<Deployment, 'chainId' | 'asset'>, m: PermitMessage): Hex =>
  hashTypedData(permitTypedData(d, m));

export async function signAdvanceRequest(
    issuer: Signer, d: Pick<Deployment, 'chainId' | 'torna'>, request: AdvanceRequest): Promise<Hex> {
  assertSigner(issuer, request.issuer, 'AdvanceRequest');
  return issuer.signTypedData(advanceTypedData(d, request));
}

export async function signRepaymentRequest(
    issuer: Signer, d: Pick<Deployment, 'chainId' | 'torna'>, request: RepaymentRequest): Promise<Hex> {
  assertSigner(issuer, request.issuer, 'RepaymentRequest');
  return issuer.signTypedData(repaymentTypedData(d, request));
}

/** Split into the { deadline, v, r, s } tuple the contract takes (v = 27/28). */
export function splitPermitSignature(signature: Hex, deadline: bigint): PermitSignature {
  const parsed = parseSignature(signature);
  return {
    deadline,
    v: Number(parsed.v ?? BigInt(27 + parsed.yParity)),
    r: parsed.r,
    s: parsed.s,
  };
}

/**
 * Token Permit, owner = issuer, spender = Torna (never the submitter).
 * For an advance, value is the FEE only: quoteAdvanceFee(amount)[0].
 * For a repayment, value is the full principal.
 */
export async function signPermit(
    issuer: Signer,
    d: Pick<Deployment, 'chainId' | 'asset' | 'torna'>,
    input: { value: bigint; nonce: bigint; deadline: bigint },
): Promise<PermitSignature> {
  const message: PermitMessage = {
    owner: issuer.address,
    spender: d.torna,
    value: input.value,
    nonce: input.nonce,
    deadline: input.deadline,
  };
  const signature = await issuer.signTypedData(permitTypedData(d, message));
  return splitPermitSignature(signature, input.deadline);
}
