import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIMEPOINT_ORDER } from '../../../shared/types/snapshot';
import { deployProtocol } from './deploy';
import { captureSnapshot, saveSnapshot, finalizeBundle } from './snapshot';
import { executeScenario } from './scenarios/execute';
import { describePlan } from './scenarios/plan';
import { ScaffoldNotImplementedError } from './runtime/errors';
import type { ScenarioRuntime } from './runtime/types';

export const scaffoldRuntime: ScenarioRuntime = {
  async preflight() { throw new ScaffoldNotImplementedError('Network/configuration preflight and scenario handlers'); },
  deploy: deployProtocol,
  execute: executeScenario,
  capture: captureSnapshot,
  save: saveSnapshot,
  finalize: finalizeBundle,
};

/** Orchestration is implemented; production IO is deliberately NOT wired.
 * A handler failure propagates: no later timepoint, save or final manifest is attempted.
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || (args.length === 1 && args[0] === '--plan')) {
    console.log(describePlan());
    return;
  }
  if (args.length === 1 && args[0] === '--execute') {
    await runScenarios(); // Fails in preflight until real dependencies are implemented.
    return;
  }
  throw new Error('Usage: run-scenarios.ts [--plan | --execute]');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Scenario runner failed');
    process.exitCode = 1;
  });
}
