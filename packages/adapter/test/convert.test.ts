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

test('maturity counts from max(confirmed_at, chain time) so it is always in the future', () => {
  const chain = toUnixSeconds('2026-09-25T00:00:00Z'); // Friday
  // historical seed row (2025): counted from chain time
  assert.equal(computeMaturity('2025-09-14T09:00:00Z', chain), toUnixSeconds('2026-10-02T00:00:00Z'));
  // fresh refund confirmed after chain time: spec rule confirmed_at + 5 business days
  assert.equal(computeMaturity('2026-09-28T10:00:00Z', chain), toUnixSeconds('2026-10-05T10:00:00Z'));
  assert.ok(computeMaturity('2025-01-01T00:00:00Z', chain) > chain);
});

test('spec 10.6 example row -> adapter output', () => {
  const chain = toUnixSeconds('2026-09-14T10:30:00Z');
  const req = buildAdvanceRequest(
    { refund_id: 'REF-2026-001', issuer_id: 'HYBRID', acquirer_id: 'ACQ-α', amount: '1000.00', confirmed_at: new Date('2026-09-14T10:22:00Z') },
    { issuer: '0x3333333333333333333333333333333333333333', nonce: 7n, chainNow: chain },
  );
  assert.equal(req.refundKey, '0x0e56a8cdd31615a3cd9121754dce145c7713c54b328055d069d6b604089c97c5');
  assert.equal(req.acquirerHash, '0xb458d4d1175f4890b44d8164de0a594387b811b3296fa604f5270258903aaf44');
  assert.equal(req.amount, 1_000_000_000n);
  assert.equal(req.nonce, 7n);
  assert.equal(req.deadline, chain + 600n);
  assert.equal(req.maturity, toUnixSeconds('2026-09-21T10:30:00Z'));
});
