/**
 * Runs against a THROWAWAY Postgres only: TEST_DATABASE_URL must be set and
 * must not be the shared Supabase DB (reset is destructive). Skipped otherwise.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { acquirerHashOf, refundKeyOf } from '@torna/adapter/hash';
import { balanceOf, buildLabelMap, connect, creditLedger, getRefund, resetLedger, type Sql } from '../src/index';

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
