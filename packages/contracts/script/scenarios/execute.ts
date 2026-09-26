import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseEventLogs,
  parseSignature,
  stringToHex,
  type Abi,
  type Address,
  type Hex,
} from 'viem';

import {
  acquirerHashOf,
  advanceRefund,
  processRefund,
  repayRefund,
  refundKeyOf,
  runLedgerRetryJob,
  type AdvanceOutcome,
  type Deployment,
  type RefundRow,
} from '@torna/adapter';

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
import { ADVANCE_REJECTION, DEPOSIT_REJECTION } from '../../../../shared/abi/reasons';
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
import type {T7LedgerIO} from '../runtime/ledger';
import type { CapturePoint, ConfirmedTransaction, T0RunContext } from '../runtime/types';

const USDC = 1_000_000n;
const ONE_THOUSAND_USDC = 1_000n * USDC;
const FIVE_DAYS = 5 * 24 * 60 * 60;
const DEMO_MATURITY_SECONDS = 120;

type LocalIssuerActor =
    'hybridIssuer'|'auraIssuer'|'novaIssuer'|'meridianIssuer'|'kiteIssuer';

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
  'exempt HYBRID and AURA from the bootstrap ramp',
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

function asHex(value: unknown, name: string): Hex {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} returned an invalid bytes32 value.`);
  }
  return value as Hex;
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
  const stateIndex = typeof state === 'bigint' ? Number(state) : state;
  const sameIssuer = typeof issuer === 'string'
    && issuer.toLowerCase() === request.issuer.toLowerCase();
  if (exists !== true || !sameIssuer || amount !== request.amount || stateIndex !== 2) {
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
    owner: LocalIssuerActor,
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

export async function verifyRejected(
    session: LocalT0Session,
    context: T0RunContext,
    transaction: ConfirmedTransaction,
    request: AdvanceRequest,
    reason: number,
): Promise<void> {
  const receipt = await session.publicClient.getTransactionReceipt({hash: transaction.hash});
  const rejected = parseEventLogs({
    abi: tornaEvents,
    eventName: 'AdvanceRejected',
    logs: receipt.logs,
  });
  const issued = parseEventLogs({
    abi: tornaEvents,
    eventName: 'AdvanceIssued',
    logs: receipt.logs,
  });
  if (rejected.length !== 1 || issued.length !== 0
      || rejected[0]?.address.toLowerCase() !== context.torna.toLowerCase()
      || rejected[0].args.refundKey !== request.refundKey
      || rejected[0].args.reason !== reason) {
    throw new ReceiptEventMismatchError('AdvanceRejected');
  }
}

export async function verifyLiquidityDeposit(
    session: LocalT0Session,
    context: T0RunContext,
    transaction: ConfirmedTransaction,
    lp: Address,
    acceptedAmount: bigint,
    rejectedAmount: bigint,
    rejectionReason: number,
): Promise<void> {
  const receipt = await session.publicClient.getTransactionReceipt({hash: transaction.hash});
  const deposits = parseEventLogs({
    abi: tornaEvents, eventName: 'LiquidityDeposited', logs: receipt.logs,
  });
  const rejections = parseEventLogs({
    abi: tornaEvents, eventName: 'DepositRejected', logs: receipt.logs,
  });
  if (deposits.length !== 1 || rejections.length !== 1
      || deposits[0]?.address.toLowerCase() !== context.torna.toLowerCase()
      || deposits[0].args.lp?.toLowerCase() !== lp.toLowerCase()
      || deposits[0].args.amount !== acceptedAmount
      || rejections[0]?.address.toLowerCase() !== context.torna.toLowerCase()
      || rejections[0].args.lp?.toLowerCase() !== lp.toLowerCase()
      || rejections[0].args.amount !== rejectedAmount
      || rejections[0].args.reason !== rejectionReason) {
    throw new ReceiptEventMismatchError('LiquidityDeposited/DepositRejected');
  }
}

async function increaseLocalTime(session: LocalT0Session, seconds: number): Promise<void> {
  const current = await session.publicClient.getBlock();
  const target = current.timestamp + BigInt(seconds);
  if (session.target === 'testnet') {
    while (true) {
      const latest = await session.publicClient.getBlock();
      if (latest.timestamp >= target) return;
      await new Promise(resolve => setTimeout(resolve, 5_000));
    }
  }
  if (!Number.isSafeInteger(Number(target))) throw new Error('Local timestamp exceeds safe range.');
  const request = session.publicClient.request as unknown as (args: {
    method: string;
    params?: readonly unknown[];
  }) => Promise<unknown>;
  await request({ method: 'evm_setNextBlockTimestamp', params: [Number(target)] });
  await request({ method: 'evm_mine', params: [] });
  const mined = await session.publicClient.getBlock();
  if (mined.timestamp < target) throw new Error('Local EVM did not reach the requested timestamp.');
}

async function depositCollateral(
    session: LocalT0Session,
    context: T0RunContext,
    actor: LocalIssuerActor,
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

function adapterClients(session: LocalT0Session) {
  return {
    publicClient: createPublicClient({transport: http(session.config.rpcUrl), pollingInterval: 100}),
    submitter: createWalletClient({
      account: session.config.accounts.submitter,
      transport: http(session.config.rpcUrl),
    }),
  };
}

/** Execute t0 through C's adapter; a DB-backed run records a lost response. */
export async function executeT0(
    session: LocalT0Session, context: T0RunContext, ledger?: T7LedgerIO): Promise<CapturePoint> {
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
  for (const actor of [actors.hybridIssuer, actors.auraIssuer]) {
    await submitContract(session, 'deployer', context.torna, torna.abi,
        'exemptBootstrapIssuerFromRamp', [actor], 'Record bootstrap ramp exemption');
    const ramping = asBoolean(await readContractValue(
        session, context.torna, torna.abi, 'isIssuerRamping', [actor]),
    'Torna.isIssuerRamping');
    if (ramping) throw new Error('Bootstrap issuer still has the 30-day ramp limit.');
  }

  await depositCollateral(session, context, 'hybridIssuer', 3_000n * USDC);
  await depositCollateral(session, context, 'auraIssuer', 600n * USDC);
  await submitContract(session, 'deployer', context.asset, mockUsdc.abi, 'approve',
      [context.torna, 500n * USDC], 'Deployer approve reserve seed');
  await submitContract(session, 'deployer', context.torna, torna.abi, 'seedReserve',
      [500n * USDC], 'Seed protocol reserve');

  const deployment: Deployment = {chainId: context.chainId, torna: context.torna, asset: context.asset};
  const clients = adapterClients(session);
  // Chain-only rehearsals use the 10.6 fixture; DB-backed runs load this row
  // through C's ledger package before deployment.
  const fixture: RefundRow = {
    refund_id: 'REF-2026-001',
    issuer_id: 'HYBRID',
    acquirer_id: 'ACQ-α',
    amount: '1000.00',
    confirmed_at: '2026-09-14T10:22:00Z',
  };
  const row = ledger?.row ?? fixture;
  let issued: AdvanceOutcome;
  if (ledger) {
    let firstCreditCommitted = false;
    const result = await processRefund({
      clients, deployment, issuer: session.config.accounts.hybridIssuer, row,
      retryStore: ledger.store,
      creditLedger: async (key, amount, txHash) => {
        firstCreditCommitted = await ledger.creditLedger(key, amount, txHash);
        if (!firstCreditCommitted) throw new Error('t0 expected the first card-ledger credit.');
        // The DB commit happened, but the adapter did not receive its success response.
        throw new Error('simulated lost ledger response after committed credit');
      },
    });
    if (result.status !== 'issued' || !firstCreditCommitted || !result.retryQueued
        || result.credited !== false) {
      throw new Error('t0 did not queue the committed-but-unacknowledged ledger credit.');
    }
    const pending = await ledger.store.pending();
    if (pending.length !== 1 || pending[0]?.refundKey !== result.refundKey
        || pending[0].advanceTxHash !== result.txHash
        || await ledger.store.creditCount(result.refundKey) !== 1
        || await ledger.cardholderBalance() !== '1300.00') {
      throw new Error('t0 ledger credit or retry evidence differs from the approved scenario.');
    }
    issued = result;
  } else {
    issued = await advanceRefund({
      clients, deployment, issuer: session.config.accounts.hybridIssuer, row,
    });
  }
  if (issued.status !== 'issued') throw new Error(`Local t0 advance was ${issued.status}.`);
  const advanceRequest = issued.request;
  const advance: ConfirmedTransaction = {
    name: 'Issue t0 advance', hash: issued.txHash, blockNumber: issued.blockNumber,
  };
  await verifyIssued(session, context, advance, advanceRequest);

  const repaid = await repayRefund({
    clients, deployment, issuer: session.config.accounts.hybridIssuer, refundId: row.refund_id,
  });
  if (repaid.status !== 'repaid') throw new Error(`Local t0 repayment was ${repaid.status}.`);
  const repayment: ConfirmedTransaction = {
    name: 'Repay t0 advance', hash: repaid.txHash, blockNumber: repaid.blockNumber,
  };
  await verifyRepaid(session, context, repayment, repaid.request);
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
  context.scenario = {auraEvent: [], withdrawalAdvances: [], captureBlocks: {}};
  return { timepointId: 't0', blockNumber: repayment.blockNumber };
}

/** Recover only t0's queued DB acknowledgement; never submit another advance. */
async function executeT7(
    session: LocalT0Session, context: T0RunContext, ledger?: T7LedgerIO): Promise<CapturePoint> {
  if (!ledger || !context.t0) throw new FullScenarioNotImplementedError();
  const pending = await ledger.store.pending();
  if (pending.length !== 1 || pending[0]?.refundKey !== context.t0.refundKey
      || pending[0].advanceTxHash !== context.t0.advance.hash) {
    throw new Error('t7 requires only the t0 advance in the retry queue.');
  }
  const {torna} = loadProtocolArtifacts();
  const before = await readContractValue(session, context.torna, torna.abi, 'totalAdvanceCount');
  const outcomes = await runLedgerRetryJob({
    clients: adapterClients(session),
    deployment: {chainId: context.chainId, torna: context.torna, asset: context.asset},
    store: ledger.store,
  });
  const recovered = outcomes[0];
  if (outcomes.length !== 1 || recovered?.status !== 'confirmed'
      || recovered.refundKey !== context.t0.refundKey || recovered.credited !== false) {
    throw new Error('t7 did not confirm exactly one already-credited refund.');
  }
  if (await ledger.store.creditCount(context.t0.refundKey) !== 1
      || await ledger.cardholderBalance() !== '1300.00'
      || (await ledger.store.pending()).length !== 0
      || (await runLedgerRetryJob({
        clients: adapterClients(session),
        deployment: {chainId: context.chainId, torna: context.torna, asset: context.asset},
        store: ledger.store,
      })).length !== 0
      || await readContractValue(session, context.torna, torna.abi, 'totalAdvanceCount') !== before) {
    throw new Error('t7 retried an advance, duplicated a credit, or left a retry pending.');
  }
  return {timepointId: 't7', blockNumber: recovered.blockNumber};
}

interface IssuedAdvance {
  request: AdvanceRequest;
  transaction: ConfirmedTransaction;
}

function scenarioState(context: T0RunContext): NonNullable<T0RunContext['scenario']> {
  if (!context.scenario) {
    context.scenario = {auraEvent: [], withdrawalAdvances: [], captureBlocks: {}};
  }
  return context.scenario;
}

async function issueAdvance(
    session: LocalT0Session,
    context: T0RunContext,
    issuerActor: LocalIssuerActor,
    refundKey: Hex,
    acquirerHash: Hex,
    maturitySeconds = FIVE_DAYS,
): Promise<IssuedAdvance> {
  const {torna} = loadProtocolArtifacts();
  const issuer = session.config.accounts[issuerActor];
  const now = await latestTimestamp(session);
  const request: AdvanceRequest = {
    refundKey,
    issuer: issuer.address,
    acquirerHash,
    amount: ONE_THOUSAND_USDC,
    maturity: now + BigInt(maturitySeconds),
    nonce: asBigInt(await readContractValue(
        session, context.torna, torna.abi, 'advanceNonces', [issuer.address]),
    'Torna.advanceNonces'),
    deadline: now + 10n * 60n,
  };
  const signature = await issuer.signTypedData({
    domain: tornaDomain(context.chainId, context.torna),
    types: advanceRequestTypes,
    primaryType: ADVANCE_REQUEST_PRIMARY_TYPE,
    message: request,
  });
  const feeQuote = await readContractValue(
      session, context.torna, torna.abi, 'quoteAdvanceFee', [request.amount]);
  const fee = Array.isArray(feeQuote) ? feeQuote[0] : undefined;
  if (typeof fee !== 'bigint') throw new Error('Torna.quoteAdvanceFee returned an invalid fee.');
  const feePermit = await permitFor(
      session, issuerActor, context.asset, context.torna, fee, request.deadline);
  const transaction = await submitContract(
      session, 'submitter', context.torna, torna.abi, 'advanceWithPermit',
      [request, signature, feePermit], `Issue ${refundKey}`);
  await verifyIssued(session, context, transaction, request);
  return {request, transaction};
}

async function repayAdvance(
    session: LocalT0Session,
    context: T0RunContext,
    issuerActor: LocalIssuerActor,
    refundKey: Hex,
): Promise<ConfirmedTransaction> {
  const {torna} = loadProtocolArtifacts();
  const issuer = session.config.accounts[issuerActor];
  const now = await latestTimestamp(session);
  const request: RepaymentRequest = {
    refundKey,
    issuer: issuer.address,
    amount: ONE_THOUSAND_USDC,
    nonce: asBigInt(await readContractValue(
        session, context.torna, torna.abi, 'repaymentNonces', [issuer.address]),
    'Torna.repaymentNonces'),
    deadline: now + 10n * 60n,
  };
  const signature = await issuer.signTypedData({
    domain: tornaDomain(context.chainId, context.torna),
    types: repaymentRequestTypes,
    primaryType: REPAYMENT_REQUEST_PRIMARY_TYPE,
    message: request,
  });
  const permit = await permitFor(
      session, issuerActor, context.asset, context.torna, request.amount, request.deadline);
  const transaction = await submitContract(
      session, 'submitter', context.torna, torna.abi, 'repayWithPermit',
      [request, signature, permit], `Repay ${refundKey}`);
  await verifyRepaid(session, context, transaction, request);
  return transaction;
}

async function review(
    session: LocalT0Session,
    context: T0RunContext,
    refundKey: Hex,
    evidence: string,
): Promise<ConfirmedTransaction> {
  const {torna} = loadProtocolArtifacts();
  return submitContract(
      session, 'verifier', context.torna, torna.abi, 'openReview',
      [refundKey, evidence], `Open review ${refundKey}`);
}

async function finalizeLoss(
    session: LocalT0Session,
    context: T0RunContext,
    refundKey: Hex,
): Promise<ConfirmedTransaction> {
  const {torna} = loadProtocolArtifacts();
  return submitContract(
      session, 'verifier', context.torna, torna.abi, 'finalizeCoveredLoss',
      [refundKey], `Finalize loss ${refundKey}`);
}

function seededScenarioRow(
    ledger: T7LedgerIO|undefined, refundId: string, timepoint: TimepointId,
    issuerId: string, acquirerId: string,
): NonNullable<T7LedgerIO['scenarioRows']>[number]|undefined {
  if (!ledger?.scenarioRows) return undefined;
  const row = ledger.scenarioRows.find(item => item.refund_id === refundId);
  if (!row || row.timepoint !== timepoint || row.issuer_id !== issuerId
      || row.acquirer_id !== acquirerId || row.amount !== '1000.00'
      || row.refund_key !== refundKeyOf(refundId)) {
    throw new Error(`${timepoint} requires the seeded ${refundId} refund and adapter-derived key.`);
  }
  return row;
}

async function executeT1(
    session: LocalT0Session, context: T0RunContext, ledger?: T7LedgerIO): Promise<CapturePoint> {
  if (!context.t0) throw new FullScenarioNotImplementedError();
  const {mockUsdc} = loadProtocolArtifacts();
  // Preserve the exact t0 wallet balances, then fund only the remaining t1-through-t5 fees.
  await submitContract(
      session, 'deployer', context.asset, mockUsdc.abi, 'mint',
      [context.actors.hybridIssuer, 110n * USDC], 'Mint remaining HYBRID scenario fees');
  await submitContract(
      session, 'deployer', context.asset, mockUsdc.abi, 'mint',
      [context.actors.auraIssuer, ledger?.scenarioRows ? 600n * USDC : 12n * USDC],
      'Mint AURA scenario fees');
  const seeded = ledger?.scenarioRows?.filter(row => row.timepoint === 't1');
  const yearlyRows = seeded && [
    ...seeded.filter(row => row.refund_id !== 'REF-2026-021'),
    ...seeded.filter(row => row.refund_id === 'REF-2026-021'),
  ];
  if (yearlyRows && (yearlyRows.length !== 365
      || yearlyRows.at(-1)?.refund_id !== 'REF-2026-021')) {
    throw new Error('t1 requires 365 seeded refunds with REF-2026-021 last.');
  }
  let finalTransaction: ConfirmedTransaction|undefined;
  let yearlyLoss: Hex|undefined;
  for (let index = 0; index < 365; index += 1) {
    const row = yearlyRows?.[index];
    const refundKey = row ? refundKeyOf(row.refund_id)
      : keccak256(stringToHex(`REF-LOCAL-YEAR-${String(index + 1).padStart(3, '0')}`));
    if (row && (row.refund_key !== refundKey || row.amount !== '1000.00'
        || (row.issuer_id !== 'HYBRID' && row.issuer_id !== 'AURA')
        || row.acquirer_id !== (row.issuer_id === 'HYBRID' ? 'ACQ-α' : 'ACQ-β'))) {
      throw new Error(`t1 seeded refund ${row.refund_id} has invalid chain inputs.`);
    }
    const issuerActor = row?.issuer_id === 'AURA' ? 'auraIssuer' : 'hybridIssuer';
    const acquirerHash = row ? acquirerHashOf(row.acquirer_id) : context.t0.acquirerHash;
    const issued = await issueAdvance(
        session, context, issuerActor, refundKey, acquirerHash,
        index === 364 ? DEMO_MATURITY_SECONDS : FIVE_DAYS);
    finalTransaction = issued.transaction;
    if (index < 364) {
      finalTransaction = await repayAdvance(session, context, issuerActor, refundKey);
    } else {
      yearlyLoss = refundKey;
    }
  }
  if (!yearlyLoss || !finalTransaction) throw new Error('t1 did not create its reviewed position.');
  await increaseLocalTime(session, DEMO_MATURITY_SECONDS + 1);
  finalTransaction = await review(
      session, context, yearlyLoss, 'Upstream settlement agent non-receipt confirmation');
  scenarioState(context).yearlyLoss = yearlyLoss;
  return {timepointId: 't1', blockNumber: finalTransaction.blockNumber};
}

async function executeT2(
    session: LocalT0Session, context: T0RunContext): Promise<CapturePoint> {
  const refundKey = scenarioState(context).yearlyLoss;
  if (!refundKey) throw new Error('t2 requires the t1 reviewed position.');
  const transaction = await finalizeLoss(session, context, refundKey);
  return {timepointId: 't2', blockNumber: transaction.blockNumber};
}

async function executeT3(
    session: LocalT0Session, context: T0RunContext, ledger?: T7LedgerIO): Promise<CapturePoint> {
  const auraAcquirer = keccak256(stringToHex('ACQ-β'));
  const keys: Hex[] = [];
  for (let index = 0; index < 4; index += 1) {
    const seededId = `REF-2026-${String(index + 31).padStart(3, '0')}`;
    const row = seededScenarioRow(ledger, seededId, 't3', 'AURA', 'ACQ-β');
    const key = row ? refundKeyOf(row.refund_id)
      : keccak256(stringToHex(`REF-LOCAL-AURA-${index + 1}`));
    await issueAdvance(session, context, 'auraIssuer', key, auraAcquirer,
        DEMO_MATURITY_SECONDS);
    keys.push(key);
  }
  await increaseLocalTime(session, DEMO_MATURITY_SECONDS + 1);
  let finalTransaction: ConfirmedTransaction|undefined;
  for (const key of keys) {
    await review(session, context, key, 'Acquirer beta stopped settling');
    finalTransaction = await finalizeLoss(session, context, key);
  }
  if (!finalTransaction) throw new Error('t3 did not finalize its loss event.');
  scenarioState(context).auraEvent = keys;
  return {timepointId: 't3', blockNumber: finalTransaction.blockNumber};
}

async function executeT3b(
    session: LocalT0Session, context: T0RunContext): Promise<CapturePoint> {
  const keys = scenarioState(context).auraEvent;
  if (keys.length !== 4) throw new Error('t3b requires the four-position t3 event.');
  const {mockUsdc, torna} = loadProtocolArtifacts();
  await submitContract(
      session, 'deployer', context.asset, mockUsdc.abi, 'mint',
      [context.actors.verifier, 2_200n * USDC], 'Mint local recovery funds');
  await submitContract(
      session, 'verifier', context.asset, mockUsdc.abi, 'approve',
      [context.torna, 2_200n * USDC], 'Approve recovery funds');
  const transaction = await submitContract(
      session, 'verifier', context.torna, torna.abi, 'recordRecovery',
      [keys[0], 2_200n * USDC], 'Record t3b recovery');
  return {timepointId: 't3b', blockNumber: transaction.blockNumber};
}

async function executeT4(
    session: LocalT0Session, context: T0RunContext, ledger?: T7LedgerIO): Promise<CapturePoint> {
  if (!context.t0) throw new Error('t4 requires t0 issuer metadata.');
  const keys: Hex[] = [];
  for (let index = 0; index < 4; index += 1) {
    const seededId = `REF-2026-${170 + index}`;
    const row = seededScenarioRow(ledger, seededId, 't4', 'HYBRID', 'ACQ-α');
    const key = row ? refundKeyOf(row.refund_id)
      : keccak256(stringToHex(`REF-LOCAL-WITHDRAW-${index + 1}`));
    await issueAdvance(session, context, 'hybridIssuer', key, context.t0.acquirerHash);
    keys.push(key);
  }
  const {torna} = loadProtocolArtifacts();
  const transaction = await submitContract(
      session, 'lp03', context.torna, torna.abi, 'requestWithdraw',
      [2_000n * USDC], 'Request LP-03 withdrawal');
  scenarioState(context).withdrawalAdvances = keys;
  return {timepointId: 't4', blockNumber: transaction.blockNumber};
}

async function executeT4b(
    session: LocalT0Session, context: T0RunContext): Promise<CapturePoint> {
  const keys = scenarioState(context).withdrawalAdvances;
  if (keys.length !== 4) throw new Error('t4b requires the four t4 advances.');
  const {torna} = loadProtocolArtifacts();
  await submitContract(
      session, 'submitter', context.torna, torna.abi, 'processWithdrawal', [],
      'Pay LP-03 immediate withdrawal quote');
  let transaction: ConfirmedTransaction|undefined;
  for (let index = 0; index < 3; index += 1) {
    transaction = await repayAdvance(session, context, 'hybridIssuer', keys[index]!);
  }
  if (!transaction) throw new Error('t4b did not repay its three matured advances.');
  return {timepointId: 't4b', blockNumber: transaction.blockNumber};
}

async function executeT5(
    session: LocalT0Session, context: T0RunContext, ledger?: T7LedgerIO): Promise<CapturePoint> {
  if (!context.t0) throw new Error('t5 requires t0 issuer metadata.');
  const row = seededScenarioRow(ledger, 'REF-2026-014', 't5', 'HYBRID', 'ACQ-α');
  const refundKey = row ? refundKeyOf(row.refund_id)
    : keccak256(stringToHex('REF-LOCAL-DELAYED'));
  await issueAdvance(session, context, 'hybridIssuer', refundKey, context.t0.acquirerHash,
      DEMO_MATURITY_SECONDS);
  await increaseLocalTime(session, DEMO_MATURITY_SECONDS + 1);
  await review(session, context, refundKey, 'Delayed upstream settlement');
  const transaction = await repayAdvance(session, context, 'hybridIssuer', refundKey);
  scenarioState(context).delayedRepayment = refundKey;
  return {timepointId: 't5', blockNumber: transaction.blockNumber};
}

async function executeT6(
    session: LocalT0Session, context: T0RunContext): Promise<CapturePoint> {
  const {mockUsdc, torna} = loadProtocolArtifacts();
  const vault = context.actors.idleVault;
  const amount = 3_638_880_000n;
  const readPool = (name: string) => readContractValue(
      session, context.torna, torna.abi, name);
  const readBalance = (owner: Address) => readContractValue(
      session, context.asset, mockUsdc.abi, 'balanceOf', [owner]);

  const [navValue, capacityValue, poolValue, vaultValue, allowanceValue] = await Promise.all([
    readPool('netAssetValue'), readPool('poolCapacity'), readBalance(context.torna),
    readBalance(vault), readContractValue(
        session, context.asset, mockUsdc.abi, 'allowance', [vault, context.torna]),
  ]);
  const nav = asBigInt(navValue, 'Torna.netAssetValue');
  const capacity = asBigInt(capacityValue, 'Torna.poolCapacity');
  const poolBefore = asBigInt(poolValue, 'MockUSDC.balanceOf(Torna)');
  const vaultBefore = asBigInt(vaultValue, 'MockUSDC.balanceOf(idleVault)');
  if (nav !== 7_638_584_000n || capacity !== nav || vaultBefore !== 0n
      || allowanceValue !== 0n || amount > nav / 2n) {
    throw new Error('t6 requires the exact t5 NAV, an empty external EOA and no recall approval.');
  }

  const role = asHex(await readPool('TREASURY_ROLE'), 'Torna.TREASURY_ROLE');
  await submitContract(session, 'deployer', context.torna, torna.abi, 'setIdleVault',
      [vault], 'Set the external idle EOA');
  await submitContract(session, 'deployer', context.torna, torna.abi, 'grantRole',
      [role, context.actors.deployer], 'Grant separate treasury role');
  await verifyRole(session, context, role, context.actors.deployer);

  const deployed = await submitContract(session, 'deployer', context.torna, torna.abi,
      'deployIdle', [amount], 'Transfer idle liquidity to external EOA');
  const deployedReceipt = await session.publicClient.getTransactionReceipt({hash: deployed.hash});
  const deploymentEvents = parseEventLogs({
    abi: tornaEvents, eventName: 'IdleDeployed', logs: deployedReceipt.logs,
  });
  const [poolAfterDeployValue, vaultAfterDeployValue, capacityAfterDeployValue] =
      await Promise.all([readBalance(context.torna), readBalance(vault), readPool('poolCapacity')]);
  if (deploymentEvents.length !== 1
      || deploymentEvents[0]?.address.toLowerCase() !== context.torna.toLowerCase()
      || deploymentEvents[0].args.amount !== amount
      || poolAfterDeployValue !== poolBefore - amount
      || vaultAfterDeployValue !== vaultBefore + amount
      || capacityAfterDeployValue !== nav - amount
      || await readPool('externalDeployed') !== amount) {
    throw new Error('t6 deployment receipt, token balances or available capacity did not agree.');
  }

  // The EOA does not approve Torna. MockUSDC.transferFrom naturally reverts.
  const failedRecall = await submitContract(session, 'deployer', context.torna, torna.abi,
      'recallIdle', [amount], 'Record failed external liquidity recall');
  const recallReceipt = await session.publicClient.getTransactionReceipt({hash: failedRecall.hash});
  const failureEvents = parseEventLogs({
    abi: tornaEvents, eventName: 'IdleWithdrawFailed', logs: recallReceipt.logs,
  });
  const [poolAfterRecall, vaultAfterRecall, deployedAfter, frozenAfter, navAfter] =
      await Promise.all([
        readBalance(context.torna), readBalance(vault), readPool('externalDeployed'),
        readPool('externalFrozen'), readPool('netAssetValue'),
      ]);
  if (failureEvents.length !== 1
      || failureEvents[0]?.address.toLowerCase() !== context.torna.toLowerCase()
      || failureEvents[0].args.amount !== amount
      || poolAfterRecall !== poolAfterDeployValue || vaultAfterRecall !== vaultAfterDeployValue
      || deployedAfter !== amount || frozenAfter !== true || navAfter !== nav) {
    throw new Error('t6 failed recall must leave funds outside and freeze future deployment.');
  }
  return {timepointId: 't6', blockNumber: failedRecall.blockNumber};
}

async function executeT8(
    session: LocalT0Session, context: T0RunContext): Promise<CapturePoint> {
  if (!context.t0) throw new Error('t8 requires the previously used t0 refund key.');
  const {torna} = loadProtocolArtifacts();
  const now = await latestTimestamp(session);
  const before = await Promise.all([
    'totalAdvanceCount', 'totalAdvanced', 'totalOutstanding', 'totalLpFees',
    'reserveBalance', 'protocolFees',
  ].map(name => readContractValue(session, context.torna, torna.abi, name)));
  const cases = [
    {
      actor: 'hybridIssuer',
      refundKey: context.t0.refundKey,
      acquirerHash: context.t0.acquirerHash,
      deadline: now + 10n * 60n,
      reason: ADVANCE_REJECTION.DuplicateRefundKey,
      wrongDomain: false,
    },
    {
      actor: 'novaIssuer',
      refundKey: keccak256(stringToHex('REF-UNKNOWN-99')),
      acquirerHash: keccak256(stringToHex('ACQ-γ')),
      deadline: now + 10n * 60n,
      reason: ADVANCE_REJECTION.UnregisteredIssuer,
      wrongDomain: false,
    },
    {
      actor: 'hybridIssuer',
      refundKey: keccak256(stringToHex('REF-2026-045')),
      acquirerHash: context.t0.acquirerHash,
      deadline: now + 10n * 60n,
      // A wrong chain/verifying contract is observable as InvalidSignature (code 3).
      reason: ADVANCE_REJECTION.InvalidSignature,
      wrongDomain: true,
    },
  ] as const;
  let finalTransaction: ConfirmedTransaction|undefined;
  for (const rejectedCase of cases) {
    const issuer = session.config.accounts[rejectedCase.actor];
    const nonce = asBigInt(await readContractValue(
        session, context.torna, torna.abi, 'advanceNonces', [issuer.address]),
    'Torna.advanceNonces');
    const request: AdvanceRequest = {
      refundKey: rejectedCase.refundKey,
      issuer: issuer.address,
      acquirerHash: rejectedCase.acquirerHash,
      amount: ONE_THOUSAND_USDC,
      maturity: now + BigInt(FIVE_DAYS),
      nonce,
      deadline: rejectedCase.deadline,
    };
    const signature = await issuer.signTypedData({
      domain: tornaDomain(
          rejectedCase.wrongDomain ? context.chainId + 1 : context.chainId,
          rejectedCase.wrongDomain ? context.asset : context.torna),
      types: advanceRequestTypes,
      primaryType: ADVANCE_REQUEST_PRIMARY_TYPE,
      message: request,
    });
    finalTransaction = await submitContract(
        session, 'submitter', context.torna, torna.abi, 'advance',
        [request, signature], `Reject t8 request ${request.refundKey}`);
    await verifyRejected(
        session, context, finalTransaction, request, rejectedCase.reason);
    const nonceAfter = asBigInt(await readContractValue(
        session, context.torna, torna.abi, 'advanceNonces', [issuer.address]),
    'Torna.advanceNonces');
    if (nonceAfter !== nonce) throw new Error('A rejected t8 request consumed an issuer nonce.');
  }
  const after = await Promise.all([
    'totalAdvanceCount', 'totalAdvanced', 'totalOutstanding', 'totalLpFees',
    'reserveBalance', 'protocolFees',
  ].map(name => readContractValue(session, context.torna, torna.abi, name)));
  if (before.some((value, index) => value !== after[index])) {
    throw new Error('A rejected t8 request changed protocol accounting.');
  }
  if (!finalTransaction) throw new Error('t8 did not submit all three rejected requests.');
  return {timepointId: 't8', blockNumber: finalTransaction.blockNumber};
}

async function executeT9(
    session: LocalT0Session, context: T0RunContext): Promise<CapturePoint> {
  const {mockUsdc, torna} = loadProtocolArtifacts();
  const additions = [
    {actor: 'novaIssuer', name: 'NOVA Travel Card', acquirer: 'ACQ-γ', collateral: 900n * USDC},
    {actor: 'meridianIssuer', name: 'MERIDIAN Travel Card', acquirer: 'ACQ-δ', collateral: 750n * USDC},
    {actor: 'kiteIssuer', name: 'KITE Travel Card', acquirer: 'ACQ-ε', collateral: 600n * USDC},
  ] as const;
  const issuerCount = asBigInt(await readContractValue(
      session, context.torna, torna.abi, 'registeredIssuerCount'),
  'Torna.registeredIssuerCount');
  const advanceCount = asBigInt(await readContractValue(
      session, context.torna, torna.abi, 'totalAdvanceCount'),
  'Torna.totalAdvanceCount');
  for (const [index, addition] of additions.entries()) {
    const issuer = session.config.accounts[addition.actor];
    const acquirerHash = keccak256(stringToHex(addition.acquirer));
    await submitContract(session, 'deployer', context.torna, torna.abi, 'registerIssuer',
        [issuer.address, acquirerHash, addition.name], `Register ${addition.name}`);
    await submitContract(session, 'deployer', context.asset, mockUsdc.abi, 'mint',
        [issuer.address, addition.collateral + (index < 2 ? 3n * USDC : 0n)],
        `Fund ${addition.name} collateral and fee`);
    await depositCollateral(session, context, addition.actor, addition.collateral);
    const ramping = asBoolean(await readContractValue(
        session, context.torna, torna.abi, 'isIssuerRamping', [issuer.address]),
    'Torna.isIssuerRamping');
    const deposited = asBigInt(await readContractValue(
        session, context.torna, torna.abi, 'collateralOf', [issuer.address]),
    'Torna.collateralOf');
    if (!ramping || deposited !== addition.collateral) {
      throw new Error(`${addition.name} was not registered with its expected collateral.`);
    }
  }
  const nova = additions[0];
  const meridian = additions[1];
  await issueAdvance(session, context, nova.actor,
      keccak256(stringToHex('REF-2026-210')), keccak256(stringToHex(nova.acquirer)));
  const finalAdvance = await issueAdvance(session, context, meridian.actor,
      keccak256(stringToHex('REF-2026-211')), keccak256(stringToHex(meridian.acquirer)));
  const issuerCountAfter = asBigInt(await readContractValue(
      session, context.torna, torna.abi, 'registeredIssuerCount'),
  'Torna.registeredIssuerCount');
  const advanceCountAfter = asBigInt(await readContractValue(
      session, context.torna, torna.abi, 'totalAdvanceCount'),
  'Torna.totalAdvanceCount');
  if (issuerCountAfter !== issuerCount + 3n || advanceCountAfter !== advanceCount + 2n) {
    throw new Error('t9 did not register three issuers and issue two advances.');
  }
  return {timepointId: 't9', blockNumber: finalAdvance.transaction.blockNumber};
}

async function executeT9b(
    session: LocalT0Session, context: T0RunContext): Promise<CapturePoint> {
  const {mockUsdc, torna} = loadProtocolArtifacts();
  const startingPrincipal = asBigInt(await readContractValue(
      session, context.torna, torna.abi, 'totalLpPrincipal'), 'Torna.totalLpPrincipal');
  const outstanding = asBigInt(await readContractValue(
      session, context.torna, torna.abi, 'totalOutstanding'), 'Torna.totalOutstanding');
  if (startingPrincipal !== 8_000n * USDC || outstanding !== 3_000n * USDC) {
    throw new Error('t9b requires the t9 deposit and outstanding state.');
  }
  const applications = [
    {
      actor: 'lp04', requested: 12_000n * USDC, accepted: 4_166_666_666n,
      reason: DEPOSIT_REJECTION.ConcentrationExceeded,
    },
    {
      actor: 'lp05', requested: 6_000n * USDC, accepted: 4_166_666_666n,
      reason: DEPOSIT_REJECTION.ConcentrationExceeded,
    },
    {
      actor: 'lp06', requested: 4_000n * USDC, accepted: 333_333_334n,
      reason: DEPOSIT_REJECTION.DepositCapExceeded,
    },
  ] as const;
  let totalAccepted = 0n;
  let finalTransaction: ConfirmedTransaction|undefined;
  for (const application of applications) {
    const lp = session.config.accounts[application.actor].address;
    const room = asBigInt(await readContractValue(
        session, context.torna, torna.abi, 'liquidityDepositRoom', [lp]),
    'Torna.liquidityDepositRoom');
    if (room !== application.accepted) {
      throw new Error(`${application.actor} t9b deposit room differs from the approved formula.`);
    }
    await submitContract(session, 'deployer', context.asset, mockUsdc.abi, 'mint',
        [lp, application.requested], `Fund ${application.actor} local deposit`);
    await submitContract(session, application.actor, context.asset, mockUsdc.abi, 'approve',
        [context.torna, application.requested], `Approve ${application.actor} local deposit`);
    const balanceBefore = asBigInt(await readContractValue(
        session, context.asset, mockUsdc.abi, 'balanceOf', [lp]), 'MockUSDC.balanceOf');
    finalTransaction = await submitContract(
        session, application.actor, context.torna, torna.abi, 'depositLiquidity',
        [application.requested], `Partially accept ${application.actor} deposit`);
    await verifyLiquidityDeposit(
        session, context, finalTransaction, lp, application.accepted,
        application.requested - application.accepted, application.reason);
    totalAccepted += application.accepted;
    const [principal, balance, totalPrincipal] = await Promise.all([
      readContractValue(session, context.torna, torna.abi, 'lpPrincipal', [lp]),
      readContractValue(session, context.asset, mockUsdc.abi, 'balanceOf', [lp]),
      readContractValue(session, context.torna, torna.abi, 'totalLpPrincipal'),
    ]);
    if (principal !== application.accepted
        || balance !== balanceBefore - application.accepted
        || totalPrincipal !== startingPrincipal + totalAccepted) {
      throw new Error(`${application.actor} t9b deposit accounting differs from its receipt.`);
    }
  }
  if (totalAccepted !== 8_666_666_666n || startingPrincipal + totalAccepted !== 16_666_666_666n
      || !finalTransaction) {
    throw new Error('t9b did not finish at the exact six-decimal pool deposit cap.');
  }
  return {timepointId: 't9b', blockNumber: finalTransaction.blockNumber};
}

/** Execute receipt-checked handlers; t7 additionally requires private DB IO. */
export async function executeScenario(
    session: LocalT0Session, context: T0RunContext, id: TimepointId,
    ledger?: T7LedgerIO): Promise<CapturePoint> {
  switch (id) {
    case 't0': return executeT0(session, context, ledger);
    case 't1': return executeT1(session, context, ledger);
    case 't2': return executeT2(session, context);
    case 't3': return executeT3(session, context, ledger);
    case 't3b': return executeT3b(session, context);
    case 't4': return executeT4(session, context, ledger);
    case 't4b': return executeT4b(session, context);
    case 't5': return executeT5(session, context, ledger);
    case 't6': return executeT6(session, context);
    case 't7': return executeT7(session, context, ledger);
    case 't8': return executeT8(session, context);
    case 't9': return executeT9(session, context);
    case 't9b': return executeT9b(session, context);
    default: throw new FullScenarioNotImplementedError();
  }
}
