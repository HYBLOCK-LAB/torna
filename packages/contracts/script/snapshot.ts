import {access, mkdir, writeFile} from 'node:fs/promises';
import {relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import {parseEventLogs, type Address, type Hex} from 'viem';

import {
  TIMEPOINT_ORDER,
  type EventLogEntry,
  type IssuerSnapshot,
  type LiquidityProviderSnapshot,
  type PositionSnapshot,
  type PositionState,
  type Snapshot,
  type TimepointId,
} from '../../../shared/types/snapshot';
import {loadProtocolArtifacts, readContractValue, type LocalT0Session} from './deploy';
import {FullScenarioNotImplementedError} from './runtime/errors';
import type {CapturePoint, RunContext, T0RunContext} from './runtime/types';

const SNAPSHOT_ROOT = fileURLToPath(new URL('../../../shared/snapshots', import.meta.url));
const USDC = 1_000_000n;
const POSITION_STATES: readonly PositionState[] = [
  'Registered', 'Advanced', 'Repaid', 'Overdue',
  'Review', 'CoveredLoss', 'CapHeld', 'RecoveryRecorded',
];
const ISSUER_STATES = ['Active', 'MarginCall', 'Suspended', 'Deregistered'] as const;
const LABELS: Record<TimepointId, {en: string; ko: string}> = {
  t0: {en: 'Cardholder refund experience', ko: '사용자 앱 환불 체험'},
  t1: {en: 'One year of normal operation', ko: '1년 정상 운영'},
  t2: {en: 'Confirmed loss → waterfall', ko: '최종 손실 → 워터폴'},
  t3: {en: 'Correlated loss → cap triggered', ko: '상관 손실 → 상한 발동'},
  t3b: {en: 'Recovery settlement', ko: '회수 정산'},
  t4: {en: 'LP withdrawal and liquidity', ko: 'LP 출금 · 유동성'},
  t4b: {en: 'LP withdrawal and liquidity · follow-up', ko: 'LP 출금 · 유동성 · 후속'},
  t5: {en: 'Delayed but repaid', ko: '지연 후 정상 상환'},
  t6: {en: 'External venue frozen', ko: '외부 운용처 동결'},
  t7: {en: 'Chain succeeded, ledger failed', ko: '체인 성공 · DB 실패'},
  t8: {en: 'Invalid requests rejected', ko: '부정 요청 거절'},
  t9: {en: 'More issuers join', ko: '발급사가 늘어날 때'},
  t9b: {en: 'Capital arrives', ko: '자본이 몰려올 때'},
};

interface ParsedLog {
  eventName: string;
  args?: unknown;
  transactionHash: Hex|null;
  blockNumber: bigint|null;
}

function asBigInt(value: unknown, field: string): bigint {
  if (typeof value !== 'bigint') throw new Error(`Torna ${field} returned a non-integer value.`);
  return value;
}

function enumIndex(value: unknown, field: string): number {
  const index = typeof value === 'bigint' ? Number(value) : value;
  if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) {
    throw new Error(`Torna ${field} returned an invalid enum value.`);
  }
  return index;
}

function structField(value: unknown, field: string, index: number): unknown {
  if (Array.isArray(value)) return value[index];
  if (value && typeof value === 'object' && field in value) {
    return (value as Record<string, unknown>)[field];
  }
  throw new Error(`Torna struct returned no ${field} field.`);
}

function toUsdc(value: bigint): number {
  const amount = Number(value) / Number(USDC);
  if (!Number.isFinite(amount)) throw new Error('Snapshot amount exceeds JavaScript number range.');
  return amount;
}

function pct(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) return 0;
  return Number(numerator * 1_000_000n / denominator) / 10_000;
}

function argsOf(log: ParsedLog): Record<string, unknown> {
  return (log.args ?? {}) as Record<string, unknown>;
}

function actorKey(context: T0RunContext, address: Address): string {
  const normalized = address.toLowerCase();
  const keys: ReadonlyArray<readonly [Address, string]> = [
    [context.actors.hybridIssuer, 'HYBRID'],
    [context.actors.auraIssuer, 'AURA'],
    [context.actors.novaIssuer, 'NOVA'],
    [context.actors.meridianIssuer, 'MERIDIAN'],
    [context.actors.kiteIssuer, 'KITE'],
  ];
  return keys.find(([candidate]) => candidate.toLowerCase() === normalized)?.[1] ?? address;
}

