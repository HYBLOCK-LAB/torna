import assert from 'node:assert/strict';
import {test} from 'node:test';

import {refundKeyOf, type LedgerRetryStore} from '@torna/adapter';

import {preflightT7LedgerIO, type T7LedgerIO} from '../script/runtime/ledger';

const key = refundKeyOf('REF-2026-001');
const pending = {refundKey: key, advanceTxHash: `0x${'ab'.repeat(32)}` as const};

function ledgerIO(state: {balance?: string; credits?: number; pending?: boolean} = {}): T7LedgerIO {
  const store: LedgerRetryStore = {
    enqueue: async () => { throw new Error('not used in preflight'); },
    pending: async () => state.pending ? [pending] : [],
    credit: async () => { throw new Error('not used in preflight'); },
    creditCount: async () => state.credits ?? 0,
    markConfirmed: async () => { throw new Error('not used in preflight'); },
    noteFailure: async () => { throw new Error('not used in preflight'); },
  };
  return {
    row: {
      refund_id: 'REF-2026-001', issuer_id: 'HYBRID', acquirer_id: 'ACQ-α',
      amount: '1000.00', confirmed_at: '2026-09-14T10:22:00Z',
    },
    store,
    creditLedger: async () => { throw new Error('not used in preflight'); },
    cardholderBalance: async () => state.balance ?? '300.00',
  };
}

test('t7 DB preflight accepts only an untouched seeded cardholder and retry queue', async () => {
  await assert.doesNotReject(preflightT7LedgerIO(ledgerIO()));
  for (const state of [
    {balance: '1300.00'}, {credits: 1}, {pending: true},
  ]) {
    await assert.rejects(preflightT7LedgerIO(ledgerIO(state)), /pre-run state/);
  }
});
