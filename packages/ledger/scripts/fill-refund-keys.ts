/** pnpm --filter @torna/ledger fill-refund-keys — non-destructive refund_key backfill. */
import { connect, fillRefundKeys } from '../src/index';

const sql = connect();
try {
  const written = await fillRefundKeys(sql);
  const [{ missing }] = await sql<{ missing: number }[]>`
    select count(*)::int as missing from public.refunds where refund_key is null`;
  console.log(`refund_key: ${written} written, ${missing} still missing`);
  if (missing !== 0) process.exitCode = 1;
} finally {
  await sql.end();
}
