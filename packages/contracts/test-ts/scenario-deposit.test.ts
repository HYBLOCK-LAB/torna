import assert from 'node:assert/strict';
import {test} from 'node:test';

import {encodeAbiParameters, encodeEventTopics, type Address, type Hex} from 'viem';

import {tornaEvents} from '../../../shared/abi/events';
import type {LocalT0Session} from '../script/deploy';
import {ReceiptEventMismatchError} from '../script/runtime/errors';
import type {ConfirmedTransaction, T0RunContext} from '../script/runtime/types';
import {verifyLiquidityDeposit} from '../script/scenarios/execute';

const torna = '0x1111111111111111111111111111111111111111' as Address;
const lp = '0x2222222222222222222222222222222222222222' as Address;
const other = '0x3333333333333333333333333333333333333333' as Address;
const accepted = 4_166_666_666n;
const rejected = 7_833_333_334n;
const context = {torna} as T0RunContext;
const transaction: ConfirmedTransaction = {
  name: 'partial LP deposit',
  hash: `0x${'ab'.repeat(32)}` as Hex,
  blockNumber: 10n,
};

function depositedLog(amount = accepted, address: Address = torna, depositor: Address = lp) {
  return {
    address,
    topics: encodeEventTopics({
      abi: tornaEvents, eventName: 'LiquidityDeposited', args: {lp: depositor},
    }),
    data: encodeAbiParameters([{type: 'uint256'}], [amount]),
  };
}

function rejectedLog(
    amount = rejected, reason = 2, address: Address = torna, depositor: Address = lp) {
  return {
    address,
    topics: encodeEventTopics({
      abi: tornaEvents, eventName: 'DepositRejected', args: {lp: depositor},
    }),
    data: encodeAbiParameters([{type: 'uint256'}, {type: 'uint8'}], [amount, reason]),
  };
}

function sessionWithLogs(logs: unknown[]): LocalT0Session {
  return {
    publicClient: {getTransactionReceipt: async () => ({logs})},
  } as unknown as LocalT0Session;
}

test('t9b requires exact accepted and rejected receipt amounts from Torna', async () => {
  await verifyLiquidityDeposit(
      sessionWithLogs([depositedLog(), rejectedLog()]),
      context, transaction, lp, accepted, rejected, 2);
  for (const logs of [
    [],
    [depositedLog()],
    [rejectedLog()],
    [depositedLog(accepted - 1n), rejectedLog()],
    [depositedLog(), rejectedLog(rejected + 1n)],
    [depositedLog(), rejectedLog(rejected, 1)],
    [depositedLog(accepted, other), rejectedLog()],
    [depositedLog(), rejectedLog(rejected, 2, other)],
    [depositedLog(accepted, torna, other), rejectedLog()],
    [depositedLog(), rejectedLog(rejected, 2, torna, other)],
    [depositedLog(), depositedLog(), rejectedLog()],
  ]) {
    await assert.rejects(
        verifyLiquidityDeposit(sessionWithLogs(logs), context, transaction, lp, accepted, rejected, 2),
        ReceiptEventMismatchError);
  }
});
