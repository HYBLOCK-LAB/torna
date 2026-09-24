/**
 * Conformance against Minseo's public vectors in shared/abi/fixtures.
 * If these fail, signatures will be rejected on chain.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  acquirerHashOf,
  hashAdvanceRequest,
  hashPermit,
  hashRepaymentRequest,
  keccak256,
  ledgerAckAbi,
  refundKeyOf,
} from '../src/index';

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../shared/abi/fixtures/${name}`, import.meta.url), 'utf8'));

test('refundKey / acquirerHash match the advance fixture (UTF-8 keccak256)', () => {
  const f = fixture('advance-request.json');
  assert.equal(refundKeyOf(f.refundId), f.request.refundKey);
  assert.equal(acquirerHashOf(f.acquirerId), f.request.acquirerHash);
  assert.equal(keccak256(f.refundId), f.request.refundKey);
});

test('AdvanceRequest EIP-712 digest matches the fixture', () => {
  const f = fixture('advance-request.json');
  const r = f.request;
  const digest = hashAdvanceRequest(
    { chainId: f.domain.chainId, torna: f.domain.verifyingContract },
    {
      refundKey: r.refundKey, issuer: r.issuer, acquirerHash: r.acquirerHash,
      amount: BigInt(r.amount), maturity: BigInt(r.maturity), nonce: BigInt(r.nonce), deadline: BigInt(r.deadline),
    },
  );
  assert.equal(digest, f.expected.digest);
});

test('RepaymentRequest EIP-712 digest matches the fixture', () => {
  const f = fixture('repayment-request.json');
  const m = f.message;
  const digest = hashRepaymentRequest(
    { chainId: f.domain.chainId, torna: f.domain.verifyingContract },
    { refundKey: m.refundKey, issuer: m.issuer, amount: BigInt(m.amount), nonce: BigInt(m.nonce), deadline: BigInt(m.deadline) },
  );
  assert.equal(digest, f.expected.digest);
});

test('MockUSDC Permit EIP-712 digest matches the fixture', () => {
  const f = fixture('permit.json');
  const m = f.message;
  const digest = hashPermit(
    { chainId: f.domain.chainId, asset: f.domain.verifyingContract },
    { owner: m.owner, spender: m.spender, value: BigInt(m.value), nonce: BigInt(m.nonce), deadline: BigInt(m.deadline) },
  );
  assert.equal(digest, f.expected.digest);
});

const tornaAbi = JSON.parse(readFileSync(new URL('../../../shared/abi/Torna.json', import.meta.url), 'utf8'));
const compiledAck = (Array.isArray(tornaAbi) ? tornaAbi : tornaAbi.abi)
  .find((e: { type: string; name?: string }) => e.type === 'function' && e.name === 'confirmLedgerCredit');

test('confirmLedgerCredit fragment matches the compiled Torna ABI',
  { skip: compiledAck ? false : 'shared/abi/Torna.json does not export confirmLedgerCredit yet' }, () => {
    const [fragment] = ledgerAckAbi;
    assert.deepEqual(
      compiledAck.inputs.map((i: { type: string }) => i.type),
      fragment.inputs.map(i => i.type),
    );
    assert.equal(compiledAck.stateMutability, 'nonpayable');
  });
