import type { Address } from 'viem';
import type { Snapshot, TimepointId } from '../../../../shared/types/snapshot';

/** Public execution context only. Never put keys, mnemonic or authenticated RPC URLs here. */
export interface RunContext {
  runId: string;
  chainId: number;
  torna: Address;
  asset: Address;
  deploymentBlock: bigint;
}

export interface CapturePoint {
  timepointId: TimepointId;
  /** Read every state query and log range against this same confirmed block. */
  blockNumber: bigint;
}

/** Chain implementation belongs to Minseo; adapter calls remain Minjae's implementation. */
export interface ScenarioRuntime {
  /** Must fail before any deployment if configuration or required features are missing. */
  preflight(): Promise<void>;
  deploy(): Promise<RunContext>;
  /** Submit sequentially and wait for receipts, returning the last confirmed block. */
  execute(context: RunContext, timepointId: TimepointId): Promise<CapturePoint>;
  /** Capture immediately, not after executing all twelve timepoints. */
  capture(context: RunContext, point: CapturePoint): Promise<Snapshot>;
  /** Must refuse an existing run directory/file rather than overwriting a prior run. */
  save(context: RunContext, snapshot: Snapshot): Promise<void>;
  /** Write manifest only after all snapshots exist and the same-run label map is verified. */
  finalize(context: RunContext): Promise<void>;
}