function lpActors(context: T0RunContext): ReadonlyArray<readonly [string, Address]> {
  return [
    ['LP-01', context.actors.lp01], ['LP-02', context.actors.lp02],
    ['LP-03', context.actors.lp03], ['LP-04', context.actors.lp04],
    ['LP-05', context.actors.lp05], ['LP-06', context.actors.lp06],
  ];
}

function timepointSeq(context: T0RunContext, blockNumber: bigint): number {
  const blocks = context.scenario?.captureBlocks ?? {};
  for (const [seq, id] of TIMEPOINT_ORDER.entries()) {
    const captured = blocks[id];
    if (captured !== undefined && blockNumber <= captured) return seq;
  }
  return 0;
}

async function readAllLogs(
    session: LocalT0Session,
    context: T0RunContext,
    point: CapturePoint,
): Promise<ParsedLog[]> {
  const {torna} = loadProtocolArtifacts();
  const logs = await session.publicClient.getLogs({
    address: context.torna,
    fromBlock: context.deploymentBlock,
    toBlock: point.blockNumber,
  });
  return parseEventLogs({abi: torna.abi, logs, strict: false}) as unknown as ParsedLog[];
}

async function readPositions(
    session: LocalT0Session,
    context: T0RunContext,
    point: CapturePoint,
    logs: ParsedLog[],
): Promise<{snapshots: PositionSnapshot[]; raw: unknown[]}> {
  const {torna} = loadProtocolArtifacts();
  const issued = logs.filter(log => log.eventName === 'AdvanceIssued');
  const evidence = new Map<string, string>();
  for (const log of logs.filter(item => item.eventName === 'ReviewOpened')) {
    const args = argsOf(log);
    if (typeof args.refundKey === 'string' && typeof args.evidence === 'string') {
      evidence.set(args.refundKey, args.evidence);
    }
  }
  const raw = await Promise.all(issued.map(log => {
    const refundKey = argsOf(log).refundKey;
    if (typeof refundKey !== 'string') throw new Error('AdvanceIssued has no refundKey.');
    return readContractValue(
        session, context.torna, torna.abi, 'positionOf', [refundKey], point.blockNumber);
  }));
  const snapshots = raw.map((position, index): PositionSnapshot => {
    const log = issued[index]!;
    const args = argsOf(log);
    const refundKey = args.refundKey as Hex;
    const issuer = structField(position, 'issuer', 1) as Address;
    const stateIndex = enumIndex(structField(position, 'state', 9), 'position.state');
    const state = POSITION_STATES[stateIndex];
    if (!state) throw new Error(`Unknown on-chain position state ${stateIndex}.`);
    if (!log.transactionHash || log.blockNumber === null) {
      throw new Error('AdvanceIssued log has no confirmed transaction identity.');
    }
    return {
      refundKey,
      issuer: actorKey(context, issuer),
      acquirerHash: structField(position, 'acquirerHash', 2) as Hex,
      amount: toUsdc(asBigInt(structField(position, 'amount', 3), 'position.amount')),
      fee: toUsdc(asBigInt(structField(position, 'fee', 4), 'position.fee')),
      issuerMargin: toUsdc(
          asBigInt(structField(position, 'issuerMargin', 5), 'position.issuerMargin')),
      poolCoverage: toUsdc(
          asBigInt(structField(position, 'poolCoverage', 6), 'position.poolCoverage')),
      state,
      evidence: evidence.get(refundKey) ?? null,
      txHash: log.transactionHash,
      createdAtTimepoint: timepointSeq(context, log.blockNumber),
    };
  });
  return {snapshots, raw};
}

