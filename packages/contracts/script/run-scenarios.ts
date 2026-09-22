import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TIMEPOINT_ORDER } from '../../../shared/types/snapshot';
import {
  createLocalT0Session,
  deployProtocol,
  preflightLocalT0,
} from './deploy';
import { captureT0Snapshot, saveT0Snapshot } from './snapshot';
import { executeT0 } from './scenarios/execute';
import { describePlan } from './scenarios/plan';
import { FullScenarioNotImplementedError } from './runtime/errors';
import { loadLocalT0Config, type LocalT0Config } from './runtime/local-config';
import {
  assertPublicT0RunContext,
  type CapturePoint,
  type LocalT0Runtime,
  type ScenarioRuntime,
  type T0RunContext,
} from './runtime/types';

/**
 * The full PRD runner remains deliberately blocked. It cannot accidentally
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
 * default has no implementation until every PRD timepoint is receipt-checked.
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
  throw new Error('Usage: run-scenarios.ts [--plan | --t0 | --execute]');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Scenario runner failed');
    process.exitCode = 1;
  });
}
