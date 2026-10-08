import { LocalT0ConfigurationError } from './errors';
import { deriveT0SigningAccounts, type LocalT0Config } from './local-config';

export const MONAD_TESTNET_CHAIN_ID = 10143;
export const TESTNET_BROADCAST_ACK = 'I_ACCEPT_TESTNET_GAS';
export const TESTNET_MIN_BUDGET_MON = 15;

export const TESTNET_ENV = {
  rpcUrl: 'TORNA_TESTNET_RPC_URL',
  mnemonic: 'TORNA_TESTNET_MNEMONIC',
  runId: 'RUN_ID',
  broadcast: 'TORNA_TESTNET_BROADCAST',
  gasBudget: 'TORNA_TESTNET_GAS_BUDGET_MON',
} as const;

export interface MonadTestnetConfig extends LocalT0Config {
  readonly target: 'testnet';
  readonly gasBudgetWei: bigint;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new LocalT0ConfigurationError(`Missing required Testnet setting: ${name}.`);
  return value;
}

function positiveDecimal(raw: string, name: string): bigint {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/.test(raw)) {
    throw new LocalT0ConfigurationError(`${name} must be a positive MON amount with at most 18 decimals.`);
  }
  const [whole, fraction = ''] = raw.split('.');
  return BigInt(whole!) * 10n ** 18n + BigInt(fraction.padEnd(18, '0') || '0');
}

export function validateMonadTestnetRpc(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LocalT0ConfigurationError('TORNA_TESTNET_RPC_URL must be an HTTPS Monad Testnet RPC URL.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' || loopback || url.username || url.password) {
    throw new LocalT0ConfigurationError(
        'TORNA_TESTNET_RPC_URL must be a credential-free HTTPS public endpoint, not a local RPC.');
  }
  return url.toString();
}

/** Explicitly opt-in Testnet config; this does not connect or send transactions. */
export function loadMonadTestnetConfig(
    environment: NodeJS.ProcessEnv = process.env): MonadTestnetConfig {
  const rpcUrl = validateMonadTestnetRpc(required(environment, TESTNET_ENV.rpcUrl));
  const runId = required(environment, TESTNET_ENV.runId);
  if (!/^run-testnet-[a-z0-9-]+$/.test(runId)) {
    throw new LocalT0ConfigurationError('Testnet RUN_ID must start with "run-testnet-".');
  }
  if (environment[TESTNET_ENV.broadcast]?.trim() !== TESTNET_BROADCAST_ACK) {
    throw new LocalT0ConfigurationError(
        `Set ${TESTNET_ENV.broadcast}=${TESTNET_BROADCAST_ACK} to explicitly enable Testnet writes.`);
  }
  const budgetText = required(environment, TESTNET_ENV.gasBudget);
  const gasBudgetWei = positiveDecimal(budgetText, TESTNET_ENV.gasBudget);
  if (gasBudgetWei < BigInt(TESTNET_MIN_BUDGET_MON) * 10n ** 18n) {
    throw new LocalT0ConfigurationError(
        `${TESTNET_ENV.gasBudget} must be at least ${TESTNET_MIN_BUDGET_MON} MON per PROJECT_SPEC.`);
  }
  const mnemonic = required(environment, TESTNET_ENV.mnemonic);
  return {
    target: 'testnet',
    rpcUrl,
    chainId: MONAD_TESTNET_CHAIN_ID,
    runId,
    accounts: deriveT0SigningAccounts(mnemonic),
    gasBudgetWei,
  };
}
