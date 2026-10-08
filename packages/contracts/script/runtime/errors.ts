export class ScaffoldNotImplementedError extends Error {
  constructor(component: string) {
    super(`${component} is not wired yet. No chain execution or snapshot generation is available.`);
    this.name = 'ScaffoldNotImplementedError';
  }
}

/** Never include a private key, mnemonic or full authenticated RPC URL in this error. */
export class LocalT0ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalT0ConfigurationError';
  }
}

export class LocalT0ChainMismatchError extends Error {
  constructor(expected: number, actual: number) {
    super(`Local t0 chain ID mismatch: expected ${expected}, received ${actual}.`);
    this.name = 'LocalT0ChainMismatchError';
  }
}

export class ReceiptEventMismatchError extends Error {
  constructor(eventName: string) {
    super(`Confirmed receipt is missing the required Torna ${eventName} event.`);
    this.name = 'ReceiptEventMismatchError';
  }
}

/** A required snapshot field has no corresponding on-chain state yet. */
export class SnapshotMetricUnavailableError extends Error {
  constructor(metrics: readonly string[]) {
    super(`Cannot create a snapshot without on-chain metrics: ${metrics.join(', ')}.`);
    this.name = 'SnapshotMetricUnavailableError';
  }
}

export class FullScenarioNotImplementedError extends Error {
  constructor() {
    super('Local t7 needs ledger IO and finalization is not wired. The full 13-timepoint runner remains unavailable.');
    this.name = 'FullScenarioNotImplementedError';
  }
}
