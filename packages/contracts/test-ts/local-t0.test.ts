import assert from 'node:assert/strict';
import {test} from 'node:test';

import type {Snapshot} from '../../../shared/types/snapshot';
import {
  formatLocalT0ExecutionReport,
  LOCAL_T0_TO_T5,
  runLocalT0,
  runLocalT0ToT5,
} from '../script/run-scenarios';
import {
  LocalT0ConfigurationError,
  ReceiptEventMismatchError,
} from '../script/runtime/errors';
import {
  loadLocalT0Config,
  parseLocalChainId,
  validateLoopbackRpc,
} from '../script/runtime/local-config';
import {
  assertPublicT0RunContext,
  type LocalScenarioRuntime,
  type LocalT0Runtime,
  type T0RunContext,
} from '../script/runtime/types';

const context: T0RunContext = {
  runId: 'run-local-unit',
  chainId: 31337,
  torna: '0x1111111111111111111111111111111111111111',
  asset: '0x2222222222222222222222222222222222222222',
  deploymentBlock: 1n,
  actors: {
    deployer: '0x3333333333333333333333333333333333333333',
    verifier: '0x4444444444444444444444444444444444444444',
    submitter: '0x5555555555555555555555555555555555555555',
    hybridIssuer: '0x6666666666666666666666666666666666666666',
    auraIssuer: '0x7777777777777777777777777777777777777777',
    novaIssuer: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    meridianIssuer: '0xcccccccccccccccccccccccccccccccccccccccc',
    kiteIssuer: '0xdddddddddddddddddddddddddddddddddddddddd',
    lp01: '0x8888888888888888888888888888888888888888',
    lp02: '0x9999999999999999999999999999999999999999',
    lp03: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    lp04: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    lp05: '0xffffffffffffffffffffffffffffffffffffffff',
    lp06: '0x1212121212121212121212121212121212121212',
  },
};

// In-memory test data only. The real capture rejects unavailable metrics instead
// of constructing this object with placeholder values.
const snapshot: Snapshot = {
  schemaVersion: 1,
  runId: context.runId,
  timepointId: 't0',
  seq: 0,
  label: {en: 'unit', ko: '단위 테스트'},
  chainId: context.chainId,
  contract: context.torna,
  blockNumber: 2,
  capturedAt: '2026-09-22T00:00:00.000Z',
  amountUnit: 'USDC',
  pool: {
    lpDeposits: 0, lpFeeAccrued: 0, lpLossApplied: 0, netAssetValue: 0,
    advancedOutstanding: 0, cashAvailable: 0, reserve: 0, reserveUsed: 0,
    capHeld: 0, externalDeployed: 0, externalFrozen: false, protocolFee: 0,
  },
  issuers: [],
  liquidityProviders: [],
  positions: [],
  metrics: {
    cumulativeCount: 0, cumulativeAdvanced: 0, lossTotal: 0, lossRatePct: 0,
    repayRatePct: 0, utilizationPct: 0, acquirerTopExposure: 0,
    acquirerExposureLimit: 0, lpDepositCap: 0, rejectedRequests: 0,
  },
  events: [],
};

function mockRuntime(calls: string[]): LocalT0Runtime {
  return {
    async preflight() { calls.push('preflight'); },
    async deploy() { calls.push('deploy'); return structuredClone(context); },
    async execute() { calls.push('execute'); return {timepointId: 't0', blockNumber: 2n}; },
    async capture() { calls.push('capture'); return structuredClone(snapshot); },
    async save() { calls.push('save'); },
  };
}

function mockSegmentRuntime(calls: string[]): LocalScenarioRuntime {
  return {
    async preflight() { calls.push('preflight'); },
    async deploy() { calls.push('deploy'); return structuredClone(context); },
    async execute(_context, id) {
      calls.push(`execute:${id}`);
      return {timepointId: id, blockNumber: BigInt(LOCAL_T0_TO_T5.indexOf(id) + 2)};
    },
    async capture(_context, point) {
      calls.push(`capture:${point.timepointId}`);
      return {
        ...structuredClone(snapshot),
        timepointId: point.timepointId,
        seq: LOCAL_T0_TO_T5.indexOf(point.timepointId),
        blockNumber: Number(point.blockNumber),
      };
    },
    async save(_context, value) { calls.push(`save:${value.timepointId}`); },
  };
}

test('local t0 preflight requires explicit local configuration', () => {
  assert.throws(
      () => loadLocalT0Config({RUN_ID: 'run-local-unit'}),
      LocalT0ConfigurationError);
});

test('local t0 rejects Monad Testnet chain IDs and non-loopback RPC URLs', () => {
  assert.equal(parseLocalChainId('31337'), 31337);
  assert.throws(() => parseLocalChainId('10143'), LocalT0ConfigurationError);
  assert.throws(() => validateLoopbackRpc('https://rpc.monad.xyz'), LocalT0ConfigurationError);
  assert.throws(() => validateLoopbackRpc('http://user:pass@localhost:8545'), LocalT0ConfigurationError);
});

test('public deployment context has no signing configuration', () => {
  assert.doesNotThrow(() => assertPublicT0RunContext(context));
  const serialized = JSON.stringify(context, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value);
  assert.equal(serialized.includes('mnemonic'), false);
  assert.equal(serialized.includes('privateKey'), false);
  const unsafe = {...context, config: {mnemonic: 'unit-only-not-a-secret'}} as unknown as T0RunContext;
  assert.throws(() => assertPublicT0RunContext(unsafe), /must not expose config/);
});

test('local t0 execution report contains only confirmed public metadata', () => {
  const completed = structuredClone(context);
  completed.t0 = {
    refundKey: `0x${'bb'.repeat(32)}`,
    acquirerHash: `0x${'cc'.repeat(32)}`,
    advance: {name: 'advance', hash: `0x${'dd'.repeat(32)}`, blockNumber: 2n},
    repayment: {name: 'repayment', hash: `0x${'ee'.repeat(32)}`, blockNumber: 3n},
  };
  const report = formatLocalT0ExecutionReport(completed, {timepointId: 't0', blockNumber: 3n});
  assert.match(report, /"txHash"/);
  assert.equal(report.includes('mnemonic'), false);
  assert.equal(report.includes('privateKey'), false);
  assert.equal(report.includes('rpcUrl'), false);
});

test('local t0 always runs preflight, deploy, execute, capture, then save', async () => {
  const calls: string[] = [];
  await runLocalT0(mockRuntime(calls));
  assert.deepEqual(calls, ['preflight', 'deploy', 'execute', 'capture', 'save']);
});

test('local t0 through t5 captures each confirmed point before continuing', async () => {
  const calls: string[] = [];
  await runLocalT0ToT5(mockSegmentRuntime(calls));
  assert.deepEqual(calls, [
    'preflight', 'deploy',
    ...LOCAL_T0_TO_T5.flatMap(id => [
      `execute:${id}`, `capture:${id}`, `save:${id}`,
    ]),
  ]);
});

test('a missing required receipt event prevents capture and snapshot save', async () => {
  const calls: string[] = [];
  const runtime = mockRuntime(calls);
  runtime.execute = async () => {
    calls.push('execute');
    throw new ReceiptEventMismatchError('AdvanceIssued');
  };
  await assert.rejects(runLocalT0(runtime), ReceiptEventMismatchError);
  assert.deepEqual(calls, ['preflight', 'deploy', 'execute']);
});
