/**
 * creditLedger(refundKey, amount) — PROJECT_SPEC 10.6 ⑦.
 * Idempotent: backed by public.credit_ledger() and UNIQUE(refund_key), so a
 * retry for the same key never increases the balance twice (timepoint t7).
 * Returns true if this call credited the balance, false if already credited.
 *
 * Timing (decided 2026-09-22): call it right after an AdvanceIssued log is
 * confirmed, not after repayment.
 */
import type { Sql } from './db';

export async function creditLedger(
    sql: Sql, refundKey: string, dbAmount: string, chainTxHash: string | null = null): Promise<boolean> {
  const [row] = await sql<{ credited: boolean }[]>`
    select public.credit_ledger(${refundKey}, ${dbAmount}::numeric, ${chainTxHash}) as credited`;
  return row.credited;
}

export async function balanceOf(sql: Sql, cardholderId: string | number): Promise<string> {
  const [row] = await sql<{ balance: string }[]>`
    select balance::text as balance from public.cardholders where id = ${cardholderId}`;
  if (!row) throw new Error(`No cardholder ${cardholderId}`);
  return row.balance;
}
