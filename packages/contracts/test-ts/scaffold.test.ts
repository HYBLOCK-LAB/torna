import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TIMEPOINT_ORDER, type Snapshot } from '../../../shared/types/snapshot';
import { runScenarios, scaffoldRuntime } from '../script/run-scenarios';
import { describePlan, missingFeatures, scenarioPlan } from '../script/scenarios/plan';
import { ScaffoldNotImplementedError } from '../script/runtime/errors';
import type { RunContext, ScenarioRuntime } from '../script/runtime/types';

// In-memory orchestration fixture ONLY; never exported as a real chain snapshot.
const sample: Snapshot = JSON.parse(readFileSync(new URL('../../../shared/snapshots/sample/t0.json', import.meta.url), 'utf8'));
const context: RunContext = {
  runId: 'unit-test-only', chainId: 31337,
  torna: '0x1111111111111111111111111111111111111111',
  asset: '0x2222222222222222222222222222222222222222', deploymentBlock: 1n,
};

function mockRuntime() {
  const calls: string[] = [];
  const runtime: ScenarioRuntime = {
    async preflight() { calls.push('preflight'); },
    async deploy() { calls.push('deploy'); return context; },
    async execute(_context, id) {
      calls.push(`execute:${id}`);
      return { timepointId: id, blockNumber: BigInt(TIMEPOINT_ORDER.indexOf(id) + 2) };
    },
    async capture(_context, point) {
      calls.push(`capture:${point.timepointId}`);
      return {
        ...structuredClone(sample), runId: context.runId, chainId: context.chainId,
        contract: context.torna, timepointId: point.timepointId,
        seq: TIMEPOINT_ORDER.indexOf(point.timepointId), blockNumber: Number(point.blockNumber),
      };
    },
    async save(_context, snapshot) { calls.push(`save:${snapshot.timepointId}`); },
    async finalize() { calls.push('finalize'); },
  };
  return { runtime, calls };
}

test('plan covers exactly the shared twelve timepoints and exposes missing features', () => {
  assert.deepEqual(scenarioPlan.map(step => step.id), TIMEPOINT_ORDER);
  assert.ok(missingFeatures(scenarioPlan[0]).includes('repay'));
  assert.ok(missingFeatures(scenarioPlan[0]).includes('reserveSeed'));
  assert.ok(missingFeatures(scenarioPlan.at(-1)!).includes('liquidityDeposit'));
  assert.match(describePlan(), /PLAN ONLY/);
  assert.match(describePlan(), /handlers.*unwired/);
});

test('default runtime fails before any deployment, even if called without CLI', async () => {
  await assert.rejects(runScenarios(), ScaffoldNotImplementedError);
});

test('all unwired IO entry points fail explicitly instead of returning fake results', async () => {
  await assert.rejects(scaffoldRuntime.deploy(), ScaffoldNotImplementedError);
  await assert.rejects(scaffoldRuntime.execute(context, 't0'), ScaffoldNotImplementedError);
  await assert.rejects(scaffoldRuntime.capture(context, { timepointId: 't0', blockNumber: 2n }), ScaffoldNotImplementedError);
  await assert.rejects(scaffoldRuntime.save(context, sample), ScaffoldNotImplementedError);
  await assert.rejects(scaffoldRuntime.finalize(context), ScaffoldNotImplementedError);
});

test('orchestrator executes captures and saves each timepoint before the next', async () => {
  const { runtime, calls } = mockRuntime();
  await runScenarios(runtime);
  assert.deepEqual(calls, ['preflight', 'deploy', ...TIMEPOINT_ORDER.flatMap(id => [
    `execute:${id}`, `capture:${id}`, `save:${id}`,
  ]), 'finalize']);
});

test('preflight failure prevents deployment and all subsequent operations', async () => {
  const { runtime, calls } = mockRuntime();
  runtime.preflight = async () => { throw new Error('Missing configuration'); };
  await assert.rejects(runScenarios(runtime), /Missing configuration/);
  assert.deepEqual(calls, []);
});

test('execution capture and save failures prevent later steps and finalization', async () => {
  for (const stage of ['execute', 'capture', 'save'] as const) {
    const { runtime, calls } = mockRuntime();
    runtime[stage] = async () => { throw new Error(`Failed ${stage}`); };
    await assert.rejects(runScenarios(runtime), new RegExp(`Failed ${stage}`));
    assert.ok(!calls.includes('execute:t1'));
    assert.ok(!calls.includes('finalize'));
  }
});

test('wrong timepoint or decreasing block is rejected before capture', async () => {
  for (const point of [
    { timepointId: 't1' as const, blockNumber: 2n },
    { timepointId: 't0' as const, blockNumber: 0n },
  ]) {
    const { runtime, calls } = mockRuntime();
    runtime.execute = async () => point;
    await assert.rejects(runScenarios(runtime), /Invalid capture point/);
    assert.deepEqual(calls, ['preflight', 'deploy']);
  }
});

test('wrong run chain contract sequence or block cannot be saved', async () => {
  for (const change of [
    { runId: 'other' }, { chainId: 10143 }, { contract: context.asset },
    { timepointId: 't1' as const }, { seq: 1 }, { blockNumber: 3 },
    { blockNumber: Number.MAX_SAFE_INTEGER + 1 }, { blockNumber: -1 },
  ]) {
    const { runtime, calls } = mockRuntime();
    const capture = runtime.capture;
    runtime.capture = async (ctx, point) => ({ ...await capture(ctx, point), ...change });
    await assert.rejects(runScenarios(runtime), /Snapshot identity\/block mismatch/);
    assert.ok(!calls.includes('save:t0'));
    assert.ok(!calls.includes('execute:t1'));
    assert.ok(!calls.includes('finalize'));
  }
});

test('CLI defaults to plan; execute and unknown flags fail rather than silently succeeding', () => {
  const script = fileURLToPath(new URL('../script/run-scenarios.ts', import.meta.url));
  for (const args of [[], ['--plan']]) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PLAN ONLY/);
  }
  const execute = spawnSync(process.execPath, ['--import', 'tsx', script, '--execute'], { encoding: 'utf8' });
  assert.equal(execute.status, 1);
  assert.match(execute.stderr, /not wired yet/);
  const unknown = spawnSync(process.execPath, ['--import', 'tsx', script, '--broadcast'], { encoding: 'utf8' });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Usage:/);
});