async function readIssuers(
    session: LocalT0Session,
    context: T0RunContext,
    point: CapturePoint,
    logs: ParsedLog[],
): Promise<IssuerSnapshot[]> {
  const {torna} = loadProtocolArtifacts();
  const registered = logs.filter(log => log.eventName === 'IssuerRegistered');
  return Promise.all(registered.map(async log => {
    const args = argsOf(log);
    const issuer = args.issuer as Address;
    const deposits = logs.filter(item =>
      item.eventName === 'CollateralDeposited'
        && String(argsOf(item).issuer).toLowerCase() === issuer.toLowerCase());
    const initial = deposits.reduce<bigint>(
        (sum, item) => sum + asBigInt(argsOf(item).amount, 'CollateralDeposited.amount'), 0n);
    const [remaining, outstanding, limit, ramping, stateValue] = await Promise.all([
      readContractValue(session, context.torna, torna.abi, 'collateralOf', [issuer], point.blockNumber),
      readContractValue(
          session, context.torna, torna.abi, 'issuerOutstanding', [issuer], point.blockNumber),
      readContractValue(session, context.torna, torna.abi, 'issuerLimit', [issuer], point.blockNumber),
      readContractValue(
          session, context.torna, torna.abi, 'isIssuerRamping', [issuer], point.blockNumber),
      readContractValue(
          session, context.torna, torna.abi, 'issuerStateOf', [issuer], point.blockNumber),
    ]);
    const stateIndex = enumIndex(stateValue, 'issuerStateOf');
    const state = ISSUER_STATES[stateIndex];
    if (!state || typeof ramping !== 'boolean') throw new Error('Invalid issuer state response.');
    return {
      key: actorKey(context, issuer),
      name: String(args.name),
      acquirerHash: args.acquirerHash as Hex,
      collateralInitial: toUsdc(initial),
      collateralRemaining: toUsdc(asBigInt(remaining, 'collateralOf')),
      outstanding: toUsdc(asBigInt(outstanding, 'issuerOutstanding')),
      effectiveLimit: toUsdc(asBigInt(limit, 'issuerLimit')),
      rampUp: ramping,
      state,
    };
  }));
}

async function readLps(
    session: LocalT0Session,
    context: T0RunContext,
    point: CapturePoint,
    totalPrincipal: bigint,
): Promise<LiquidityProviderSnapshot[]> {
  const {torna} = loadProtocolArtifacts();
  const principals = await Promise.all(lpActors(context).map(async ([name, address]) => ({
    name,
    principal: asBigInt(await readContractValue(
        session, context.torna, torna.abi, 'lpPrincipal', [address], point.blockNumber),
    'lpPrincipal'),
  })));
  return principals.filter(item => item.principal > 0n).map(item => ({
    name: item.name,
    deposit: toUsdc(item.principal),
    sharePct: pct(item.principal, totalPrincipal),
  }));
}

function eventEntries(context: T0RunContext, logs: ParsedLog[]): EventLogEntry[] {
  return logs.map(log => {
    if (!log.transactionHash || log.blockNumber === null) {
      throw new Error(`${log.eventName} log has no confirmed transaction identity.`);
    }
    const args = argsOf(log);
    const target = args.refundKey ?? args.issuer ?? args.lp ?? args.acquirerHash ?? 'protocol';
    const amount = args.amount ?? args.coverage ?? args.cap ?? args.totalPrincipal ?? 0n;
    return {
      blockNumber: Number(log.blockNumber),
      name: log.eventName,
      target: String(target),
      amount: toUsdc(asBigInt(amount, `${log.eventName}.amount`)),
      txHash: log.transactionHash,
      timepointSeq: timepointSeq(context, log.blockNumber),
    };
  }).reverse();
}

