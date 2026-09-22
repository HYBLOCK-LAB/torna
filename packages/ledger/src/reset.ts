/**
 * Reset the ledger to the pre-run state (PROJECT_SPEC 15, step 2):
 * schema.sql (drop + recreate) -> seed/seed.sql -> refund_key backfill.
 * DESTRUCTIVE: every table is emptied.
 */
import { readFileSync } from 'node:fs';

import type { Sql } from './db';
import { fillRefundKeys } from './refunds';

const file = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

export async function resetLedger(sql: Sql): Promise<{ refundKeys: number }> {
  // The SQL files manage their own BEGIN/COMMIT, so run them on one reserved connection.
  const conn = await sql.reserve();
  try {
    await conn.unsafe(file('../schema.sql'));
    await conn.unsafe(file('../seed/seed.sql'));
  } finally {
    conn.release();
  }
  const refundKeys = await fillRefundKeys(sql);
  return { refundKeys };
}
