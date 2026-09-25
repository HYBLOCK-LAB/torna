import {access, writeFile} from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {buildLabelMap, connect} from '@torna/ledger';
import { TIMEPOINT_ORDER } from '../../../shared/types/snapshot';
import {
  createLocalT0Session,
  deployProtocol,
  preflightMonadTestnet,
  preflightLocalT0,
} from './deploy';
import {
  captureScenarioSnapshot,
  captureT0Snapshot,
  finalizeLocalBundle,
  saveScenarioSnapshot,
  saveT0Snapshot,
  snapshotRunExists,
} from './snapshot';
import { executeScenario, executeT0 } from './scenarios/execute';
import { describePlan } from './scenarios/plan';
import { FullScenarioNotImplementedError } from './runtime/errors';
import {loadT7LedgerIO, preflightT7LedgerIO, type T7LedgerIO} from './runtime/ledger';
import { loadLocalT0Config, type LocalT0Config } from './runtime/local-config';
import { loadMonadTestnetConfig, type MonadTestnetConfig } from './runtime/testnet-config';
import {
  assertPublicT0RunContext,
  type CapturePoint,
  type LocalScenarioRuntime,
  type LocalT0Runtime,
  type ScenarioRuntime,
  type T0RunContext,
} from './runtime/types';

export const LOCAL_T0_TO_T5 = TIMEPOINT_ORDER.slice(0, 8);
export const LOCAL_T0_TO_T6 = TIMEPOINT_ORDER.slice(0, 9);
export const LOCAL_T0_TO_T7 = TIMEPOINT_ORDER.slice(0, 10);
export const LOCAL_T0_TO_T9B = TIMEPOINT_ORDER;
const LABEL_ROOT = fileURLToPath(new URL('../../../shared/labels/', import.meta.url));

