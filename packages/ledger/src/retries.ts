/**
 * Ledger-credit retry queue (timepoint t7) — the DB half of the retry job.
 *
 * A refund enters the queue only when its advance succeeded on chain but the
 * ledger write failed. The adapter's retry job (packages/adapter/src/retry.ts)
 * reads this queue, re-runs the idempotent credit, and only then asks the
 * contract for the LedgerCreditConfirmed acknowledgement. A refund credited on
 * the first try is never queued, so the normal path never confirms.
 */
import type { LedgerRetryStore, PendingLedgerRetry } from '@torna/adapter';
import type { Sql } from './db';

/** Put a refund on the retry queue (or bump its attempt count). */
export async function enqueueLedgerRetry(
    sql: Sql, refundKey: string, advanceTxHash: string | null, error: string): Promise<void> {
  await sql`
    insert into public.ledger_credit_retries (refund_key, advance_tx_hash, last_error)
    values (${refundKey}, ${advanceTxHash}, ${error})
    on conflict (refund_key) do update
       set attempts        = public.ledger_credit_retries.attempts + 1,
           last_error      = excluded.last_error,
           advance_tx_hash = coalesce(public.ledger_credit_retries.advance_tx_hash, excluded.advance_tx_hash)
     where public.ledger_credit_retries.confirmed_tx_hash is null`;
}

/** Condition 2: queued and not yet acknowledged on chain. */
export async function listPendingLedgerRetries(sql: Sql): Promise<PendingLedgerRetry[]> {
  const rows = await sql<{ refund_key: `0x${string}`; advance_tx_hash: `0x${string}` | null }[]>`
    select refund_key, advance_tx_hash
      from public.ledger_credit_retries
     where confirmed_tx_hash is null
     order by enqueued_at, refund_key`;
  return rows.map(r => ({ refundKey: r.refund_key, advanceTxHash: r.advance_tx_hash }));
}

/** Re-run the idempotent credit using the refund's own DB amount (no conversion). */
export async function retryLedgerCredit(sql: Sql, refundKey: string): Promise<boolean> {
  const [row] = await sql<{ credited: boolean }[]>`
    select public.credit_ledger(r.refund_key, r.amount, null) as credited
      from public.refunds r
     where r.refund_key = ${refundKey}`;
  if (!row) throw new Error(`retryLedgerCredit: no refund with key ${refundKey}`);
  return row.credited;
}

/** Condition 3: number of ledger_credits rows for the key (must be exactly 1). */
export async function countLedgerCredits(sql: Sql, refundKey: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from public.ledger_credits where refund_key = ${refundKey}`;
  return row.n;
}

/** Close the queue row once the acknowledgement is on chain. */
export async function markLedgerRetryConfirmed(
    sql: Sql, refundKey: string, confirmedTxHash: string): Promise<void> {
  const result = await sql`
    update public.ledger_credit_retries
       set confirmed_tx_hash = ${confirmedTxHash}, confirmed_at = now()
     where refund_key = ${refundKey} and confirmed_tx_hash is null`;
  if (result.count !== 1) throw new Error(`markLedgerRetryConfirmed: no open retry for ${refundKey}`);
}

/** Record a failed retry attempt without closing the row. */
export async function noteLedgerRetryFailure(sql: Sql, refundKey: string, error: string): Promise<void> {
  await sql`
    update public.ledger_credit_retries
       set attempts = attempts + 1, last_error = ${error}
     where refund_key = ${refundKey} and confirmed_tx_hash is null`;
}

/** The adapter-facing store: plug this into runLedgerRetryJob / processRefund. */
export function ledgerRetryStore(sql: Sql): LedgerRetryStore {
  return {
    enqueue: (refundKey, advanceTxHash, error) => enqueueLedgerRetry(sql, refundKey, advanceTxHash, error),
    pending: () => listPendingLedgerRetries(sql),
    credit: refundKey => retryLedgerCredit(sql, refundKey),
    creditCount: refundKey => countLedgerCredits(sql, refundKey),
    markConfirmed: (refundKey, txHash) => markLedgerRetryConfirmed(sql, refundKey, txHash),
    noteFailure: (refundKey, error) => noteLedgerRetryFailure(sql, refundKey, error),
  };
}
