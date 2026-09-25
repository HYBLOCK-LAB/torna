import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {
  decodeFunctionData, encodeEventTopics, encodeFunctionData, parseEventLogs,
  type Abi, type Hex,
} from 'viem';

import {tornaEvents} from '../../../shared/abi/events';
import {ledgerCreditAbi} from '../../../shared/abi/ledger-credit';

test('ledger confirmation call matches the compiled Torna ABI', () => {
  const abi = JSON.parse(readFileSync(
      new URL('../out/Torna.sol/Torna.json', import.meta.url), 'utf8')).abi as Abi;
  const actual = abi.find(entry => entry.type === 'function' && entry.name === 'confirmLedgerCredit');
  assert.ok(actual && actual.type === 'function');
  const normalized = JSON.parse(JSON.stringify(
      actual, (key, value) => key === 'internalType' ? undefined : value));
  assert.deepEqual(normalized, ledgerCreditAbi[0]);
});

test('ledger confirmation binds only the exact refund key', () => {
  const refundKey = `0x${'12'.repeat(32)}` as const;
  const data = encodeFunctionData({
    abi: ledgerCreditAbi, functionName: 'confirmLedgerCredit', args: [refundKey],
  });
  assert.deepEqual(decodeFunctionData({abi: ledgerCreditAbi, data}).args, [refundKey]);
});

test('the retry acknowledgment event exposes the same refund key to snapshots', () => {
  const refundKey = `0x${'34'.repeat(32)}` as const;
  const topics = encodeEventTopics({
    abi: tornaEvents, eventName: 'LedgerCreditConfirmed', args: {refundKey},
  }) as [Hex, ...Hex[]];
  const events = parseEventLogs({
    abi: tornaEvents,
    eventName: 'LedgerCreditConfirmed',
    logs: [{
      address: '0x1111111111111111111111111111111111111111',
      blockHash: null,
      blockNumber: null,
      logIndex: null,
      transactionHash: null,
      transactionIndex: null,
      removed: false,
      topics,
      data: '0x',
    }],
  });
  assert.equal(events[0]?.args.refundKey, refundKey);
});