export async function captureScenarioSnapshot(
    session: LocalT0Session,
    context: T0RunContext,
    point: CapturePoint,
): Promise<Snapshot> {
  if (!context.scenario) throw new FullScenarioNotImplementedError();
  context.scenario.captureBlocks[point.timepointId] = point.blockNumber;
  const {torna} = loadProtocolArtifacts();
  const logs = await readAllLogs(session, context, point);
  const [
    totalPrincipalValue, totalFeesValue, totalLpLossValue, capacityValue,
    outstandingValue, reserveValue, protocolValue, totalLossValue,
    countValue, advancedValue,
  ] = await Promise.all([
    readContractValue(session, context.torna, torna.abi, 'totalLpPrincipal', [], point.blockNumber),
    readContractValue(session, context.torna, torna.abi, 'totalLpFees', [], point.blockNumber),
    readContractValue(session, context.torna, torna.abi, 'totalLpLoss', [], point.blockNumber),
    readContractValue(session, context.torna, torna.abi, 'poolCapacity', [], point.blockNumber),
    readContractValue(session, context.torna, torna.abi, 'totalOutstanding', [], point.blockNumber),
    readContractValue(session, context.torna, torna.abi, 'reserveBalance', [], point.blockNumber),
    readContractValue(session, context.torna, torna.abi, 'protocolFees', [], point.blockNumber),
    readContractValue(session, context.torna, torna.abi, 'totalLoss', [], point.blockNumber),
    readContractValue(session, context.torna, torna.abi, 'totalAdvanceCount', [], point.blockNumber),
    readContractValue(session, context.torna, torna.abi, 'totalAdvanced', [], point.blockNumber),
  ]);
  const totalPrincipal = asBigInt(totalPrincipalValue, 'totalLpPrincipal');
  const totalFees = asBigInt(totalFeesValue, 'totalLpFees');
  const totalLpLoss = asBigInt(totalLpLossValue, 'totalLpLoss');
  const capacity = asBigInt(capacityValue, 'poolCapacity');
  const outstanding = asBigInt(outstandingValue, 'totalOutstanding');
  const reserve = asBigInt(reserveValue, 'reserveBalance');
  const protocol = asBigInt(protocolValue, 'protocolFees');
  const totalLoss = asBigInt(totalLossValue, 'totalLoss');
  const count = asBigInt(countValue, 'totalAdvanceCount');
  const advanced = asBigInt(advancedValue, 'totalAdvanced');
  const positions = await readPositions(session, context, point, logs);
  const issuers = await readIssuers(session, context, point, logs);
  const liquidityProviders = await readLps(session, context, point, totalPrincipal);
  const capHeld = positions.raw.reduce<bigint>((sum, position) => {
    const state = enumIndex(structField(position, 'state', 9), 'position.state');
    return state === 6
      ? sum + asBigInt(structField(position, 'poolCoverage', 6), 'position.poolCoverage')
      : sum;
  }, 0n);
  const reserveSeed = logs.filter(log => log.eventName === 'ReserveSeeded').reduce<bigint>(
      (sum, log) => sum + asBigInt(argsOf(log).amount, 'ReserveSeeded.amount'), 0n);
  const reserveFees = positions.raw.reduce<bigint>((sum, position) => {
    const fee = asBigInt(structField(position, 'fee', 4), 'position.fee');
    return sum + fee * 1330n / 10_000n;
  }, 0n);
  const reserveUsed = reserveSeed + reserveFees > reserve ? reserveSeed + reserveFees - reserve : 0n;
  const acquirerHashes = [...new Set(issuers.map(issuer => issuer.acquirerHash))] as Hex[];
  const acquirerOutstanding = await Promise.all(acquirerHashes.map(async hash =>
    asBigInt(await readContractValue(
        session, context.torna, torna.abi, 'acquirerOutstanding', [hash], point.blockNumber),
    'acquirerOutstanding')));
  const topExposure = acquirerOutstanding.reduce((top, value) => value > top ? value : top, 0n);
  const rejected = logs.filter(log => log.eventName === 'AdvanceRejected').length;
  const repaid = positions.snapshots.filter(position => position.state === 'Repaid').length;
  const block = await session.publicClient.getBlock({blockNumber: point.blockNumber});
  const depositBase = outstanding > 5_000n * USDC ? outstanding : 5_000n * USDC;

  return {
    schemaVersion: 1,
    runId: context.runId,
    timepointId: point.timepointId,
    seq: TIMEPOINT_ORDER.indexOf(point.timepointId),
    label: LABELS[point.timepointId],
    chainId: context.chainId,
    contract: context.torna,
    blockNumber: Number(point.blockNumber),
    capturedAt: new Date(Number(block.timestamp) * 1000).toISOString(),
    amountUnit: 'USDC',
    note: 'Generated from one continuous local chain run; amounts are converted from six-decimal base units.',
    pool: {
      lpDeposits: toUsdc(totalPrincipal),
      lpFeeAccrued: toUsdc(totalFees),
      lpLossApplied: toUsdc(totalLpLoss),
      netAssetValue: toUsdc(capacity),
      advancedOutstanding: toUsdc(outstanding),
      cashAvailable: toUsdc(capacity - outstanding),
      reserve: toUsdc(reserve),
      reserveUsed: toUsdc(reserveUsed),
      capHeld: toUsdc(capHeld),
      externalDeployed: 0,
      externalFrozen: false,
      protocolFee: toUsdc(protocol),
    },
    issuers,
    liquidityProviders,
    positions: positions.snapshots,
    metrics: {
      cumulativeCount: Number(count),
      cumulativeAdvanced: toUsdc(advanced),
      lossTotal: toUsdc(totalLoss),
      lossRatePct: pct(totalLoss, advanced),
      repayRatePct: count === 0n ? 100 : Number(repaid) * 100 / Number(count),
      utilizationPct: pct(outstanding, capacity),
      acquirerTopExposure: toUsdc(topExposure),
      acquirerExposureLimit: toUsdc(capacity / 2n),
      lpDepositCap: toUsdc(depositBase * 10_000n / 3_000n),
      rejectedRequests: rejected,
    },
    events: eventEntries(context, logs),
  };
}

