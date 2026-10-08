/**
 * pnpm --filter @torna/ledger reset
 * DESTRUCTIVE: drops and recreates every ledger table, reseeds, fills refund_key.
 */
import { connect, resetLedger } from '../src/index';

const sql = connect();
try {
  const { refundKeys } = await resetLedger(sql);
  const [{ refunds }] = await sql<{ refunds: number }[]>`select count(*)::int as refunds from public.refunds`;
  console.log(`ledger reset: ${refunds} refunds, ${refundKeys} refund_key values written`);
} finally {
  await sql.end();
}
