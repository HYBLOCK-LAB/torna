import { access, mkdir, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Snapshot } from '../../../shared/types/snapshot';
import { loadProtocolArtifacts, readContractValue, type LocalT0Session } from './deploy';
import {
  FullScenarioNotImplementedError,
  SnapshotMetricUnavailableError,
} from './runtime/errors';
import type { CapturePoint, RunContext, T0RunContext } from './runtime/types';

const SNAPSHOT_ROOT = fileURLToPath(new URL('../../../shared/snapshots', import.meta.url));

/**
 * These fields have no state or event-backed source in the current Torna
 * contract. A capture must fail rather than infer that they are zero at t0.
 */
const UNAVAILABLE_T0_METRICS = [
  'pool.lpLossApplied',
  'pool.reserveUsed',
  'pool.capHeld',
  'pool.externalDeployed',
  'pool.externalFrozen',
  'metrics.lossTotal',
  'metrics.lossRatePct',
  'metrics.repayRatePct',
  'metrics.acquirerTopExposure',
  'metrics.acquirerExposureLimit',
  'metrics.lpDepositCap',
  'metrics.rejectedRequests',
] as const;

interface T0ReadableState {
  lpPrincipal: bigint;
  lpFees: bigint;
  outstanding: bigint;
  reserve: bigint;
  protocolFees: bigint;
  cumulativeCount: bigint;
  cumulativeAdvanced: bigint;
}

function asBigInt(value: unknown, field: string): bigint {
  if (typeof value !== 'bigint') {
    throw new Error(`Torna ${field} returned a non-integer value.`);
  }
  return value;
}

/**
 * Read only values that Torna currently exposes. This deliberately does not
 * manufacture a Snapshot: callers receive an explicit error below until every
 * required schema metric has an on-chain source.
 */
async function readT0State(
    session: LocalT0Session, context: T0RunContext, point: CapturePoint): Promise<T0ReadableState> {
  const { torna } = loadProtocolArtifacts();
  const read = async (functionName: string): Promise<bigint> => asBigInt(
      await readContractValue(
          session, context.torna, torna.abi, functionName, [], point.blockNumber), functionName);
  // Every query is pinned to the final t0 receipt block, never to a later tip.
  const [lpPrincipal, lpFees, outstanding, reserve, protocolFees, cumulativeCount, cumulativeAdvanced] =
      await Promise.all([
        read('totalLpPrincipal'),
        read('totalLpFees'),
        read('totalOutstanding'),
        read('reserveBalance'),
        read('protocolFees'),
        read('totalAdvanceCount'),
        read('totalAdvanced'),
      ]);
  return {
    lpPrincipal,
    lpFees,
    outstanding,
    reserve,
    protocolFees,
    cumulativeCount,
    cumulativeAdvanced,
  };
}

/**
 * Capture boundary for the actual local t0 flow. It never imports a sample
 * JSON file and it cannot return a partly invented schema object.
 */
export async function captureT0Snapshot(
    session: LocalT0Session, context: T0RunContext, point: CapturePoint): Promise<Snapshot> {
  if (point.timepointId !== 't0' || !context.t0) {
    throw new FullScenarioNotImplementedError();
  }
  await readT0State(session, context, point);
  throw new SnapshotMetricUnavailableError(UNAVAILABLE_T0_METRICS);
}

/** Generic runner entry point; only t0 has a real chain-capture boundary. */
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
  if (snapshot.runId !== context.runId || snapshot.timepointId !== 't0' || snapshot.seq !== 0
      || snapshot.chainId !== context.chainId
      || snapshot.contract.toLowerCase() !== context.torna.toLowerCase()) {
    throw new Error('Refusing to save a snapshot whose identity does not match the local t0 context.');
  }
}

/**
 * Write a newly captured local t0 once. `wx` makes a repeated file write fail,
 * and the first snapshot refuses to reuse a prior run directory.
 */
export async function saveT0Snapshot(context: T0RunContext, snapshot: Snapshot): Promise<void> {
  assertSaveIdentity(context, snapshot);
  const directory = snapshotDirectory(context.runId);
  try {
    await mkdir(directory, { recursive: false });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`Refusing to reuse existing snapshot run directory: ${context.runId}.`);
    }
    throw error;
  }
  const output = resolve(directory, 't0.json');
  await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

/** Generic runner entry point; only t0 can save and only after strict capture. */
export async function saveSnapshot(_context: RunContext, _snapshot: Snapshot): Promise<void> {
  throw new FullScenarioNotImplementedError();
}

/** There is no 13-timepoint generated bundle until every handler and metric exists. */
export async function finalizeBundle(_context: RunContext): Promise<void> {
  throw new FullScenarioNotImplementedError();
}

/** Exposed to tests so failed capture can prove it did not create a run folder. */
export async function snapshotRunExists(runId: string): Promise<boolean> {
  try {
    await access(snapshotDirectory(runId));
    return true;
  } catch {
    return false;
  }
}
