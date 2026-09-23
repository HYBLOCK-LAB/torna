import { mnemonicToAccount } from 'viem/accounts';

import { LocalT0ConfigurationError } from './errors';
import type { LocalT0Actors } from './types';

type SigningAccount = ReturnType<typeof mnemonicToAccount>;

export interface LocalT0SigningAccounts {
  deployer: SigningAccount;
  verifier: SigningAccount;
  submitter: SigningAccount;
  hybridIssuer: SigningAccount;
  auraIssuer: SigningAccount;
  novaIssuer: SigningAccount;
  meridianIssuer: SigningAccount;
  kiteIssuer: SigningAccount;
  lp01: SigningAccount;
  lp02: SigningAccount;
  lp03: SigningAccount;
  lp04: SigningAccount;
  lp05: SigningAccount;
  lp06: SigningAccount;
}

/**
 * This object is private runtime state. Do not serialize it, attach it to a
 * RunContext, or print it: its account objects can sign transactions.
 */
export interface LocalT0Config {
  rpcUrl: string;
  chainId: number;
  runId: string;
  accounts: LocalT0SigningAccounts;
}

export const LOCAL_T0_ENV = {
  rpcUrl: 'TORNA_LOCAL_RPC_URL',
  chainId: 'TORNA_LOCAL_CHAIN_ID',
  mnemonic: 'TORNA_LOCAL_MNEMONIC',
  runId: 'RUN_ID',
} as const;

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new LocalT0ConfigurationError(`Missing required local t0 setting: ${name}.`);
  return value;
}

export function parseLocalChainId(raw: string): number {
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new LocalT0ConfigurationError('TORNA_LOCAL_CHAIN_ID must be a positive integer.');
  }
  const chainId = Number(raw);
  if (!Number.isSafeInteger(chainId) || chainId === 10143) {
    throw new LocalT0ConfigurationError(
        'TORNA_LOCAL_CHAIN_ID must be a safe local chain ID and must not be Monad Testnet (10143).');
  }
  return chainId;
}

export function validateLoopbackRpc(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LocalT0ConfigurationError('TORNA_LOCAL_RPC_URL must be a valid HTTP loopback URL.');
  }
  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    || url.hostname === '[::1]' || url.hostname === '::1';
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !isLoopback
      || url.username || url.password || url.search) {
    throw new LocalT0ConfigurationError(
        'TORNA_LOCAL_RPC_URL must be a credential-free loopback endpoint, not a public or authenticated RPC URL.');
  }
  return url.toString();
}

function accountAt(mnemonic: string, addressIndex: number): SigningAccount {
  try {
    return mnemonicToAccount(mnemonic, { addressIndex });
  } catch {
    throw new LocalT0ConfigurationError('TORNA_LOCAL_MNEMONIC is not a valid local test mnemonic.');
  }
}

export function publicActors(accounts: LocalT0SigningAccounts): LocalT0Actors {
  return {
    deployer: accounts.deployer.address,
    verifier: accounts.verifier.address,
    submitter: accounts.submitter.address,
    hybridIssuer: accounts.hybridIssuer.address,
    auraIssuer: accounts.auraIssuer.address,
    novaIssuer: accounts.novaIssuer.address,
    meridianIssuer: accounts.meridianIssuer.address,
    kiteIssuer: accounts.kiteIssuer.address,
    lp01: accounts.lp01.address,
    lp02: accounts.lp02.address,
    lp03: accounts.lp03.address,
    lp04: accounts.lp04.address,
    lp05: accounts.lp05.address,
    lp06: accounts.lp06.address,
  };
}

/**
 * Derivation follows the PRD's account-index allocation. It accepts only
 * explicitly supplied local test configuration and never falls back to anvil
 * defaults, a public RPC or a production mnemonic.
 */
export function loadLocalT0Config(
    environment: NodeJS.ProcessEnv = process.env): LocalT0Config {
  const rpcUrl = validateLoopbackRpc(required(environment, LOCAL_T0_ENV.rpcUrl));
  const chainId = parseLocalChainId(required(environment, LOCAL_T0_ENV.chainId));
  const runId = required(environment, LOCAL_T0_ENV.runId);
  if (!/^run-local-[a-z0-9-]+$/.test(runId)) {
    throw new LocalT0ConfigurationError('RUN_ID for local t0 must start with "run-local-".');
  }
  const mnemonic = required(environment, LOCAL_T0_ENV.mnemonic);
  const accounts = {
    deployer: accountAt(mnemonic, 0),
    verifier: accountAt(mnemonic, 1),
    submitter: accountAt(mnemonic, 2),
    hybridIssuer: accountAt(mnemonic, 3),
    auraIssuer: accountAt(mnemonic, 4),
    novaIssuer: accountAt(mnemonic, 5),
    meridianIssuer: accountAt(mnemonic, 6),
    kiteIssuer: accountAt(mnemonic, 7),
    lp01: accountAt(mnemonic, 8),
    lp02: accountAt(mnemonic, 9),
    lp03: accountAt(mnemonic, 10),
    lp04: accountAt(mnemonic, 11),
    lp05: accountAt(mnemonic, 12),
    lp06: accountAt(mnemonic, 13),
  } satisfies LocalT0SigningAccounts;
  return { rpcUrl, chainId, runId, accounts };
}
