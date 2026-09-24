import assert from 'node:assert/strict';
import {test} from 'node:test';

import {refundKeyOf, type LedgerRetryStore} from '@torna/adapter';
import type {Hex} from 'viem';

import {createLocalT0ToT7Runtime} from '../script/run-scenarios';
import {loadLocalT0Config} from '../script/runtime/local-config';
import type {T7LedgerIO} from '../script/runtime/ledger';
import type {Snapshot} from '../../../shared/types/snapshot';

const enabled = Boolean(process.env.TORNA_LOCAL_RPC_URL && process.env.TORNA_LOCAL_CHAIN_ID
  && process.env.TORNA_LOCAL_MNEMONIC && process.env.RUN_ID);

test('local chain focused t0 -> t7 recovery credits once and acknowledges once', {
  skip: enabled ? false : 'requires an explicit throwaway local Anvil configuration',
}, async () => {
  const credits = new Map<Hex, string>();
  const queue = new Map<Hex, {advanceTxHash: Hex|null; confirmedTxHash: Hex|null}>();
  const row = {
    refund_id: 'REF-2026-001', issuer_id: 'HYBRID', acquirer_id: 'ACQ-α',
    amount: '1000.00', confirmed_at: '2026-09-14T10:22:00Z',
  };
  const store: LedgerRetryStore = {
    enqueue: async (key, advanceTxHash) => {
      if (!queue.has(key)) queue.set(key, {advanceTxHash, confirmedTxHash: null});
    },
    pending: async () => [...queue].filter(([, item]) => !item.confirmedTxHash)
        .map(([refundKey, item]) => ({refundKey, advanceTxHash: item.advanceTxHash})),
    credit: async key => {
      if (credits.has(key)) return false;
      credits.set(key, row.amount);
      return true;
    },
    creditCount: async key => credits.has(key) ? 1 : 0,
    markConfirmed: async (key, txHash) => {
      const item = queue.get(key);
      if (!item || item.confirmedTxHash) throw new Error('No open retry.');
      item.confirmedTxHash = txHash;
    },
    noteFailure: async () => {},
  };
  const io: T7LedgerIO = {
    row,
    store,
    creditLedger: async (key, amount) => {
      if (credits.has(key)) return false;
      credits.set(key, amount);
      return true;
    },
    cardholderBalance: async () => credits.has(refundKeyOf(row.refund_id)) ? '1300.00' : '300.00',
  };
  const runtime = createLocalT0ToT7Runtime(loadLocalT0Config(), io);
  const snapshots: Snapshot[] = [];
  await runtime.preflight();
  const context = await runtime.deploy();
  for (const id of ['t0', 't7'] as const) {
    const point = await runtime.execute(context, id);
    snapshots.push(await runtime.capture(context, point));
  }
  assert.deepEqual(snapshots.map(snapshot => snapshot.timepointId),
      ['t0', 't7']);
  const key = refundKeyOf(row.refund_id);
  assert.equal(credits.size, 1);
  assert.equal(credits.get(key), '1000.00');
  assert.ok(queue.get(key)?.confirmedTxHash);
  assert.equal((await store.pending()).length, 0);
  const confirmed = snapshots.at(-1)!.events.filter(event => event.name === 'LedgerCreditConfirmed');
  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0]?.target.toLowerCase(), key.toLowerCase());
  assert.equal(confirmed[0]?.timepointSeq, 9);
  assert.equal(snapshots[0]?.events.some(event => event.name === 'LedgerCreditConfirmed'), false);
});
