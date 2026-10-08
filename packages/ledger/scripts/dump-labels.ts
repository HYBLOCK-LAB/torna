/**
 * RUN_ID=run-20260925 pnpm --filter @torna/ledger dump-labels
 * Writes shared/labels/<RUN_ID>.json. runId = snapshot folder = label file name.
 */
import { writeFileSync } from 'node:fs';

import { buildLabelMap, connect } from '../src/index';

const runId = process.env.RUN_ID?.trim();
if (!runId) throw new Error('RUN_ID is not set (e.g. run-20260925)');

const sql = connect();
try {
  const labels = await buildLabelMap(sql, runId);
  const target = new URL(`../../../shared/labels/${runId}.json`, import.meta.url);
  writeFileSync(target, JSON.stringify(labels, null, 2) + '\n');
  console.log(`labels: ${Object.keys(labels.refunds).length} refunds, `
    + `${Object.keys(labels.acquirers).length} acquirers, ${Object.keys(labels.issuers).length} issuers `
    + `-> shared/labels/${runId}.json`);
} finally {
  await sql.end();
}
