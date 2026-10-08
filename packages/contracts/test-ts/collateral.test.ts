import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  hashTypedData, hashStruct, keccak256, stringToHex, encodeFunctionData,
  decodeFunctionData, parseUnits, type Abi, type Hex,
} from 'viem';
import { tornaDomain } from '../../../shared/abi/eip712';
import { mockUsdcPermitDomain } from '../../../shared/abi/permit';
import {
  COLLATERAL_DEPOSIT_TYPE, COLLATERAL_DEPOSIT_PRIMARY_TYPE,
  collateralDepositTypes, collateralAbi, type CollateralDepositRequest,
} from '../../../shared/abi/collateral';

const fixture = JSON.parse(readFileSync(new URL('../../../shared/abi/fixtures/collateral-deposit.json', import.meta.url), 'utf8'));
const message: CollateralDepositRequest = {
  issuer: fixture.message.issuer, amount: BigInt(fixture.message.amount),
  nonce: BigInt(fixture.message.nonce), deadline: BigInt(fixture.message.deadline),
};
const domain = tornaDomain(fixture.domain.chainId, fixture.domain.verifyingContract);
const data = { domain, types: collateralDepositTypes, primaryType: COLLATERAL_DEPOSIT_PRIMARY_TYPE, message } as const;

test('collateral action type and digest match Solidity using six-decimal amounts', () => {
  assert.equal(message.amount, parseUnits('3000', 6));
  assert.deepEqual(domain, fixture.domain);
  assert.equal(keccak256(stringToHex(COLLATERAL_DEPOSIT_TYPE)), fixture.expected.typeHash);
  assert.equal(hashStruct({ data: { ...message }, types: collateralDepositTypes, primaryType: COLLATERAL_DEPOSIT_PRIMARY_TYPE }), fixture.expected.structHash);
  assert.equal(hashTypedData(data), fixture.expected.digest);
});

test('collateral action binds issuer, amount, action nonce and deadline', () => {
  const changes: CollateralDepositRequest = {
    issuer: '0x4444444444444444444444444444444444444444',
    amount: message.amount + 1n, nonce: message.nonce + 1n, deadline: message.deadline + 1n,
  };
  for (const key of Object.keys(changes) as (keyof CollateralDepositRequest)[]) {
    assert.notEqual(hashTypedData({ ...data, message: { ...message, [key]: changes[key] } }), fixture.expected.digest, key);
  }
});

test('collateral signature is bound to Torna and cannot use token Permit domain', () => {
  const tokenAddress = '0x2222222222222222222222222222222222222222';
  for (const changed of [
    { ...domain, chainId: 31337 }, { ...domain, verifyingContract: tokenAddress as Hex },
    { ...domain, name: 'Other' }, { ...domain, version: '2' },
    mockUsdcPermitDomain(domain.chainId, tokenAddress),
  ]) assert.notEqual(hashTypedData({ ...data, domain: changed }), fixture.expected.digest);
});

test('deposit ABI request, signature tuples and getters match compiled Torna', () => {
  const compiled = JSON.parse(readFileSync(new URL('../out/Torna.sol/Torna.json', import.meta.url), 'utf8')).abi as Abi;
  for (const expected of collateralAbi) {
    const actual = compiled.find(entry => entry.type === 'function' && entry.name === expected.name);
    assert.ok(actual && actual.type === 'function', expected.name);
    // internalType is compiler metadata, not part of the ABI wire schema.
    const normalized = JSON.parse(JSON.stringify(actual, (key, value) => key === 'internalType' ? undefined : value));
    assert.deepEqual(normalized, expected);
  }
});

test('combined deposit encodes an action signature separately from a token permit signature', () => {
  // Placeholder signatures only test ABI encoding; no live authorization is stored.
  const signature = `0x${'aa'.repeat(65)}` as Hex;
  const permitSignature = { deadline: message.deadline + 60n, v: 27, r: `0x${'11'.repeat(32)}` as Hex, s: `0x${'22'.repeat(32)}` as Hex };
  const args = [message, signature, permitSignature] as const;
  const encoded = encodeFunctionData({ abi: collateralAbi, functionName: 'depositCollateralWithPermit', args });
  const decoded = decodeFunctionData({ abi: collateralAbi, data: encoded });
  assert.equal(decoded.functionName, 'depositCollateralWithPermit');
  assert.deepEqual(decoded.args, args);
  const direct = encodeFunctionData({ abi: collateralAbi, functionName: 'depositCollateral', args: [message, signature] });
  assert.deepEqual(decodeFunctionData({ abi: collateralAbi, data: direct }).args, [message, signature]);
});
