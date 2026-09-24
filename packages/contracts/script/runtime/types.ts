import type { Address, Hex } from 'viem';
import type { Snapshot, TimepointId } from '../../../../shared/types/snapshot';

/** Public execution context only. Never put keys, mnemonic or authenticated RPC URLs here. */
export interface RunContext {
  runId: string;
  chainId: number;
  torna: Address;
  asset: Address;
  deploymentBlock: bigint;
}

/**
 * Addresses are public execution metadata. Signing material deliberately stays
 * inside the local runtime closure and is never attached to this context.
 */
export interface LocalT0Actors {
  deployer: Address;
  verifier: Address;
  submitter: Address;
  hybridIssuer: Address;
  auraIssuer: Address;
  novaIssuer: Address;
  meridianIssuer: Address;
  kiteIssuer: Address;
  lp01: Address;
  lp02: Address;
  lp03: Address;
  lp04: Address;
  lp05: Address;
  lp06: Address;
  idleVault: Address;
}

export interface ConfirmedTransaction {
  name: string;
  hash: Hex;
  blockNumber: bigint;
  /** Present only for a contract-creation receipt. */
  contractAddress?: Address;
}

/** Public-only metadata retained after the t0 transactions have confirmed. */
export interface T0ExecutionMetadata {
  refundKey: Hex;
  acquirerHash: Hex;
  advance: ConfirmedTransaction;
  repayment: ConfirmedTransaction;
}

export interface T0RunContext extends RunContext {
  actors: LocalT0Actors;
  /** Undefined until the receipt-checked t0 flow has completed. */
  t0?: T0ExecutionMetadata;
  /** Public identifiers needed to continue one local t0 -> t9b run. */
  scenario?: {
    yearlyLoss?: Hex;
    auraEvent: Hex[];
    withdrawalAdvances: Hex[];
    delayedRepayment?: Hex;
    captureBlocks: Partial<Record<TimepointId, bigint>>;
  };
}

const PRIVATE_CONTEXT_KEYS = new Set([
  'accounts', 'config', 'mnemonic', 'privatekey', 'private_key',
  'rpcurl', 'rpc_url', 'secret', 'seed', 'signingaccount',
]);

/** Reject accidental attachment of signing or RPC configuration to public metadata. */
export function assertPublicT0RunContext(context: T0RunContext): void {
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
      if (PRIVATE_CONTEXT_KEYS.has(key.toLowerCase())) {
        throw new Error(`Public t0 context must not expose ${key}.`);
      }
      visit(nested);
    }
  };
  visit(context);
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

/** The deliberately narrow real-chain boundary for the first local timepoint. */
export interface LocalT0Runtime {
  preflight(): Promise<void>;
  deploy(): Promise<T0RunContext>;
  execute(context: T0RunContext): Promise<CapturePoint>;
  capture(context: T0RunContext, point: CapturePoint): Promise<Snapshot>;
  save(context: T0RunContext, snapshot: Snapshot): Promise<void>;
}

/** Receipt-checked local execution boundary for the currently implemented t0 -> t5 segment. */
export interface LocalScenarioRuntime {
  preflight(): Promise<void>;
  deploy(): Promise<T0RunContext>;
  execute(context: T0RunContext, timepointId: TimepointId): Promise<CapturePoint>;
  capture(context: T0RunContext, point: CapturePoint): Promise<Snapshot>;
  save(context: T0RunContext, snapshot: Snapshot): Promise<void>;
}
