/**
 * Ledger-credit retry job (timepoint t7) — the ONLY place that emits the
 * on-chain LedgerCreditConfirmed acknowledgement.
 *
 * The acknowledgement is sent once, and only when all four hold (team rule,
 * 2026-09-24):
 *   1. the position exists on chain, proven by an AdvanceIssued log (not by
 *      receipt status alone)
 *   2. the refund's ledger write failed earlier and it is on the retry queue
 *   3. ledger_credits now has exactly one row for the key (the retry worked)
 *   4. no acknowledgement exists yet (DB row still open, and the contract
 *      would not reject it)
 * A refund credited on the first try never enters the queue (condition 2), so
 * the normal advance path never reaches this code.
 *
 * The adapter does not know the DB: the queue is injected as a LedgerRetryStore
 * (packages/ledger: ledgerRetryStore(sql)).
 */
import type { Hex } from 'viem';

import { readPosition, type AdapterClients } from './chain';
import { confirmLedgerCredit, hasAdvanceIssuedLog } from './ledgerAck';
import type { Deployment } from './sign';

export interface PendingLedgerRetry {
  refundKey: Hex;
  /** Transaction that emitted AdvanceIssued; null if it was not recorded. */
  advanceTxHash: Hex | null;
}

export interface LedgerRetryStore {
  /** Queue a refund whose ledger write failed after a confirmed advance. */
  enqueue(refundKey: Hex, advanceTxHash: Hex | null, error: string): Promise<void>;
  /** Queued and not yet acknowledged (condition 2). */
  pending(): Promise<PendingLedgerRetry[]>;
  /** Idempotent credit_ledger with the refund's DB amount. true = credited now. */
  credit(refundKey: Hex): Promise<boolean>;
  /** Rows in ledger_credits for the key (condition 3 requires exactly 1). */
  creditCount(refundKey: Hex): Promise<number>;
  /** Close the queue row with the acknowledgement transaction. */
  markConfirmed(refundKey: Hex, confirmTxHash: Hex): Promise<void>;
  /** Record a failed attempt; the row stays open for the next run. */
  noteFailure(refundKey: Hex, error: string): Promise<void>;
}

export type LedgerRetryOutcome =
  | { refundKey: Hex; status: 'confirmed'; credited: boolean; txHash: Hex; blockNumber: bigint }
  | { refundKey: Hex; status: 'skipped'; reason: 'no-advance-log' | 'credit-count' | 'contract-rejected'; detail: string }
  | { refundKey: Hex; status: 'failed'; error: string };

const message = (e: unknown) => (e instanceof Error ? e.message.split('\n')[0] : String(e));

/** Process every open retry once. Never throws for a single item; see the outcomes. */
export async function runLedgerRetryJob(args: {
  clients: AdapterClients;
  deployment: Deployment;
  store: LedgerRetryStore;
}): Promise<LedgerRetryOutcome[]> {
  const { clients, deployment: d, store } = args;
  const outcomes: LedgerRetryOutcome[] = [];

  for (const item of await store.pending()) {           // condition 2
    const { refundKey } = item;
    try {
      // Condition 1: position exists AND its AdvanceIssued log is on chain.
      const position = await readPosition(clients, d, refundKey);
      const logged = position && item.advanceTxHash
        ? await hasAdvanceIssuedLog(clients, d, refundKey, item.advanceTxHash)
        : false;
      if (!position || !logged) {
        const detail = !position ? 'no on-chain position' : 'AdvanceIssued log not found in the recorded advance tx';
        await store.noteFailure(refundKey, detail);
        outcomes.push({ refundKey, status: 'skipped', reason: 'no-advance-log', detail });
        continue;
      }

      // Re-run the ledger write (idempotent; false if an earlier attempt already landed).
      const credited = await store.credit(refundKey);

      // Condition 3: exactly one ledger_credits row.
      const count = await store.creditCount(refundKey);
      if (count !== 1) {
        const detail = `ledger_credits has ${count} rows for this key`;
        await store.noteFailure(refundKey, detail);
        outcomes.push({ refundKey, status: 'skipped', reason: 'credit-count', detail });
        continue;
      }

      // Condition 4: open DB row (guaranteed by pending()) + contract accepts it.
      const ack = await confirmLedgerCredit(clients, d, refundKey);
      if (ack.status === 'contract-rejected') {
        await store.noteFailure(refundKey, ack.detail);
        outcomes.push({ refundKey, status: 'skipped', reason: 'contract-rejected', detail: ack.detail });
        continue;
      }
      await store.markConfirmed(refundKey, ack.txHash);
      outcomes.push({ refundKey, status: 'confirmed', credited, txHash: ack.txHash, blockNumber: ack.blockNumber });
    } catch (error) {
      await store.noteFailure(refundKey, message(error)).catch(() => {});
      outcomes.push({ refundKey, status: 'failed', error: message(error) });
    }
  }
  return outcomes;
}
