import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  encodeFunctionData, decodeFunctionData, encodeFunctionResult, decodeFunctionResult,
  encodeEventTopics, encodeAbiParameters, parseEventLogs, type Abi, type Hex,
} from 'viem';
import { advanceAbi } from '../../../shared/abi/advance';
import { tornaEvents } from '../../../shared/abi/events';
import { advanceRequestTypes, type AdvanceRequest } from '../../../shared/abi/eip712';

const request: AdvanceRequest = {
  refundKey: `0x${'11'.repeat(32)}`, issuer: '0x3333333333333333333333333333333333333333',
  acquirerHash: `0x${'22'.repeat(32)}`, amount: 1_000_000_000n,
  maturity: 1_800_000_000n, nonce: 0n, deadline: 1_799_999_999n,
};
// Placeholder encoding bytes, not a live authorization.
const signature = `0x${'aa'.repeat(65)}` as Hex;
const permit = { deadline: request.deadline, v: 27, r: `0x${'bb'.repeat(32)}` as Hex, s: `0x${'cc'.repeat(32)}` as Hex };

function logTopics(topics: ReturnType<typeof encodeEventTopics>): [Hex, ...Hex[]] {
  // encodeEventTopics also supports filter wildcards/OR arrays; these are concrete logs.
  assert.ok(topics.length > 0 && topics.every(topic => typeof topic === 'string'));
  return topics as [Hex, ...Hex[]];
}

test('advance functions and state queries exactly match the compiled Torna ABI', () => {
  const abi = JSON.parse(readFileSync(new URL('../out/Torna.sol/Torna.json', import.meta.url), 'utf8')).abi as Abi;
  for (const expected of advanceAbi) {
    const actual = abi.find(entry => entry.type === 'function' && entry.name === expected.name);
    assert.ok(actual, expected.name);
    assert.deepEqual(JSON.parse(JSON.stringify(actual, (key, value) => key === 'internalType' ? undefined : value)), expected);
  }
  assert.deepEqual(advanceAbi[0].inputs[0].components, advanceRequestTypes.AdvanceRequest);
});

test('exported full ABI is identical to the compiled implementation, not a draft', () => {
  const compiled = JSON.parse(readFileSync(new URL('../out/Torna.sol/Torna.json', import.meta.url), 'utf8'));
  const published = JSON.parse(readFileSync(new URL('../../../shared/abi/Torna.json', import.meta.url), 'utf8'));
  assert.deepEqual(published, compiled.abi);
  const functions = published.filter((entry: { type: string }) => entry.type === 'function')
    .map((entry: { name: string }) => entry.name);
  assert.ok(functions.includes('advance'));
  assert.ok(functions.includes('advanceWithPermit'));
});

test('both advance calls encode the original action independently of the fee permit', () => {
  const basic = encodeFunctionData({ abi: advanceAbi, functionName: 'advance', args: [request, signature] });
  assert.deepEqual(decodeFunctionData({ abi: advanceAbi, data: basic }).args, [request, signature]);
  const combined = encodeFunctionData({ abi: advanceAbi, functionName: 'advanceWithPermit', args: [request, signature, permit] });
  const decoded = decodeFunctionData({ abi: advanceAbi, data: combined });
  assert.equal(decoded.functionName, 'advanceWithPermit');
  assert.deepEqual(decoded.args, [request, signature, permit]);
});

test('simulation return distinguishes issued from business-rejected requests', () => {
  for (const functionName of ['advance', 'advanceWithPermit'] as const) {
    for (const result of [true, false]) {
      const data = encodeFunctionResult({ abi: advanceAbi, functionName, result });
      assert.equal(decodeFunctionResult({ abi: advanceAbi, functionName, data }), result);
    }
  }
});

test('receipt event decoding distinguishes issuance from rejection without changing PRD codes', () => {
  const address = '0x1111111111111111111111111111111111111111' as const;
  const logContext = {
    blockHash: null, blockNumber: null, logIndex: null,
    transactionHash: null, transactionIndex: null, removed: false,
  };
  const rejected = parseEventLogs({ abi: tornaEvents, eventName: 'AdvanceRejected', logs: [{
    ...logContext, address,
    topics: logTopics(encodeEventTopics({ abi: tornaEvents, eventName: 'AdvanceRejected', args: { refundKey: request.refundKey } })),
    data: encodeAbiParameters([{ type: 'uint8' }], [6]),
  }] });
  assert.equal(rejected[0].args.reason, 6);
  assert.equal(rejected[0].args.refundKey, request.refundKey);
  const issued = parseEventLogs({ abi: tornaEvents, eventName: 'AdvanceIssued', logs: [{
    ...logContext, address,
    topics: logTopics(encodeEventTopics({ abi: tornaEvents, eventName: 'AdvanceIssued', args: { refundKey: request.refundKey, issuer: request.issuer } })),
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint64' }], [request.amount, request.maturity]),
  }] });
  assert.equal(issued[0].args.amount, request.amount);
  assert.equal(issued[0].args.issuer, request.issuer);
});
