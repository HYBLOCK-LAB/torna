import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  hashDomain, hashStruct, hashTypedData, keccak256, stringToHex,
  encodeFunctionData, decodeFunctionData, parseUnits, type Abi, type Hex,
} from 'viem';
import {
  PERMIT_TYPE, PERMIT_PRIMARY_TYPE, permitTypes, mockUsdcPermitDomain,
  mockUsdcPermitAbi, type PermitMessage,
} from '../../../shared/abi/permit';
import { tornaDomain } from '../../../shared/abi/eip712';

const fixture = JSON.parse(readFileSync(new URL('../../../shared/abi/fixtures/permit.json', import.meta.url), 'utf8'));
const domain = mockUsdcPermitDomain(fixture.domain.chainId, fixture.domain.verifyingContract);
const message: PermitMessage = {
  ...fixture.message,
  value: BigInt(fixture.message.value), nonce: BigInt(fixture.message.nonce), deadline: BigInt(fixture.message.deadline),
};
const typedData = { domain, types: permitTypes, primaryType: PERMIT_PRIMARY_TYPE, message } as const;

test('permit type, domain and digest match the shared Solidity vector', () => {
  assert.deepEqual(domain, fixture.domain);
  assert.equal(message.value, parseUnits('3000', 6));
  assert.equal(keccak256(stringToHex(PERMIT_TYPE)), fixture.expected.typeHash);
  assert.equal(hashStruct({ data: { ...message }, primaryType: PERMIT_PRIMARY_TYPE, types: permitTypes }), fixture.expected.structHash);
  assert.equal(hashDomain({ domain, types: { EIP712Domain: [
    { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' },
  ] } }), fixture.expected.domainSeparator);
  assert.equal(hashTypedData(typedData), fixture.expected.digest);
});

test('permit binds owner, spender, value, token nonce and deadline', () => {
  const replacements: PermitMessage = {
    owner: '0x4444444444444444444444444444444444444444',
    spender: '0x5555555555555555555555555555555555555555',
    value: message.value + 1n, nonce: message.nonce + 1n, deadline: message.deadline + 1n,
  };
  for (const key of Object.keys(replacements) as (keyof PermitMessage)[]) {
    assert.notEqual(hashTypedData({ ...typedData, message: { ...message, [key]: replacements[key] } }), fixture.expected.digest, key);
  }
});

test('permit domain is token-specific and cannot use the Torna advance domain', () => {
  for (const changed of [
    { ...domain, chainId: 31337 },
    { ...domain, verifyingContract: message.spender },
    { ...domain, name: 'Torna' },
    { ...domain, version: '2' },
    tornaDomain(domain.chainId, message.spender),
  ]) assert.notEqual(hashTypedData({ ...typedData, domain: changed }), fixture.expected.digest);
});

test('permit domain rejects invalid chain IDs and zero or malformed token addresses', () => {
  for (const chain of [0, -1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => mockUsdcPermitDomain(chain, domain.verifyingContract), RangeError);
  }
  for (const tokenAddress of ['0x00', '0x0000000000000000000000000000000000000000'] as Hex[]) {
    assert.throws(() => mockUsdcPermitDomain(10143, tokenAddress), TypeError);
  }
  assert.equal(mockUsdcPermitDomain(31337, domain.verifyingContract).chainId, 31337);
});

test('adapter permit ABI matches compiled MockUSDC functions', () => {
  const compiled = JSON.parse(readFileSync(new URL('../out/MockUSDC.sol/MockUSDC.json', import.meta.url), 'utf8')).abi as Abi;
  for (const expected of mockUsdcPermitAbi) {
    const actual = compiled.find(entry => entry.type === 'function' && entry.name === expected.name);
    assert.ok(actual && actual.type === 'function', expected.name);
    assert.equal(actual.stateMutability, expected.stateMutability);
    const shape = (items: readonly { name?: string; type: string }[]) => items.map(({ name, type }) => ({ name, type }));
    assert.deepEqual(shape(actual.inputs), expected.inputs);
    assert.deepEqual(shape(actual.outputs), expected.outputs);
  }
});

test('permit calldata uses seven arguments; token nonce is signed but not a call argument', () => {
  // Placeholder signature components test encoding only, not an accepted authorization.
  const r = `0x${'11'.repeat(32)}` as Hex;
  const s = `0x${'22'.repeat(32)}` as Hex;
  const args = [message.owner, message.spender, message.value, message.deadline, 27, r, s] as const;
  const encoded = encodeFunctionData({ abi: mockUsdcPermitAbi, functionName: 'permit', args });
  const decoded = decodeFunctionData({ abi: mockUsdcPermitAbi, data: encoded });
  assert.equal(decoded.functionName, 'permit');
  assert.deepEqual(decoded.args, args);
});
