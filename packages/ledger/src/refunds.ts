/** Read/update helpers for public.refunds (packages/ledger/schema.sql). */
import { refundKeyOf, type RefundRow } from '@torna/adapter';
import type { PositionState } from '../../../shared/types/snapshot';
import type { Sql } from './db';

export interface LedgerRefund extends RefundRow {
  refund_key: string | null;
  cardholder_id: string | null;
  status: string;
  position_state: PositionState | null;
  timepoint: string | null;
  maturity_override_seconds: number | null;
}

const COLUMNS = `refund_id, refund_key, issuer_id, acquirer_id, cardholder_id,
  amount::text as amount, confirmed_at, status, position_state, timepoint,
  maturity_override_seconds`;

export async function getRefund(sql: Sql, refundId: string): Promise<LedgerRefund | null> {
  const rows = await sql.unsafe<LedgerRefund[]>(`select ${COLUMNS} from public.refunds where refund_id = $1`, [refundId]);
  return rows[0] ?? null;
}

export async function listRefunds(sql: Sql, filter: { timepoint?: string } = {}): Promise<LedgerRefund[]> {
  if (filter.timepoint) {
    return sql.unsafe<LedgerRefund[]>(
      `select ${COLUMNS} from public.refunds where timepoint = $1 order by refund_id`, [filter.timepoint]);
  }
  return sql.unsafe<LedgerRefund[]>(`select ${COLUMNS} from public.refunds order by refund_id`);
}

/**
 * Fill refunds.refund_key with the adapter's hash (Postgres has no keccak256).
 * Idempotent; also verifies keys that are already set. Returns rows written.
 */
export async function fillRefundKeys(sql: Sql): Promise<number> {
  const rows = await sql<{ refund_id: string; refund_key: string | null }[]>`
    select refund_id, refund_key from public.refunds order by refund_id`;
  let written = 0;
  for (const row of rows) {
    const key = refundKeyOf(row.refund_id);
    if (row.refund_key === key) continue;
    if (row.refund_key !== null) {
      throw new Error(`refund_key mismatch for ${row.refund_id}: DB ${row.refund_key}, adapter ${key}`);
    }
    await sql`update public.refunds set refund_key = ${key} where refund_id = ${row.refund_id}`;
    written += 1;
  }
  return written;
}

/** Mirror the on-chain position state (spelling = PROJECT_SPEC 10.7). */
export async function setPositionState(
    sql: Sql, refundKey: string, state: PositionState, advanceTxHash?: string | null): Promise<void> {
  const result = await sql`
    update public.refunds
       set position_state = ${state},
           advance_tx_hash = coalesce(${advanceTxHash ?? null}, advance_tx_hash)
     where refund_key = ${refundKey}`;
  if (result.count !== 1) throw new Error(`setPositionState: no refund with key ${refundKey}`);
}
