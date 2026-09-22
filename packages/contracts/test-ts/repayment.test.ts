import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  decodeFunctionData, encodeFunctionData, hashStruct, hashTypedData, keccak256,
  parseUnits, stringToHex, type Abi, type Hex,
} from 'viem';
import { tornaDomain } from '../../../shared/abi/eip712';
import { mockUsdcPermitDomain } from '../../../shared/abi/permit';
import {
  REPAYMENT_REQUEST_PRIMARY_TYPE, REPAYMENT_REQUEST_TYPE, repaymentAbi,
  repaymentRequestTypes, type RepaymentRequest,
} from '../../../shared/abi/repayment';

const fixture = JSON.parse(readFileSync(new URL('../../../shared/abi/fixtures/repayment-request.json', import.meta.url), 'utf8'));
const message: RepaymentRequest = {
  refundKey: fixture.message.refundKey,
  issuer: fixture.message.issuer,
  amount: BigInt(fixture.message.amount),
  nonce: BigInt(fixture.message.nonce),
  deadline: BigInt(fixture.message.deadline),
};
const domain = tornaDomain(fixture.domain.chainId, fixture.domain.verifyingContract);
const data = {
  domain, types: repaymentRequestTypes,
  primaryType: REPAYMENT_REQUEST_PRIMARY_TYPE, message,
} as const;

test('repayment action type and digest match Solidity for full six-decimal principal', () => {
  assert.equal(message.amount, parseUnits('1000', 6));
  assert.equal(keccak256(stringToHex(REPAYMENT_REQUEST_TYPE)), fixture.expected.typeHash);
  assert.equal(hashStruct({
    data: { ...message }, types: repaymentRequestTypes,
    primaryType: REPAYMENT_REQUEST_PRIMARY_TYPE,
  }), fixture.expected.structHash);
  assert.equal(hashTypedData(data), fixture.expected.digest);
});

test('repayment signature binds refund key, issuer, exact amount, action nonce and deadline', () => {
  const changes: RepaymentRequest = {
    refundKey: `0x${'44'.repeat(32)}`,
    issuer: '0x5555555555555555555555555555555555555555',
    amount: message.amount + 1n,
    nonce: message.nonce + 1n,
    deadline: message.deadline + 1n,
  };
  for (const key of Object.keys(changes) as (keyof RepaymentRequest)[]) {
    assert.notEqual(
      hashTypedData({ ...data, message: { ...message, [key]: changes[key] } }),
      fixture.expected.digest,
      key,
    );
  }
});

test('repayment action uses Torna domain and cannot substitute token Permit domain', () => {
  const tokenAddress = '0x2222222222222222222222222222222222222222';
  for (const changed of [
    { ...domain, chainId: 31337 },
    { ...domain, verifyingContract: tokenAddress as Hex },
    { ...domain, name: 'Other' },
    { ...domain, version: '2' },
    mockUsdcPermitDomain(domain.chainId, tokenAddress),
  ]) assert.notEqual(hashTypedData({ ...data, domain: changed }), fixture.expected.digest);
});

test('repayment calls, digest and nonce getter exactly match compiled Torna ABI', () => {
  const compiled = JSON.parse(readFileSync(new URL('../out/Torna.sol/Torna.json', import.meta.url), 'utf8')).abi as Abi;
  for (const expected of repaymentAbi) {
    const actual = compiled.find(entry => entry.type === 'function' && entry.name === expected.name);
    assert.ok(actual && actual.type === 'function', expected.name);
    const normalized = JSON.parse(JSON.stringify(
      actual,
      (key, value) => key === 'internalType' ? undefined : value,
    ));
    assert.deepEqual(normalized, expected);
  }
});

test('combined repayment keeps action signature separate from exact token Permit', () => {
  const signature = `0x${'aa'.repeat(65)}` as Hex;
  const permitSignature = {
    deadline: message.deadline + 60n,
    v: 27,
    r: `0x${'11'.repeat(32)}` as Hex,
    s: `0x${'22'.repeat(32)}` as Hex,
  };
  const args = [message, signature, permitSignature] as const;
  const combined = encodeFunctionData({
    abi: repaymentAbi, functionName: 'repayWithPermit', args,
  });
  assert.deepEqual(decodeFunctionData({ abi: repaymentAbi, data: combined }).args, args);
  const direct = encodeFunctionData({
    abi: repaymentAbi, functionName: 'repay', args: [message, signature],
  });
  assert.deepEqual(
    decodeFunctionData({ abi: repaymentAbi, data: direct }).args,
    [message, signature],
  );
});
