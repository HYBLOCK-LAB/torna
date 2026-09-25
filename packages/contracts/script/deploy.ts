import { readFileSync } from 'node:fs';

import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  type Abi,
  type Address,
  type Hex,
} from 'viem';

import {
  LocalT0ChainMismatchError,
  LocalT0ConfigurationError,
} from './runtime/errors';
import type { LocalT0Config, LocalT0SigningAccounts } from './runtime/local-config';
import { publicActors } from './runtime/local-config';
import { assertPublicT0RunContext, type ConfirmedTransaction, type T0RunContext } from './runtime/types';

export type LocalT0Actor = keyof LocalT0SigningAccounts;

export interface ContractArtifact {
  abi: Abi;
  bytecode: Hex;
}

export interface LocalT0Session {
  /** Private configuration: never serialize or expose this object. */
  config: LocalT0Config;
  publicClient: ReturnType<typeof createPublicClient>;
}

function readArtifact(file: string): ContractArtifact {
  let artifact: { abi?: Abi; bytecode?: { object?: string } };
  try {
    artifact = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
  } catch {
    throw new LocalT0ConfigurationError(
        `Missing compiled artifact ${file}. Run the contracts build before local t0.`);
  }
  const bytecode = artifact.bytecode?.object;
  if (!artifact.abi || !bytecode || bytecode === '0x') {
    throw new LocalT0ConfigurationError(`Compiled artifact ${file} has no deployable bytecode.`);
  }
  return { abi: artifact.abi, bytecode: bytecode as Hex };
}

export function loadProtocolArtifacts(): { mockUsdc: ContractArtifact; torna: ContractArtifact } {
  return {
    mockUsdc: readArtifact('../out/MockUSDC.sol/MockUSDC.json'),
    torna: readArtifact('../out/Torna.sol/Torna.json'),
  };
}

export function createLocalT0Session(config: LocalT0Config): LocalT0Session {
  return {
    config,
    publicClient: createPublicClient({ transport: http(config.rpcUrl) }),
  };
}

function wallet(session: LocalT0Session, actor: LocalT0Actor) {
  return createWalletClient({
    account: session.config.accounts[actor],
    transport: http(session.config.rpcUrl),
  });
}

async function confirm(
    session: LocalT0Session, name: string, hash: Hex): Promise<ConfirmedTransaction> {
  const receipt = await session.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new Error(`${name} transaction reverted before confirmation.`);
  }
  return {
    name,
    hash,
    blockNumber: receipt.blockNumber,
    ...(receipt.contractAddress ? { contractAddress: receipt.contractAddress } : {}),
  };
}

/** Send a contract call and retain only public receipt metadata. */
export async function submitContract(
    session: LocalT0Session,
    actor: LocalT0Actor,
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
    name: string,
): Promise<ConfirmedTransaction> {
  const data = encodeFunctionData({ abi, functionName, args } as never);
  const hash = await wallet(session, actor).sendTransaction({
    account: session.config.accounts[actor],
    // The RPC chain id is checked in preflight rather than hard-coded here.
    chain: undefined,
    to: address,
    data,
  });
  return confirm(session, name, hash);
}

/** Read a public contract value. Callers must narrow the result before using it. */
export async function readContractValue(
    session: LocalT0Session,
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[] = [],
    blockNumber?: bigint,
): Promise<unknown> {
  return session.publicClient.readContract({
    address, abi, functionName, args, ...(blockNumber === undefined ? {} : { blockNumber }),
  } as never);
}

/**
 * This runner is local-only. Reading and comparing the RPC chain id prevents
 * a copied environment file from broadcasting to Monad Testnet by mistake.
 */
export async function preflightLocalT0(session: LocalT0Session): Promise<void> {
  const actualChainId = await session.publicClient.getChainId();
  if (actualChainId !== session.config.chainId) {
    throw new LocalT0ChainMismatchError(session.config.chainId, actualChainId);
  }
  if (actualChainId === 10143) {
    throw new LocalT0ConfigurationError('Local t0 refuses Monad Testnet (10143).');
  }
  loadProtocolArtifacts();
  for (const actor of [
    'deployer', 'verifier', 'submitter',
    'lp01', 'lp02', 'lp03', 'lp04', 'lp05', 'lp06',
  ] as const) {
    const balance = await session.publicClient.getBalance({
      address: session.config.accounts[actor].address,
    });
    if (balance === 0n) {
      throw new LocalT0ConfigurationError(
          `Local account ${actor} has no native balance for its required transaction gas.`);
    }
  }
}

/** Deploy only the two PRD contracts after preflight has explicitly succeeded. */
export async function deployProtocol(session: LocalT0Session): Promise<T0RunContext> {
  const { mockUsdc, torna } = loadProtocolArtifacts();
  const deployer = wallet(session, 'deployer');
  const assetHash = await deployer.deployContract({
    account: session.config.accounts.deployer,
    abi: mockUsdc.abi,
    bytecode: mockUsdc.bytecode,
    args: [session.config.accounts.deployer.address],
  } as never);
  const assetReceipt = await confirm(session, 'MockUSDC deployment', assetHash);
  const asset = assetReceipt.contractAddress;
  if (!asset) throw new Error('MockUSDC deployment receipt has no contract address.');

  const tornaHash = await deployer.deployContract({
    account: session.config.accounts.deployer,
    abi: torna.abi,
    bytecode: torna.bytecode,
    args: [
      asset,
      session.config.accounts.deployer.address,
      session.config.accounts.verifier.address,
      session.config.accounts.submitter.address,
    ],
  } as never);
  const tornaReceipt = await confirm(session, 'Torna deployment', tornaHash);
  const tornaAddress = tornaReceipt.contractAddress;
  if (!tornaAddress) throw new Error('Torna deployment receipt has no contract address.');

  const context: T0RunContext = {
    runId: session.config.runId,
    chainId: session.config.chainId,
    torna: tornaAddress,
    asset,
    deploymentBlock: tornaReceipt.blockNumber,
    actors: publicActors(session.config.accounts),
  };
  assertPublicT0RunContext(context);
  return context;
}
