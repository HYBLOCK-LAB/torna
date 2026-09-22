import {
  keccak256,
  parseEventLogs,
  parseSignature,
  stringToHex,
  type Abi,
  type Hex,
} from 'viem';

import {
  COLLATERAL_DEPOSIT_PRIMARY_TYPE,
  collateralDepositTypes,
  type CollateralDepositRequest,
  type PermitSignature,
} from '../../../../shared/abi/collateral';
import {
  ADVANCE_REQUEST_PRIMARY_TYPE,
  advanceRequestTypes,
  tornaDomain,
  type AdvanceRequest,
} from '../../../../shared/abi/eip712';
import { tornaEvents } from '../../../../shared/abi/events';
import {
  mockUsdcPermitDomain,
  PERMIT_PRIMARY_TYPE,
  permitTypes,
} from '../../../../shared/abi/permit';
import {
  REPAYMENT_REQUEST_PRIMARY_TYPE,
  repaymentRequestTypes,
  type RepaymentRequest,
} from '../../../../shared/abi/repayment';
import type { TimepointId } from '../../../../shared/types/snapshot';
import {
  loadProtocolArtifacts,
  readContractValue,
  submitContract,
  type LocalT0Actor,
  type LocalT0Session,
} from '../deploy';
import { FullScenarioNotImplementedError, ReceiptEventMismatchError } from '../runtime/errors';
import type { CapturePoint, ConfirmedTransaction, T0RunContext } from '../runtime/types';

const USDC = 1_000_000n;
const ONE_THOUSAND_USDC = 1_000n * USDC;
const THIRTY_DAYS = 30 * 24 * 60 * 60;
const FIVE_DAYS = 5 * 24 * 60 * 60;

/**
 * PRD section 7 t0 values in six-decimal MockUSDC base units. These are
 * checked from the confirmed repayment block, not inferred from the inputs.
 */
export const T0_FINAL_ACCOUNTING = {
  lp01Principal: 5_000n * USDC,
  lp02Principal: 3_000n * USDC,
  lp03Principal: 2_000n * USDC,
  totalLpPrincipal: 10_000n * USDC,
  totalLpFees: 2_400_000n,
  totalOutstanding: 0n,
  reserveBalance: 500_399_000n,
  protocolFees: 201_000n,
  totalCollateral: 3_600n * USDC,
  hybridCollateral: 3_000n * USDC,
  auraCollateral: 600n * USDC,
  hybridOutstanding: 0n,
  totalAdvanceCount: 1n,
  totalAdvanced: ONE_THOUSAND_USDC,
  hybridAssetBalance: ONE_THOUSAND_USDC,
  auraAssetBalance: 0n,
  protocolAssetBalance: 14_103n * USDC,
} as const;

export type T0FinalAccounting = {
  -readonly [Key in keyof typeof T0_FINAL_ACCOUNTING]: bigint;
};

/** Public t0 ordering: each mutating action waits for a receipt before the next. */
export const T0_EXECUTION_ORDER = [
  'verify roles',
  'mint local test USDC',
  'configure initial LPs',
  'fund LP-01',
  'fund LP-02',
  'fund LP-03',
  'register HYBRID',
  'register AURA',
  'advance local time by 30 days',
  'deposit HYBRID collateral',
  'deposit AURA collateral',
  'seed reserve',
  'issue REF-2026-001',
  'repay REF-2026-001',
] as const;

function asBigInt(value: unknown, name: string): bigint {
  if (typeof value !== 'bigint') throw new Error(`${name} returned a non-integer value.`);
  return value;
}

function asBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${name} returned a non-boolean value.`);
  return value;
}

function positionField(value: unknown, field: string, index: number): unknown {
  if (Array.isArray(value)) return value[index];
  if (value && typeof value === 'object' && field in value) {
    return (value as Record<string, unknown>)[field];
  }
  throw new Error(`Torna.positionOf returned no ${field} field.`);
}

function assertRepaidT0Position(value: unknown, request: AdvanceRequest): void {
  const exists = positionField(value, 'exists', 0);
  const issuer = positionField(value, 'issuer', 1);
  const amount = positionField(value, 'amount', 3);
  const state = positionField(value, 'state', 9);
  if (exists !== true || issuer !== request.issuer || amount !== request.amount || state !== 2n) {
    throw new Error('Confirmed t0 position does not match the expected Repaid state.');
  }
}

/** Fail the local rehearsal if exact t0 accounting diverges from PRD section 7. */
export function assertT0FinalAccounting(actual: T0FinalAccounting): void {
  for (const key of Object.keys(T0_FINAL_ACCOUNTING) as Array<keyof T0FinalAccounting>) {
    if (actual[key] !== T0_FINAL_ACCOUNTING[key]) {
      throw new Error(
          `Local t0 accounting mismatch for ${key}: expected ${T0_FINAL_ACCOUNTING[key]}, received ${actual[key]}.`);
    }
  }
}

async function readT0FinalAccounting(
    session: LocalT0Session,
    context: T0RunContext,
    blockNumber: bigint,
): Promise<T0FinalAccounting> {
  const { mockUsdc, torna } = loadProtocolArtifacts();
  const readTorna = async (functionName: string, args: readonly unknown[] = []): Promise<bigint> =>
    asBigInt(
        await readContractValue(session, context.torna, torna.abi, functionName, args, blockNumber),
        `Torna.${functionName}`);
  const readAsset = async (owner: string): Promise<bigint> =>
    asBigInt(
        await readContractValue(session, context.asset, mockUsdc.abi, 'balanceOf', [owner], blockNumber),
        'MockUSDC.balanceOf');

  const [
    lp01Principal, lp02Principal, lp03Principal, totalLpPrincipal, totalLpFees, totalOutstanding,
    reserveBalance, protocolFees, totalCollateral, hybridCollateral, auraCollateral, hybridOutstanding,
    totalAdvanceCount, totalAdvanced, hybridAssetBalance, auraAssetBalance, protocolAssetBalance,
  ] = await Promise.all([
    readTorna('lpPrincipal', [context.actors.lp01]),
    readTorna('lpPrincipal', [context.actors.lp02]),
    readTorna('lpPrincipal', [context.actors.lp03]),
    readTorna('totalLpPrincipal'),
    readTorna('totalLpFees'),
    readTorna('totalOutstanding'),
    readTorna('reserveBalance'),
    readTorna('protocolFees'),
    readTorna('totalCollateral'),
    readTorna('collateralOf', [context.actors.hybridIssuer]),
    readTorna('collateralOf', [context.actors.auraIssuer]),
    readTorna('issuerOutstanding', [context.actors.hybridIssuer]),
    readTorna('totalAdvanceCount'),
    readTorna('totalAdvanced'),
    readAsset(context.actors.hybridIssuer),
    readAsset(context.actors.auraIssuer),
    readAsset(context.torna),
  ]);
  return {
    lp01Principal, lp02Principal, lp03Principal, totalLpPrincipal, totalLpFees, totalOutstanding,
    reserveBalance, protocolFees, totalCollateral, hybridCollateral, auraCollateral, hybridOutstanding,
    totalAdvanceCount, totalAdvanced, hybridAssetBalance, auraAssetBalance, protocolAssetBalance,
  };
}

function splitPermit(signature: Hex, deadline: bigint): PermitSignature {
  const parsed = parseSignature(signature);
  return {
    deadline,
    v: Number(parsed.v ?? BigInt(27 + parsed.yParity)),
    r: parsed.r,
    s: parsed.s,
  };
}

async function latestTimestamp(session: LocalT0Session): Promise<bigint> {
  return (await session.publicClient.getBlock()).timestamp;
}

async function permitFor(
    session: LocalT0Session,
    owner: 'hybridIssuer' | 'auraIssuer',
    asset: T0RunContext['asset'],
    spender: T0RunContext['torna'],
    value: bigint,
    deadline: bigint,
): Promise<PermitSignature> {
  const { mockUsdc } = loadProtocolArtifacts();
  const account = session.config.accounts[owner];
  const nonce = asBigInt(await readContractValue(
      session, asset, mockUsdc.abi, 'nonces', [account.address]), 'MockUSDC.nonces');
  const signature = await account.signTypedData({
    domain: mockUsdcPermitDomain(session.config.chainId, asset),
    types: permitTypes,
    primaryType: PERMIT_PRIMARY_TYPE,
    message: { owner: account.address, spender, value, nonce, deadline },
  });
  return splitPermit(signature, deadline);
}

async function verifyRole(
    session: LocalT0Session, context: T0RunContext, role: Hex, account: T0RunContext['actors'][keyof T0RunContext['actors']],
): Promise<void> {
  const { torna } = loadProtocolArtifacts();
  const hasRole = asBoolean(await readContractValue(
      session, context.torna, torna.abi, 'hasRole', [role, account]), 'Torna.hasRole');
  if (!hasRole) throw new Error('Torna deployment did not grant the required role.');
}

async function verifyIssued(
    session: LocalT0Session,
    context: T0RunContext,
    transaction: ConfirmedTransaction,
    request: AdvanceRequest,
): Promise<void> {
  const receipt = await session.publicClient.getTransactionReceipt({ hash: transaction.hash });
  const events = parseEventLogs({
    abi: tornaEvents,
    eventName: 'AdvanceIssued',
    logs: receipt.logs,
  });
  const found = events.some(event =>
    event.address.toLowerCase() === context.torna.toLowerCase()
      && event.args.refundKey === request.refundKey
      && event.args.issuer?.toLowerCase() === request.issuer.toLowerCase()
      && event.args.amount === request.amount
      && event.args.maturity === request.maturity,
  );
  if (!found) throw new ReceiptEventMismatchError('AdvanceIssued');
}

async function verifyRepaid(
    session: LocalT0Session,
    context: T0RunContext,
    transaction: ConfirmedTransaction,
    request: RepaymentRequest,
): Promise<void> {
  const receipt = await session.publicClient.getTransactionReceipt({ hash: transaction.hash });
  const events = parseEventLogs({
    abi: tornaEvents,
    eventName: 'AdvanceRepaid',
    logs: receipt.logs,
  });
  const found = events.some(event =>
    event.address.toLowerCase() === context.torna.toLowerCase()
      && event.args.refundKey === request.refundKey
      && event.args.amount === request.amount,
  );
  if (!found) throw new ReceiptEventMismatchError('AdvanceRepaid');
}

async function advanceLocalTime(session: LocalT0Session): Promise<void> {
  const request = session.publicClient.request as unknown as (args: {
    method: string;
    params?: readonly unknown[];
  }) => Promise<unknown>;
  await request({ method: 'evm_increaseTime', params: [THIRTY_DAYS] });
  await request({ method: 'evm_mine', params: [] });
}

async function depositCollateral(
    session: LocalT0Session,
    context: T0RunContext,
    actor: 'hybridIssuer' | 'auraIssuer',
    amount: bigint,
): Promise<void> {
  const { torna } = loadProtocolArtifacts();
  const issuer = session.config.accounts[actor];
  const now = await latestTimestamp(session);
  const deadline = now + 10n * 60n;
  const nonce = asBigInt(await readContractValue(
      session, context.torna, torna.abi, 'collateralDepositNonces', [issuer.address]),
  'Torna.collateralDepositNonces');
  const request: CollateralDepositRequest = {
    issuer: issuer.address,
    amount,
    nonce,
    deadline,
  };
  const actionSignature = await issuer.signTypedData({
    domain: tornaDomain(context.chainId, context.torna),
    types: collateralDepositTypes,
    primaryType: COLLATERAL_DEPOSIT_PRIMARY_TYPE,
    message: request,
  });
  const permitSignature = await permitFor(
      session, actor, context.asset, context.torna, amount, deadline);
  await submitContract(
      session,
      'submitter',
      context.torna,
      torna.abi,
      'depositCollateralWithPermit',
      [request, actionSignature, permitSignature],
      `${actor} collateral deposit`,
  );
}

/** Execute the real local normal path. It never handles adapter or ledger work. */
export async function executeT0(
    session: LocalT0Session, context: T0RunContext): Promise<CapturePoint> {
  const { mockUsdc, torna } = loadProtocolArtifacts();
  const { actors } = context;
  await verifyRole(session, context, `0x${'00'.repeat(32)}`, actors.deployer);
  await verifyRole(session, context, keccak256(stringToHex('VERIFIER_ROLE')), actors.verifier);
  await verifyRole(session, context, keccak256(stringToHex('SUBMITTER_ROLE')), actors.submitter);

  const mints: ReadonlyArray<readonly [T0RunContext['actors'][keyof T0RunContext['actors']], bigint]> = [
    [actors.deployer, 500n * USDC],
    [actors.lp01, 5_000n * USDC],
    [actors.lp02, 3_000n * USDC],
    [actors.lp03, 2_000n * USDC],
    [actors.hybridIssuer, 4_003n * USDC],
    [actors.auraIssuer, 600n * USDC],
  ];
  for (const [recipient, amount] of mints) {
    await submitContract(session, 'deployer', context.asset, mockUsdc.abi, 'mint',
        [recipient, amount], 'Mint local MockUSDC');
  }

  await submitContract(session, 'deployer', context.torna, torna.abi, 'configureInitialLiquidity',
      [[actors.lp01, actors.lp02, actors.lp03]], 'Configure initial liquidity');
  for (const [actor, amount] of [
    ['lp01', 5_000n * USDC], ['lp02', 3_000n * USDC], ['lp03', 2_000n * USDC],
  ] as const) {
    await submitContract(session, actor, context.asset, mockUsdc.abi, 'approve',
        [context.torna, amount], `${actor} approve initial liquidity`);
    await submitContract(session, actor, context.torna, torna.abi, 'depositInitialLiquidity',
        [amount], `${actor} deposit initial liquidity`);
  }

  const hybridAcquirer = keccak256(stringToHex('ACQ-α'));
  const auraAcquirer = keccak256(stringToHex('ACQ-β'));
  await submitContract(session, 'deployer', context.torna, torna.abi, 'registerIssuer',
      [actors.hybridIssuer, hybridAcquirer, 'HYBRID Travel Card'], 'Register HYBRID issuer');
  await submitContract(session, 'deployer', context.torna, torna.abi, 'registerIssuer',
      [actors.auraIssuer, auraAcquirer, 'AURA Travel Card'], 'Register AURA issuer');
  await advanceLocalTime(session);
  const ramping = asBoolean(await readContractValue(
      session, context.torna, torna.abi, 'isIssuerRamping', [actors.hybridIssuer]),
  'Torna.isIssuerRamping');
  if (ramping) throw new Error('Local time advance did not complete the 30-day issuer ramp period.');

  await depositCollateral(session, context, 'hybridIssuer', 3_000n * USDC);
  await depositCollateral(session, context, 'auraIssuer', 600n * USDC);
  await submitContract(session, 'deployer', context.asset, mockUsdc.abi, 'approve',
      [context.torna, 500n * USDC], 'Deployer approve reserve seed');
  await submitContract(session, 'deployer', context.torna, torna.abi, 'seedReserve',
      [500n * USDC], 'Seed protocol reserve');

  const now = await latestTimestamp(session);
  const advanceRequest: AdvanceRequest = {
    refundKey: keccak256(stringToHex('REF-2026-001')),
    issuer: actors.hybridIssuer,
    acquirerHash: hybridAcquirer,
    amount: ONE_THOUSAND_USDC,
    maturity: now + BigInt(FIVE_DAYS),
    nonce: asBigInt(await readContractValue(
        session, context.torna, torna.abi, 'advanceNonces', [actors.hybridIssuer]),
    'Torna.advanceNonces'),
    deadline: now + 10n * 60n,
  };
  const advanceSignature = await session.config.accounts.hybridIssuer.signTypedData({
    domain: tornaDomain(context.chainId, context.torna),
    types: advanceRequestTypes,
    primaryType: ADVANCE_REQUEST_PRIMARY_TYPE,
    message: advanceRequest,
  });
  const feeQuote = await readContractValue(
      session, context.torna, torna.abi, 'quoteAdvanceFee', [advanceRequest.amount]);
  const fee = Array.isArray(feeQuote) ? feeQuote[0] : undefined;
  if (typeof fee !== 'bigint') throw new Error('Torna.quoteAdvanceFee returned an invalid fee.');
  const feePermit = await permitFor(
      session, 'hybridIssuer', context.asset, context.torna, fee, advanceRequest.deadline);
  const advance = await submitContract(session, 'submitter', context.torna, torna.abi,
      'advanceWithPermit', [advanceRequest, advanceSignature, feePermit], 'Issue t0 advance');
  await verifyIssued(session, context, advance, advanceRequest);

  const repaymentNow = await latestTimestamp(session);
  const repaymentRequest: RepaymentRequest = {
    refundKey: advanceRequest.refundKey,
    issuer: actors.hybridIssuer,
    amount: advanceRequest.amount,
    nonce: asBigInt(await readContractValue(
        session, context.torna, torna.abi, 'repaymentNonces', [actors.hybridIssuer]),
    'Torna.repaymentNonces'),
    deadline: repaymentNow + 10n * 60n,
  };
  const repaymentSignature = await session.config.accounts.hybridIssuer.signTypedData({
    domain: tornaDomain(context.chainId, context.torna),
    types: repaymentRequestTypes,
    primaryType: REPAYMENT_REQUEST_PRIMARY_TYPE,
    message: repaymentRequest,
  });
  const repaymentPermit = await permitFor(
      session, 'hybridIssuer', context.asset, context.torna,
      repaymentRequest.amount, repaymentRequest.deadline);
  const repayment = await submitContract(session, 'submitter', context.torna, torna.abi,
      'repayWithPermit', [repaymentRequest, repaymentSignature, repaymentPermit], 'Repay t0 advance');
  await verifyRepaid(session, context, repayment, repaymentRequest);
  const position = await readContractValue(
      session, context.torna, torna.abi, 'positionOf', [advanceRequest.refundKey], repayment.blockNumber);
  assertRepaidT0Position(position, advanceRequest);
  assertT0FinalAccounting(await readT0FinalAccounting(session, context, repayment.blockNumber));
  context.t0 = {
    refundKey: advanceRequest.refundKey,
    acquirerHash: hybridAcquirer,
    advance,
    repayment,
  };
  return { timepointId: 't0', blockNumber: repayment.blockNumber };
}

/** Full scenarios stay blocked until their own receipt-checked handlers exist. */
export async function executeScenario(_context: T0RunContext, _id: TimepointId): Promise<CapturePoint> {
  throw new FullScenarioNotImplementedError();
}
