import {refundKeyOf, type CreditLedger, type LedgerRetryStore, type RefundRow} from '@torna/adapter';
import {balanceOf, creditLedger, getRefund, ledgerRetryStore, type Sql} from '@torna/ledger';

/** DB access stays in the private runner closure, never in a public snapshot context. */
export interface T7LedgerIO {
  row: RefundRow;
  store: LedgerRetryStore;
  creditLedger: CreditLedger;
  cardholderBalance(): Promise<string>;
}

/** Read the real seeded refund; never substitute a fixture for a DB-backed run. */
export async function loadT7LedgerIO(sql: Sql): Promise<T7LedgerIO> {
  const row = await getRefund(sql, 'REF-2026-001');
  if (!row || !row.cardholder_id || row.refund_key !== refundKeyOf(row.refund_id)
      || row.issuer_id !== 'HYBRID' || row.acquirer_id !== 'ACQ-α'
      || row.amount !== '1000.00') {
    throw new Error('t7 requires the seeded REF-2026-001 refund with its adapter-derived key.');
  }
  const cardholderId = row.cardholder_id;
  return {
    row,
    store: ledgerRetryStore(sql),
    creditLedger: (key, amount, txHash) => creditLedger(sql, key, amount, txHash),
    cardholderBalance: () => balanceOf(sql, cardholderId),
  };
}

/** Refuse to start a new local rehearsal against an already-used ledger state. */
export async function preflightT7LedgerIO(io: T7LedgerIO): Promise<void> {
  const key = refundKeyOf(io.row.refund_id);
  const [balance, credits, pending] = await Promise.all([
    io.cardholderBalance(), io.store.creditCount(key), io.store.pending(),
  ]);
  if (balance !== '300.00' || credits !== 0 || pending.length !== 0) {
    throw new Error('t7 ledger is not in its pre-run state; use a fresh authorized test database.');
  }
}