export async function captureT0Snapshot(
    session: LocalT0Session, context: T0RunContext, point: CapturePoint): Promise<Snapshot> {
  if (point.timepointId !== 't0' || !context.t0) throw new FullScenarioNotImplementedError();
  return captureScenarioSnapshot(session, context, point);
}

export async function captureSnapshot(_context: RunContext, _point: CapturePoint): Promise<Snapshot> {
  throw new FullScenarioNotImplementedError();
}

function snapshotDirectory(runId: string): string {
  if (!/^run-local-[a-z0-9-]+$/.test(runId)) {
    throw new Error('Snapshot runId must be a local run ID containing only lowercase letters, digits and hyphens.');
  }
  const output = resolve(SNAPSHOT_ROOT, runId);
  const relativeOutput = relative(SNAPSHOT_ROOT, output);
  if (relativeOutput === '' || relativeOutput.startsWith('..') || relativeOutput.includes('/..')) {
    throw new Error('Snapshot output must remain within shared/snapshots.');
  }
  return output;
}

function assertSaveIdentity(context: T0RunContext, snapshot: Snapshot): void {
  if (snapshot.runId !== context.runId
      || snapshot.seq !== TIMEPOINT_ORDER.indexOf(snapshot.timepointId)
      || snapshot.chainId !== context.chainId
      || snapshot.contract.toLowerCase() !== context.torna.toLowerCase()) {
    throw new Error('Refusing to save a snapshot whose identity does not match the local run context.');
  }
}

export async function saveScenarioSnapshot(
    context: T0RunContext, snapshot: Snapshot): Promise<void> {
  assertSaveIdentity(context, snapshot);
  const directory = snapshotDirectory(context.runId);
  if (snapshot.timepointId === 't0') {
    try {
      await mkdir(directory, {recursive: false});
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(`Refusing to reuse existing snapshot run directory: ${context.runId}.`);
      }
      throw error;
    }
  } else {
    await access(directory);
  }
  const output = resolve(directory, `${snapshot.timepointId}.json`);
  await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx',
  });
}

export async function saveT0Snapshot(context: T0RunContext, snapshot: Snapshot): Promise<void> {
  if (snapshot.timepointId !== 't0') throw new Error('Local t0 save received another timepoint.');
  return saveScenarioSnapshot(context, snapshot);
}

export async function saveSnapshot(_context: RunContext, _snapshot: Snapshot): Promise<void> {
  throw new FullScenarioNotImplementedError();
}

/** There is no complete generated bundle until t6+ and the same-run label map are available. */
export async function finalizeBundle(_context: RunContext): Promise<void> {
  throw new FullScenarioNotImplementedError();
}

export async function snapshotRunExists(runId: string): Promise<boolean> {
  try {
    await access(snapshotDirectory(runId));
    return true;
  } catch {
    return false;
  }
}
