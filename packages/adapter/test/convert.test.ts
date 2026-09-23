import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addBusinessDays,
  AmountError,
  buildAdvanceRequest,
  centsToBaseUnits,
  computeMaturity,
  dbAmountToBaseUnits,
  IdentifierError,
  refundKeyOf,
  toUnixSeconds,
} from '../src/index';

test('2-decimal DB amount -> 6-decimal base units, exactly once', () => {
  assert.equal(dbAmountToBaseUnits('1000.00'), 1_000_000_000n);
  assert.equal(dbAmountToBaseUnits('1000'), 1_000_000_000n);
  assert.equal(dbAmountToBaseUnits('0.5'), 500_000n);
  assert.equal(dbAmountToBaseUnits('12.34'), 12_340_000n);
  assert.equal(centsToBaseUnits(100_000n), 1_000_000_000n); // factor 10^4
  for (const bad of ['1000.001', '-1', '1e3', ' 1000.00', '0', '0.00', '01.00']) {
    assert.throws(() => dbAmountToBaseUnits(bad), AmountError, bad);
  }
  assert.throws(() => dbAmountToBaseUnits(1000 as unknown as string), AmountError);
});

test('identifiers are hashed as-is, never normalised', () => {
  assert.throws(() => refundKeyOf(' REF-2026-001'), IdentifierError);
  assert.throws(() => refundKeyOf(''), IdentifierError);
  assert.notEqual(refundKeyOf('REF-2026-001'), refundKeyOf('ref-2026-001'));
});

test('business days skip weekends (UTC)', () => {
  const fri = toUnixSeconds('2026-09-18T10:00:00Z'); // Friday
  assert.equal(addBusinessDays(fri, 1), toUnixSeconds('2026-09-21T10:00:00Z')); // Monday
  assert.equal(addBusinessDays(fri, 5), toUnixSeconds('2026-09-25T10:00:00Z'));
  const mon = toUnixSeconds('2026-09-14T10:22:00Z'); // spec 10.6 confirmed_at (Monday)
  assert.equal(addBusinessDays(mon, 5), toUnixSeconds('2026-09-21T10:22:00Z'));
});

test('maturity is counted from chain time, never from confirmed_at', () => {
  const chain = toUnixSeconds('2026-09-25T00:00:00Z'); // Friday
  assert.equal(computeMaturity(chain), toUnixSeconds('2026-10-02T00:00:00Z'));
  // A 2025 confirmed_at cannot shorten or lengthen it: it is not an input.
  assert.ok(computeMaturity(chain) > chain);
});

test('scenario rows use their short maturity override', () => {
  const chain = toUnixSeconds('2026-09-25T00:00:00Z');
  assert.equal(computeMaturity(chain, 120), chain + 120n);
  assert.equal(computeMaturity(chain, null), computeMaturity(chain));
  for (const bad of [0, -120, 1.5]) {
    assert.throws(() => computeMaturity(chain, bad), RangeError, String(bad));
  }
});

test('spec 10.6 example row -> adapter output', () => {
  const chain = toUnixSeconds('2026-09-14T10:30:00Z');
  const row = {
    refund_id: 'REF-2026-001', issuer_id: 'HYBRID', acquirer_id: 'ACQ-α',
    amount: '1000.00', confirmed_at: new Date('2026-09-14T10:22:00Z'),
  };
  const input = { issuer: '0x3333333333333333333333333333333333333333' as const, nonce: 7n, chainNow: chain };
  const req = buildAdvanceRequest(row, input);
  assert.equal(req.refundKey, '0x0e56a8cdd31615a3cd9121754dce145c7713c54b328055d069d6b604089c97c5');
  assert.equal(req.acquirerHash, '0xb458d4d1175f4890b44d8164de0a594387b811b3296fa604f5270258903aaf44');
  assert.equal(req.amount, 1_000_000_000n);
  assert.equal(req.nonce, 7n);
  assert.equal(req.deadline, chain + 600n);
  assert.equal(req.maturity, toUnixSeconds('2026-09-21T10:30:00Z')); // chain time + 5 business days

  // A scenario row matures two minutes after it is advanced.
  const short = buildAdvanceRequest({ ...row, maturity_override_seconds: 120 }, input);
  assert.equal(short.maturity, chain + 120n);
});
