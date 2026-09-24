import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {decodeFunctionData, encodeFunctionData, type Abi} from 'viem';

import {idleAbi} from '../../../shared/abi/idle';

test('external idle liquidity API matches the compiled two-contract protocol', () => {
  const abi = JSON.parse(readFileSync(
      new URL('../out/Torna.sol/Torna.json', import.meta.url), 'utf8')).abi as Abi;
  for (const expected of idleAbi) {
    const actual = abi.find(entry => entry.type === 'function' && entry.name === expected.name);
    assert.ok(actual && actual.type === 'function', expected.name);
    const normalized = JSON.parse(JSON.stringify(
        actual, (key, value) => key === 'internalType' ? undefined : value));
    assert.deepEqual(normalized, expected);
  }
});

test('idle deployment uses exact six-decimal base units', () => {
  const amount = 3_638_880_000n;
  const data = encodeFunctionData({abi: idleAbi, functionName: 'deployIdle', args: [amount]});
  assert.deepEqual(decodeFunctionData({abi: idleAbi, data}).args, [amount]);
});
