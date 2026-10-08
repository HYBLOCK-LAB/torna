import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  encodeAbiParameters, hashDomain, hashStruct, hashTypedData, keccak256,
  parseUnits, stringToHex, type Abi, type Hex,
} from 'viem';
import {
  ADVANCE_REQUEST_PRIMARY_TYPE, ADVANCE_REQUEST_TYPE,
  advanceRequestTypes, tornaDomain, type AdvanceRequest,
} from '../../../shared/abi/eip712';
import { tornaEvents } from '../../../shared/abi/events';
import { POSITION_STATES, ISSUER_STATES, positionStateName, issuerStateName } from '../../../shared/abi/states';
import { ADVANCE_REJECTION, DEPOSIT_REJECTION } from '../../../shared/abi/reasons';

const fixture = JSON.parse(readFileSync(
  new URL('../../../shared/abi/fixtures/advance-request.json', import.meta.url), 'utf8',
));
const message: AdvanceRequest = {
  refundKey: fixture.request.refundKey,
  issuer: fixture.request.issuer,
  acquirerHash: fixture.request.acquirerHash,
  amount: BigInt(fixture.request.amount),
  maturity: BigInt(fixture.request.maturity),
  nonce: BigInt(fixture.request.nonce),
  deadline: BigInt(fixture.request.deadline),
};
const domain = tornaDomain(fixture.domain.chainId, fixture.domain.verifyingContract);

test('UTF-8 hashing matches Solidity, including the Greek acquirer identifier', () => {
  assert.equal(keccak256(stringToHex(fixture.refundId)), message.refundKey);
  assert.equal(keccak256(stringToHex(fixture.acquirerId)), message.acquirerHash);
  assert.notEqual(keccak256(stringToHex('ACQ-a')), message.acquirerHash);
  assert.notEqual(keccak256(encodeAbiParameters([{ type: 'string' }], [fixture.refundId])), message.refundKey);
});

test('1,000 USDC is 1,000,000,000 base units without floating point conversion', () => {
  assert.equal(parseUnits('1000.00', 6), message.amount);
  assert.equal(100_000n * 10_000n, message.amount); // cents input, if used by the adapter
});

test('type hash, struct hash, domain separator and digest match the shared Solidity vector', () => {
  assert.equal(keccak256(stringToHex(ADVANCE_REQUEST_TYPE)), fixture.expected.typeHash);
  assert.equal(hashStruct({ data: { ...message }, primaryType: ADVANCE_REQUEST_PRIMARY_TYPE, types: advanceRequestTypes }), fixture.expected.structHash);
  assert.equal(hashDomain({
    domain,
    types: { EIP712Domain: [
      { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' },
    ] },
  }), fixture.expected.domainSeparator);
  assert.equal(hashTypedData({ domain, types: advanceRequestTypes, primaryType: ADVANCE_REQUEST_PRIMARY_TYPE, message }), fixture.expected.digest);
});

test('all request fields affect the digest', () => {
  const replacements: AdvanceRequest = {
    refundKey: keccak256(stringToHex('other-refund')),
    issuer: '0x4444444444444444444444444444444444444444',
    acquirerHash: keccak256(stringToHex('other-acquirer')),
    amount: message.amount + 1n, maturity: message.maturity + 1n,
    nonce: message.nonce + 1n, deadline: message.deadline + 1n,
  };
  for (const key of Object.keys(replacements) as (keyof AdvanceRequest)[]) {
    const changed = { ...message, [key]: replacements[key] };
    assert.notEqual(hashTypedData({ domain, types: advanceRequestTypes, primaryType: ADVANCE_REQUEST_PRIMARY_TYPE, message: changed }), fixture.expected.digest, key);
  }
});

test('chain, verifying contract, domain name and version are bound', () => {
  for (const change of [
    { chainId: 31337 },
    { verifyingContract: '0x2222222222222222222222222222222222222222' as Hex },
    { name: 'Other' }, { version: '2' },
  ]) {
    assert.notEqual(hashTypedData({ domain: { ...domain, ...change }, types: advanceRequestTypes, primaryType: ADVANCE_REQUEST_PRIMARY_TYPE, message }), fixture.expected.digest);
  }
});

test('domain helper refuses ambiguous or unusable domains but supports local chains', () => {
  for (const id of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => tornaDomain(id, domain.verifyingContract), RangeError);
  }
  assert.throws(() => tornaDomain(10143, '0x0000000000000000000000000000000000000000'), TypeError);
  assert.throws(() => tornaDomain(10143, '0x12'), TypeError);
  assert.equal(tornaDomain(31337, domain.verifyingContract).chainId, 31337);
});

test('shared event signatures, indexing and names match the compiled Solidity ABI', () => {
  const artifact = JSON.parse(readFileSync(new URL('../out/Torna.sol/Torna.json', import.meta.url), 'utf8'));
  const abi = artifact.abi as Abi;
  for (const expected of tornaEvents) {
    const actual = abi.find((entry) => entry.type === 'event' && entry.name === expected.name);
    assert.ok(actual && actual.type === 'event', expected.name);
    assert.equal(actual.anonymous, expected.anonymous);
    assert.deepEqual(actual.inputs.map(({ name, type, indexed }) => ({ name, type, indexed })), expected.inputs, expected.name);
  }
  const hashing = abi.find((entry) => entry.type === 'function' && entry.name === 'hashAdvanceRequest');
  assert.ok(hashing && hashing.type === 'function');
  const requestInput = hashing.inputs[0];
  assert.ok('components' in requestInput);
  assert.deepEqual(requestInput.components.map(({ name, type }) => ({ name, type })), advanceRequestTypes.AdvanceRequest);
});

test('enum decoding preserves PRD spelling and refuses unknown indexes', () => {
  assert.deepEqual(POSITION_STATES, ['Registered', 'Advanced', 'Repaid', 'Overdue', 'Review', 'CoveredLoss', 'CapHeld', 'RecoveryRecorded']);
  assert.deepEqual(ISSUER_STATES, ['Active', 'MarginCall', 'Suspended', 'Deregistered']);
  assert.equal(positionStateName(7), 'RecoveryRecorded');
  assert.equal(issuerStateName(2), 'Suspended');
  for (const invalid of [-1, 8, 1.5, NaN]) assert.throws(() => positionStateName(invalid), RangeError);
  assert.throws(() => issuerStateName(4), RangeError);
  assert.deepEqual(Object.values(ADVANCE_REJECTION), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(Object.values(DEPOSIT_REJECTION), [1, 2]);
});
