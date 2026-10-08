import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex,
} from 'viem';

import type {AdvanceRequest} from '../../../shared/abi/eip712';
import {tornaEvents} from '../../../shared/abi/events';
import {verifyRejected} from '../script/scenarios/execute';
import type {LocalT0Session} from '../script/deploy';
import {ReceiptEventMismatchError} from '../script/runtime/errors';
import type {ConfirmedTransaction, T0RunContext} from '../script/runtime/types';

const torna = '0x1111111111111111111111111111111111111111' as Address;
const other = '0x2222222222222222222222222222222222222222' as Address;
const refundKey = `0x${'ab'.repeat(32)}` as Hex;
const transaction: ConfirmedTransaction = {
  name: 'rejected test request',
  hash: `0x${'cd'.repeat(32)}` as Hex,
  blockNumber: 10n,
};
const request: AdvanceRequest = {
  refundKey,
  issuer: other,
  acquirerHash: `0x${'ef'.repeat(32)}` as Hex,
  amount: 1_000_000_000n,
  maturity: 100n,
  nonce: 0n,
  deadline: 99n,
};
const context = {torna} as T0RunContext;

function rejectedLog(reason: number, address: Address = torna, key: Hex = refundKey) {
  return {
    address,
    topics: encodeEventTopics({
      abi: tornaEvents,
      eventName: 'AdvanceRejected',
      args: {refundKey: key},
    }),
    data: encodeAbiParameters([{type: 'uint8'}], [reason]),
  };
}

function issuedLog() {
  return {
    address: torna,
    topics: encodeEventTopics({
      abi: tornaEvents,
      eventName: 'AdvanceIssued',
      args: {refundKey, issuer: other},
    }),
    data: encodeAbiParameters(
        [{type: 'uint256'}, {type: 'uint64'}],
        [request.amount, request.maturity]),
  };
}

function sessionWithLogs(logs: unknown[]): LocalT0Session {
  return {
    publicClient: {getTransactionReceipt: async () => ({logs})},
  } as unknown as LocalT0Session;
}

test('t8 accepts only a matching on-contract rejection receipt', async () => {
  await verifyRejected(sessionWithLogs([rejectedLog(3)]), context, transaction, request, 3);
  for (const logs of [
    [],
    [rejectedLog(5)],
    [rejectedLog(3, other)],
    [rejectedLog(3, torna, `0x${'00'.repeat(32)}` as Hex)],
    [rejectedLog(3), issuedLog()],
    [rejectedLog(3), rejectedLog(3)],
  ]) {
    await assert.rejects(
        verifyRejected(sessionWithLogs(logs), context, transaction, request, 3),
        ReceiptEventMismatchError);
  }
});
