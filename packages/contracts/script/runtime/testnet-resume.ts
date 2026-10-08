import {access, readFile, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import {acquirerHashOf, refundKeyOf} from '@torna/adapter';
import {parseEventLogs, type Address, type Hex} from 'viem';

import type {Snapshot} from '../../../../shared/types/snapshot';
import {loadProtocolArtifacts, readContractValue, type LocalT0Session} from '../deploy';
import {publicActors} from './local-config';
import type {T7LedgerIO} from './ledger';
import type {T0RunContext} from './types';

const SNAPSHOT_ROOT = fileURLToPath(new URL('../../../../shared/snapshots/', import.meta.url));
const LABEL_ROOT = fileURLToPath(new URL('../../../../shared/labels/', import.meta.url));
const LOG_BLOCK_SPAN = 200n;

export interface AuditedT1Resume {
  context: T0RunContext;
  resumeFrom: number;
  nextRefundId: string;
  confirmedNonce: number;
}

function requireHex(value: unknown, bytes: number, name: string): Hex {
  if (typeof value !== 'string' || !new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(value)) {
    throw new Error(`Invalid ${name} in saved t0 evidence.`);
  }
  return value as Hex;
}

function positionField(position: unknown, name: string, index: number): unknown {
  if (Array.isArray(position)) return position[index];
  if (position && typeof position === 'object' && name in position) {
    return (position as Record<string, unknown>)[name];
  }
  throw new Error(`Recovered t0 position has no ${name}.`);
}

/** Read-only proof that a partial t1 has no gaps, duplicate refunds or pending sends. */
export async function auditTestnetT1Resume(
    session: LocalT0Session, ledger: T7LedgerIO): Promise<AuditedT1Resume> {
  if (session.target !== 'testnet' || session.config.chainId !== 10143) {
    throw new Error('A t1 resume can only inspect Monad Testnet.');
  }
  const runId = session.config.runId;
  const directory = resolve(SNAPSHOT_ROOT, runId);
  const files = await readdir(directory);
  if (files.length !== 1 || files[0] !== 't0.json') {
    throw new Error('The interrupted run must contain only its confirmed t0 snapshot.');
  }
  try {
    await access(resolve(LABEL_ROOT, `${runId}.json`));
    throw new Error('The interrupted run already has a label file.');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const snapshot = JSON.parse(await readFile(resolve(directory, 't0.json'), 'utf8')) as Snapshot;
  if (snapshot.runId !== runId || snapshot.chainId !== 10143
      || snapshot.timepointId !== 't0' || snapshot.seq !== 0
      || !Number.isSafeInteger(snapshot.blockNumber)) {
    throw new Error('Saved t0 snapshot does not identify this Testnet run.');
  }
  const tornaAddress = requireHex(snapshot.contract, 20, 'Torna address') as Address;
  const t0Key = refundKeyOf('REF-2026-001');
  const issued = snapshot.events.filter(event => event.name === 'AdvanceIssued');
  const repaid = snapshot.events.filter(event => event.name === 'AdvanceRepaid');
  if (issued.length !== 1 || repaid.length !== 1
      || issued[0]?.target.toLowerCase() !== t0Key.toLowerCase()
      || repaid[0]?.target.toLowerCase() !== t0Key.toLowerCase()) {
    throw new Error('Saved t0 does not contain the one expected issue and repayment.');
  }
  const advanceHash = requireHex(issued[0].txHash, 32, 't0 advance hash');
  const repaymentHash = requireHex(repaid[0].txHash, 32, 't0 repayment hash');
  const firstEventBlock = Math.min(...snapshot.events.map(event => event.blockNumber));
  if (!Number.isSafeInteger(firstEventBlock)
      || !snapshot.events.some(event =>
        event.name === 'RoleGranted' && event.blockNumber === firstEventBlock)
      || firstEventBlock > snapshot.blockNumber) {
    throw new Error('Saved t0 has no verified deployment event block.');
  }
  const {torna} = loadProtocolArtifacts();
  const asset = await readContractValue(session, tornaAddress, torna.abi, 'asset');
  const assetAddress = requireHex(asset, 20, 'asset address') as Address;
  const position = await readContractValue(
      session, tornaAddress, torna.abi, 'positionOf', [t0Key]);
  const acquirerHash = acquirerHashOf('ACQ-α');
  if (positionField(position, 'exists', 0) !== true
      || String(positionField(position, 'issuer', 1)).toLowerCase()
        !== session.config.accounts.hybridIssuer.address.toLowerCase()
      || String(positionField(position, 'acquirerHash', 2)).toLowerCase()
        !== acquirerHash.toLowerCase()
      || positionField(position, 'amount', 3) !== 1_000_000_000n
      || Number(positionField(position, 'state', 9)) !== 2) {
    throw new Error('Live t0 position differs from the saved Repaid position.');
  }
  const pendingCredits = await ledger.store.pending();
  if (pendingCredits.length !== 1
      || pendingCredits[0]?.refundKey.toLowerCase() !== t0Key.toLowerCase()
      || typeof pendingCredits[0]?.advanceTxHash !== 'string'
      || pendingCredits[0].advanceTxHash.toLowerCase() !== advanceHash.toLowerCase()
      || await ledger.store.creditCount(t0Key) !== 1
      || await ledger.cardholderBalance() !== '1300.00') {
    throw new Error('The local ledger no longer matches the saved t0 retry state.');
  }
  const yearlyRows = ledger.scenarioRows?.filter(row => row.timepoint === 't1');
  const orderedRows = yearlyRows && [
    ...yearlyRows.filter(row => row.refund_id !== 'REF-2026-021'),
    ...yearlyRows.filter(row => row.refund_id === 'REF-2026-021'),
  ];
  if (!orderedRows || orderedRows.length !== 365
      || orderedRows.at(-1)?.refund_id !== 'REF-2026-021') {
    throw new Error('The local DB no longer has the expected 365 t1 refunds.');
  }
  const [confirmedNonce, pendingNonce, totalAdvanceCount, latest] = await Promise.all([
    session.publicClient.getTransactionCount({
      address: session.config.accounts.submitter.address, blockTag: 'latest',
    }),
    session.publicClient.getTransactionCount({
      address: session.config.accounts.submitter.address, blockTag: 'pending',
    }),
    readContractValue(session, tornaAddress, torna.abi, 'totalAdvanceCount'),
    session.publicClient.getBlockNumber(),
  ]);
  if (confirmedNonce !== pendingNonce || typeof totalAdvanceCount !== 'bigint') {
    throw new Error('A submitter transaction is pending or the chain count is invalid.');
  }
  const issuedKeys: string[] = [];
  const repaidKeys: string[] = [];
  for (let fromBlock = BigInt(snapshot.blockNumber) + 1n; fromBlock <= latest;
    fromBlock += LOG_BLOCK_SPAN) {
    const end = fromBlock + LOG_BLOCK_SPAN - 1n;
    const toBlock = end < latest ? end : latest;
    const logs = await session.publicClient.getLogs({
      address: tornaAddress, fromBlock, toBlock,
    });
    const events = parseEventLogs({abi: torna.abi, logs, strict: false});
    for (const event of events) {
      if (event.eventName !== 'AdvanceIssued' && event.eventName !== 'AdvanceRepaid') continue;
      const key = (event.args as {refundKey?: unknown}).refundKey;
      if (typeof key !== 'string') throw new Error('A t1 event has no refund key.');
      if (event.eventName === 'AdvanceIssued') issuedKeys.push(key.toLowerCase());
      else repaidKeys.push(key.toLowerCase());
    }
  }
  if (issuedKeys.length === 0 || issuedKeys.length >= 365
      || issuedKeys.length !== repaidKeys.length
      || totalAdvanceCount !== BigInt(issuedKeys.length + 1)) {
    throw new Error('The partial t1 issue, repayment and chain counts do not agree.');
  }
  for (let index = 0; index < issuedKeys.length; index++) {
    const expectedKey = orderedRows[index]!.refund_key?.toLowerCase();
    if (!expectedKey || issuedKeys[index] !== expectedKey
        || repaidKeys[index] !== expectedKey) {
      throw new Error(`The on-chain t1 sequence differs at row ${index + 1}.`);
    }
  }
  const context: T0RunContext = {
    runId, chainId: 10143, torna: tornaAddress, asset: assetAddress,
    deploymentBlock: BigInt(firstEventBlock),
    actors: publicActors(session.config.accounts),
    t0: {
      refundKey: t0Key,
      acquirerHash,
      advance: {
        name: 'Issue t0 advance',
        hash: advanceHash,
        blockNumber: BigInt(issued[0].blockNumber),
      },
      repayment: {
        name: 'Repay t0 advance',
        hash: repaymentHash,
        blockNumber: BigInt(repaid[0].blockNumber),
      },
    },
    scenario: {
      auraEvent: [], withdrawalAdvances: [],
      captureBlocks: {t0: BigInt(snapshot.blockNumber)},
    },
  };
  return {
    context,
    resumeFrom: issuedKeys.length,
    nextRefundId: orderedRows[issuedKeys.length]!.refund_id,
    confirmedNonce,
  };
}
