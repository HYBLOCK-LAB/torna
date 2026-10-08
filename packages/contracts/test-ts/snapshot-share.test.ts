import assert from 'node:assert/strict';
import {test} from 'node:test';

import {lpSharePct} from '../script/snapshot';

test('t9b LP display shares round separately from six-decimal deposit accounting', () => {
  const total = 16_666_666_666n;
  const principals = [
    5_000_000_000n,
    3_000_000_000n,
    4_166_666_666n,
    4_166_666_666n,
    333_333_334n,
  ];
  assert.equal(principals.reduce((sum, amount) => sum + amount, 0n), total);
  assert.deepEqual(principals.map(amount => lpSharePct(amount, total)), [30, 18, 25, 25, 2]);
  assert.equal(lpSharePct(0n, 0n), 0);
});
