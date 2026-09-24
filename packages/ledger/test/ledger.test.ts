/**
 * Runs against a THROWAWAY Postgres only: TEST_DATABASE_URL must be set and
 * must not be the shared Supabase DB (reset is destructive). Skipped otherwise.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { acquirerHashOf, refundKeyOf } from '@torna/adapter/hash';
import {
  balanceOf, buildLabelMap, connect, creditLedger, getRefund, ledgerRetryStore, resetLedger, type Sql,
} from '../src/index';

const url = process.env.TEST_DATABASE_URL;
const skip = !url || /supabase/.test(url) ? 'set TEST_DATABASE_URL to a local throwaway Postgres' : false;
let sql: Sql;

before(async () => { if (!skip) { sql = connect(url); await resetLedger(sql); } });
after(async () => { if (!skip) await sql.end(); });

test('reset: 378 refunds, all refund_key filled with the adapter hash', { skip }, async () => {
  const [{ n, missing }] = await sql<{ n: number; missing: number }[]>`
    select count(*)::int as n, count(*) filter (where refund_key is null)::int as missing from public.refunds`;
  assert.equal(n, 378);
  assert.equal(missing, 0);
  const r = await getRefund(sql, 'REF-2026-001');
  assert.equal(r?.refund_key, refundKeyOf('REF-2026-001'));
  assert.equal(r?.amount, '1000.00');
  assert.equal(r?.maturity_override_seconds, null);
});

test('the six scenario refunds carry the 120s maturity override', { skip }, async () => {
  const [{ ids }] = await sql<{ ids: string[] }[]>`
    select array_agg(refund_id order by refund_id) as ids
      from public.refunds where maturity_override_seconds = 120`;
  assert.deepEqual(ids, [
    'REF-2026-014', 'REF-2026-021', 'REF-2026-031',
    'REF-2026-032', 'REF-2026-033', 'REF-2026-034',
  ]);
});

test('creditLedger is idempotent: 300 -> 1300 once (t7)', { skip }, async () => {
  const r = await getRefund(sql, 'REF-2026-001');
  assert.ok(r?.refund_key && r.cardholder_id);
  assert.equal(await balanceOf(sql, r.cardholder_id), '300.00');
  assert.equal(await creditLedger(sql, r.refund_key, r.amount), true);
  assert.equal(await creditLedger(sql, r.refund_key, r.amount), false);
  assert.equal(await balanceOf(sql, r.cardholder_id), '1300.00');
});

test('label map covers every refund, acquirer and issuer', { skip }, async () => {
  const labels = await buildLabelMap(sql, 'run-local-test');
  assert.equal(Object.keys(labels.refunds).length, 378);
  assert.equal(labels.refunds[refundKeyOf('REF-2026-031')].refundId, 'REF-2026-031');
  assert.equal(labels.acquirers[acquirerHashOf('ACQ-β')].displayName, 'Acquirer β (Beta)');
  assert.deepEqual(Object.keys(labels.issuers).sort(), ['AURA', 'HYBRID', 'KITE', 'MERIDIAN', 'NOVA']);
});

test('retry queue: only a failed ledger write is queued, and it closes once', { skip }, async () => {
  const store = ledgerRetryStore(sql);
  const failed = await getRefund(sql, 'REF-2026-002');
  const normal = await getRefund(sql, 'REF-2026-003');
  assert.ok(failed?.refund_key && normal?.refund_key && failed.cardholder_id);
  const key = failed.refund_key as `0x${string}`;
  const tx = `0x${'ab'.repeat(32)}` as const;

  // normal refund credited on the first try: never queued
  assert.equal(await creditLedger(sql, normal.refund_key, normal.amount), true);
  // failed write -> queued (twice = one row, attempts bumped)
  await store.enqueue(key, tx, 'simulated ledger outage');
  await store.enqueue(key, tx, 'simulated ledger outage again');
  assert.deepEqual(await store.pending(), [{ refundKey: key, advanceTxHash: tx }]);

  const before = await balanceOf(sql, failed.cardholder_id);
  assert.equal(await store.credit(key), true);              // recovered with the DB amount
  assert.equal(await store.credit(key), false);             // idempotent
  assert.equal(await store.creditCount(key), 1);            // condition 3
  assert.equal(Number(await balanceOf(sql, failed.cardholder_id)) - Number(before), 1000);

  await store.markConfirmed(key, `0x${'cd'.repeat(32)}`);
  assert.deepEqual(await store.pending(), []);              // condition 4 (DB side)
  await assert.rejects(store.markConfirmed(key, `0x${'cd'.repeat(32)}`));
  const [{ attempts }] = await sql<{ attempts: number }[]>`
    select attempts from public.ledger_credit_retries where refund_key = ${key}`;
  assert.equal(attempts, 2);
});
