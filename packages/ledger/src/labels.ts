/**
 * Hash -> label map (shared/labels/<runId>.json, type LabelMap).
 * Uses the adapter's hash module: never re-implement hashing here.
 */
import { acquirerHashOf, refundKeyOf } from '@torna/adapter/hash';
import type { LabelMap } from '../../../shared/types/snapshot';
import type { Sql } from './db';

export async function buildLabelMap(sql: Sql, runId: string): Promise<LabelMap> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(runId)) throw new Error(`Invalid runId: ${runId}`);
  const out: LabelMap = { runId, refunds: {}, acquirers: {}, issuers: {} };

  const refunds = await sql<{ refund_id: string; amount: string; confirmed_at: Date }[]>`
    select refund_id, amount::text as amount, confirmed_at from public.refunds order by refund_id`;
  for (const r of refunds) {
    out.refunds[refundKeyOf(r.refund_id)] = {
      refundId: r.refund_id,
      amountUsdc: Number(r.amount),
      confirmedAt: r.confirmed_at.toISOString(),
    };
  }

  const acquirers = await sql<{ acquirer_id: string; display_name: string }[]>`
    select acquirer_id, display_name from public.acquirers order by acquirer_id`;
  for (const a of acquirers) {
    out.acquirers[acquirerHashOf(a.acquirer_id)] = { acquirerId: a.acquirer_id, displayName: a.display_name };
  }

  const issuers = await sql<{ key: string; name: string; region: string }[]>`
    select key, name, region from public.issuers order by key`;
  for (const i of issuers) out.issuers[i.key] = { name: i.name, region: i.region };

  return out;
}
