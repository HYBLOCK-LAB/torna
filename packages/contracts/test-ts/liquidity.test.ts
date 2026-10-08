import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {
  decodeFunctionData,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  encodeFunctionResult,
  parseEventLogs,
  type Abi,
  type Hex,
} from 'viem';

import {tornaEvents} from '../../../shared/abi/events';
import {liquidityAbi} from '../../../shared/abi/liquidity';

const lp = '0x1111111111111111111111111111111111111111' as const;
const amount = 4_166_666_666n;

function logTopics(topics: ReturnType<typeof encodeEventTopics>): [Hex, ...Hex[]] {
  assert.ok(topics.length > 0 && topics.every(topic => typeof topic === 'string'));
  return topics as [Hex, ...Hex[]];
}

test('post-bootstrap liquidity ABI exactly matches the compiled Torna ABI', () => {
  const abi = JSON.parse(readFileSync(
      new URL('../out/Torna.sol/Torna.json', import.meta.url), 'utf8')).abi as Abi;
  for (const expected of liquidityAbi) {
    const actual = abi.find(entry => entry.type === 'function' && entry.name === expected.name);
    assert.ok(actual && actual.type === 'function', expected.name);
    const normalized = JSON.parse(JSON.stringify(
        actual, (key, value) => key === 'internalType' ? undefined : value));
    assert.deepEqual(normalized, expected);
  }
});

test('deposit request and accepted result retain six-decimal integer precision', () => {
  const data = encodeFunctionData({
    abi: liquidityAbi, functionName: 'depositLiquidity', args: [amount],
  });
  assert.deepEqual(
      decodeFunctionData({abi: liquidityAbi, data}).args, [amount]);
  const result = encodeFunctionResult({
    abi: liquidityAbi, functionName: 'depositLiquidity', result: amount,
  });
  assert.equal(
      decodeFunctionResult({abi: liquidityAbi, functionName: 'depositLiquidity', data: result}), amount);
});

test('partial rejection is decoded as the rejected remainder with the PRD reason code', () => {
  const events = parseEventLogs({
    abi: tornaEvents,
    eventName: 'DepositRejected',
    logs: [{
      address: '0x2222222222222222222222222222222222222222',
      blockHash: null,
      blockNumber: null,
      logIndex: null,
      transactionHash: null,
      transactionIndex: null,
      removed: false,
      topics: logTopics(encodeEventTopics({
        abi: tornaEvents, eventName: 'DepositRejected', args: {lp},
      })),
      data: encodeAbiParameters([{type: 'uint256'}, {type: 'uint8'}], [9_500_000_000n, 1]),
    }],
  });
  assert.equal(events[0].args.lp, lp);
  assert.equal(events[0].args.amount, 9_500_000_000n);
  assert.equal(events[0].args.reason, 1);
});