/** Never let the local bundle command use the shared Supabase URL by mistake. */
export function validateLocalLedgerUrl(raw: string|undefined): string {
  let url: URL;
  try {
    url = new URL(raw ?? '');
  } catch {
    throw new Error('Local bundle requires an explicit loopback DATABASE_URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || !url.port || !url.pathname || url.pathname === '/' || url.search || url.hash) {
    throw new Error('Local bundle requires an explicit loopback PostgreSQL DATABASE_URL.');
  }
  return raw!;
}

/**
 * The full PROJECT_SPEC runner remains deliberately blocked. It cannot accidentally
 * deploy or write a partial 13-timepoint bundle through the generic CLI.
 */
export const scaffoldRuntime: ScenarioRuntime = {
  async preflight() { throw new FullScenarioNotImplementedError(); },
  async deploy() { throw new FullScenarioNotImplementedError(); },
  async execute() { throw new FullScenarioNotImplementedError(); },
  async capture() { throw new FullScenarioNotImplementedError(); },
  async save() { throw new FullScenarioNotImplementedError(); },
  async finalize() { throw new FullScenarioNotImplementedError(); },
};

/**
 * Full orchestration stays injectable for ordering/identity tests, but the
 * default has no implementation until same-run DB labels and finalization work.
 */
export async function runScenarios(runtime: ScenarioRuntime = scaffoldRuntime): Promise<void> {
  await runtime.preflight();
  const context = await runtime.deploy();
  let previousBlock = context.deploymentBlock;
  for (const [seq, id] of TIMEPOINT_ORDER.entries()) {
    const point = await runtime.execute(context, id);
    if (point.timepointId !== id || point.blockNumber < previousBlock) {
      throw new Error(`Invalid capture point for ${id}`);
    }
    const snapshot = await runtime.capture(context, point);
    if (snapshot.runId !== context.runId || snapshot.timepointId !== id || snapshot.seq !== seq
      || snapshot.chainId !== context.chainId || snapshot.contract.toLowerCase() !== context.torna.toLowerCase()
      || !Number.isSafeInteger(snapshot.blockNumber) || snapshot.blockNumber < 0
      || BigInt(snapshot.blockNumber) !== point.blockNumber) {
      throw new Error(`Snapshot identity/block mismatch for ${id}`);
    }
    await runtime.save(context, snapshot);
    previousBlock = point.blockNumber;
  }
  await runtime.finalize(context);
}

/** Create the narrow real-chain boundary without exposing signing configuration. */
export function createLocalT0Runtime(config: LocalT0Config): LocalT0Runtime {
  const session = createLocalT0Session(config);
  return {
    preflight: () => preflightLocalT0(session),
    deploy: () => deployProtocol(session),
    execute: context => executeT0(session, context),
    capture: (context, point) => captureT0Snapshot(session, context, point),
    save: (context, snapshot) => saveT0Snapshot(context, snapshot),
  };
}

/** Use one local deployment for every currently implemented scenario handler. */
export function createLocalT0ToT5Runtime(config: LocalT0Config): LocalScenarioRuntime {
  const session = createLocalT0Session(config);
  return {
    preflight: () => preflightLocalT0(session),
    deploy: () => deployProtocol(session),
    execute: (context, id) => executeScenario(session, context, id),
    capture: (context, point) => captureScenarioSnapshot(session, context, point),
    save: (context, snapshot) => saveScenarioSnapshot(context, snapshot),
  };
}

export const createLocalT0ToT6Runtime = createLocalT0ToT5Runtime;

/** Keep the DB handle private; bundle-producing callers must supply real ledger IO. */
export function createLocalT0ToT7Runtime(
    config: LocalT0Config | MonadTestnetConfig, ledger: T7LedgerIO): LocalScenarioRuntime {
  const session = createLocalT0Session(config);
  return {
    preflight: async () => {
      if (session.target === 'testnet') await preflightMonadTestnet(session);
      else await preflightLocalT0(session);
      await preflightT7LedgerIO(ledger);
    },
    deploy: () => deployProtocol(session),
    execute: (context, id) => executeScenario(session, context, id, ledger),
    capture: (context, point) => captureScenarioSnapshot(session, context, point),
    save: (context, snapshot) => saveScenarioSnapshot(context, snapshot),
  };
}

/** Full local run additionally requires the seeded refund catalog for DB labels. */
export function createLocalT0ToT9bRuntime(
    config: LocalT0Config | MonadTestnetConfig, ledger: T7LedgerIO): LocalScenarioRuntime {
  if (ledger.scenarioRows?.length !== 378) {
    throw new Error('Full local run requires all 378 seeded ledger refunds.');
  }
  return createLocalT0ToT7Runtime(config, ledger);
}

/**
 * Format only confirmed public metadata. The runner intentionally never logs
 * the RPC URL, mnemonic, private keys or signing-account objects.
 */
export function formatLocalT0ExecutionReport(
    context: T0RunContext, point: CapturePoint): string {
  assertPublicT0RunContext(context);
  if (!context.t0) throw new Error('Local t0 has no confirmed execution metadata.');
  return JSON.stringify({
    runId: context.runId,
    chainId: context.chainId,
    contracts: {torna: context.torna, mockUsdc: context.asset},
    deploymentBlock: context.deploymentBlock.toString(),
    finalBlock: point.blockNumber.toString(),
    advance: {
      txHash: context.t0.advance.hash,
      blockNumber: context.t0.advance.blockNumber.toString(),
    },
    repayment: {
      txHash: context.t0.repayment.hash,
      blockNumber: context.t0.repayment.blockNumber.toString(),
    },
  }, null, 2);
}

/**
 * t0 has one strict order. A receipt or event failure propagates before
 * capture/save, so it can never leave a fabricated snapshot behind.
 */
export async function runLocalT0(
    runtime: LocalT0Runtime,
    onExecutionConfirmed?: (context: T0RunContext, point: CapturePoint) => void,
): Promise<void> {
  await runtime.preflight();
  const context = await runtime.deploy();
  const point = await runtime.execute(context);
  assertPublicT0RunContext(context);
  if (point.timepointId !== 't0' || point.blockNumber < context.deploymentBlock) {
    throw new Error('Invalid local t0 capture point.');
  }
  onExecutionConfirmed?.(context, point);
  const snapshot = await runtime.capture(context, point);
  if (snapshot.runId !== context.runId || snapshot.timepointId !== 't0' || snapshot.seq !== 0
      || snapshot.chainId !== context.chainId
      || snapshot.contract.toLowerCase() !== context.torna.toLowerCase()
      || !Number.isSafeInteger(snapshot.blockNumber) || snapshot.blockNumber < 0
      || BigInt(snapshot.blockNumber) !== point.blockNumber) {
    throw new Error('Local t0 snapshot identity/block mismatch.');
  }
  await runtime.save(context, snapshot);
}

/**
 * Run and save only the receipt-checked t0 -> t5 segment. No manifest is written,
 * because a complete bundle still requires t7 DB evidence and finalization.
 */
export async function runLocalT0ToT5(
    runtime: LocalScenarioRuntime,
    onTimepointConfirmed?: (context: T0RunContext, point: CapturePoint) => void,
): Promise<void> {
  return runLocalSegment(runtime, LOCAL_T0_TO_T5, onTimepointConfirmed);
}

/** One local deployment through t6; t7 and final bundle publication remain blocked. */
export async function runLocalT0ToT6(
    runtime: LocalScenarioRuntime,
    onTimepointConfirmed?: (context: T0RunContext, point: CapturePoint) => void,
): Promise<void> {
  return runLocalSegment(runtime, LOCAL_T0_TO_T6, onTimepointConfirmed);
}

/** A local t0 -> t7 rehearsal with explicit ledger IO and C's retry job. */
export async function runLocalT0ToT7(
    runtime: LocalScenarioRuntime,
    onTimepointConfirmed?: (context: T0RunContext, point: CapturePoint) => void,
): Promise<void> {
  return runLocalSegment(runtime, LOCAL_T0_TO_T7, onTimepointConfirmed);
}

/** Complete local execution; manifest publication remains a separate checked step. */
export async function runLocalT0ToT9b(
    runtime: LocalScenarioRuntime,
    onTimepointConfirmed?: (context: T0RunContext, point: CapturePoint) => void,
): Promise<void> {
  return runLocalSegment(runtime, LOCAL_T0_TO_T9B, onTimepointConfirmed);
}

/** Local-only complete run: C's DB label builder supplies the same-run label file. */
export async function runLocalBundle(
    config: LocalT0Config | MonadTestnetConfig, databaseUrl: string,
    onTimepointConfirmed?: (context: T0RunContext, point: CapturePoint) => void,
): Promise<void> {
  const sql = connect(validateLocalLedgerUrl(databaseUrl));
  const labelPath = resolve(LABEL_ROOT, `${config.runId}.json`);
  try {
    if (await snapshotRunExists(config.runId)) {
      throw new Error(`Refusing to reuse existing snapshot run directory: ${config.runId}.`);
    }
    try {
      await access(labelPath);
      throw new Error(`Refusing to overwrite existing DB labels: ${config.runId}.`);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const ledger = await loadT7LedgerIO(sql);
    const runtime = createLocalT0ToT9bRuntime(config, ledger);
    let completedContext: T0RunContext|undefined;
    await runLocalT0ToT9b(runtime, (context, point) => {
      completedContext = context;
      onTimepointConfirmed?.(context, point);
    });
    if (!completedContext || !completedContext.scenario?.captureBlocks.t9b) {
      throw new Error('Full local run ended without a confirmed t9b snapshot.');
    }
    const labels = await buildLabelMap(sql, config.runId);
    await writeFile(labelPath, `${JSON.stringify(labels, null, 2)}\n`, {
      encoding: 'utf8', flag: 'wx',
    });
    await finalizeLocalBundle(completedContext);
  } finally {
    await sql.end();
  }
}

/** Testnet path reuses the same receipt-checked handlers but waits on real block time. */
export async function runTestnetBundle(
    config: MonadTestnetConfig, databaseUrl: string,
    onTimepointConfirmed?: (context: T0RunContext, point: CapturePoint) => void,
): Promise<void> {
  if (config.target !== 'testnet' || config.chainId !== 10143) {
    throw new Error('Testnet bundle requires explicit Monad Testnet configuration.');
  }
  return runLocalBundle(config, databaseUrl, onTimepointConfirmed);
}

async function runLocalSegment(
    runtime: LocalScenarioRuntime,
    timepoints: readonly typeof TIMEPOINT_ORDER[number][],
    onTimepointConfirmed?: (context: T0RunContext, point: CapturePoint) => void,
): Promise<void> {
  await runtime.preflight();
  const context = await runtime.deploy();
  let previousBlock = context.deploymentBlock;
  for (const id of timepoints) {
    const point = await runtime.execute(context, id);
    assertPublicT0RunContext(context);
    if (point.timepointId !== id || point.blockNumber < previousBlock) {
      throw new Error(`Invalid local capture point for ${id}.`);
    }
    onTimepointConfirmed?.(context, point);
    const snapshot = await runtime.capture(context, point);
    if (snapshot.runId !== context.runId || snapshot.timepointId !== id
        || snapshot.seq !== TIMEPOINT_ORDER.indexOf(id)
        || snapshot.chainId !== context.chainId
        || snapshot.contract.toLowerCase() !== context.torna.toLowerCase()
        || !Number.isSafeInteger(snapshot.blockNumber) || snapshot.blockNumber < 0
        || BigInt(snapshot.blockNumber) !== point.blockNumber) {
      throw new Error(`Local snapshot identity/block mismatch for ${id}.`);
    }
    await runtime.save(context, snapshot);
    previousBlock = point.blockNumber;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || (args.length === 1 && args[0] === '--plan')) {
    console.log(describePlan());
    return;
  }
  if (args.length === 1 && args[0] === '--execute') {
    await runScenarios();
    return;
  }
  if (args.length === 1 && args[0] === '--t0') {
    await runLocalT0(
        createLocalT0Runtime(loadLocalT0Config()),
        (context, point) => console.log(formatLocalT0ExecutionReport(context, point)));
    return;
  }
  if (args.length === 1 && args[0] === '--through-t5') {
    await runLocalT0ToT5(
        createLocalT0ToT5Runtime(loadLocalT0Config()),
        (_context, point) => console.log(
            `Confirmed ${point.timepointId} at block ${point.blockNumber.toString()}.`));
    return;
  }
  if (args.length === 1 && args[0] === '--through-t6') {
    await runLocalT0ToT6(
        createLocalT0ToT6Runtime(loadLocalT0Config()),
        (_context, point) => console.log(
            `Confirmed ${point.timepointId} at block ${point.blockNumber.toString()}.`));
    return;
  }
  if (args.length === 1 && args[0] === '--through-t9b') {
    await runLocalBundle(
        loadLocalT0Config(), process.env.DATABASE_URL ?? '',
        (_context, point) => console.log(
            `Confirmed ${point.timepointId} at block ${point.blockNumber.toString()}.`));
    return;
  }
  if (args.length === 1 && args[0] === '--testnet-bundle') {
    await runTestnetBundle(
        loadMonadTestnetConfig(), process.env.DATABASE_URL ?? '',
        (_context, point) => console.log(
            `Confirmed ${point.timepointId} at block ${point.blockNumber.toString()}.`));
    return;
  }
  throw new Error('Usage: run-scenarios.ts [--plan | --t0 | --through-t5 | --through-t6 | --through-t9b | --testnet-bundle | --execute]');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const testnet = process.argv.includes('--testnet-bundle');
    if (testnet) {
      const name = error instanceof Error ? error.name : 'Error';
      console.error(`Testnet scenario run failed (${name}). Sensitive RPC and signing values were not printed.`);
    } else {
      console.error(error instanceof Error ? error.message : 'Scenario runner failed');
    }
    process.exitCode = 1;
  });
}
