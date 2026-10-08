import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  assertT0FinalAccounting,
  T0_FINAL_ACCOUNTING,
  type T0FinalAccounting,
} from '../script/scenarios/execute';

function expectedAccounting(): T0FinalAccounting {
  return {...T0_FINAL_ACCOUNTING};
}

test('t0 final accounting matches the PRD section 7 normal-path values', () => {
  assert.doesNotThrow(() => assertT0FinalAccounting(expectedAccounting()));
  assert.equal(T0_FINAL_ACCOUNTING.totalLpFees, 2_400_000n);
  assert.equal(T0_FINAL_ACCOUNTING.reserveBalance, 500_399_000n);
  assert.equal(T0_FINAL_ACCOUNTING.protocolFees, 201_000n);
});

test('t0 accounting verification rejects even a one-base-unit deviation', () => {
  const actual = expectedAccounting();
  actual.reserveBalance -= 1n;
  assert.throws(() => assertT0FinalAccounting(actual), /reserveBalance/);
});
