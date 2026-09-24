/**
 * Local smoke test for the adapter against a real local Torna deployment.
 * Chain only — the card ledger is an in-memory stand-in, so this package still
 * needs no DB. (The real ledger is packages/ledger; Minseo's runner wires both.)
 *
 * Proves, end to end on a local node:
 *   - normal path: advance -> AdvanceIssued -> ledger credit, NO acknowledgement
 *   - ledger outage: advance succeeds, credit fails -> refund is queued
 *   - retry job: credit recovered -> exactly one row -> confirmLedgerCredit once
 *   - a second job run does nothing; a duplicate acknowledgement is rejected
 *   - repayment of a normal refund
 *
 * LOCAL ONLY. Needs anvil + a local deployment (packages/contracts scenario:t0):
 *   TORNA_LOCAL_RPC_URL=http://127.0.0.1:8545 TORNA_LOCAL_CHAIN_ID=31337 \
 *   TORNA_LOCAL_MNEMONIC="..." TORNA_ADDRESS=0x... MOCK_USDC_ADDRESS=0x... \
 *   pnpm --filter @torna/adapter smoke
 */
import { createPublicClient, createWalletClient, http, parseAbi, type Address, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import {
  confirmLedgerCredit,
  processRefund,
  repayRefund,
  runLedgerRetryJob,
  type Deployment,
  type LedgerRetryStore,
  type RefundRow,
} from '../src/index';

function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}
const rpcUrl = env('TORNA_LOCAL_RPC_URL');
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(rpcUrl)) throw new Error('Local RPC only');
const chainId = Number(env('TORNA_LOCAL_CHAIN_ID'));
if (chainId === 10143) throw new Error('Refusing to run the smoke test on Monad Testnet');
const mnemonic = env('TORNA_LOCAL_MNEMONIC');
const deployment: Deployment = {
  chainId, torna: env('TORNA_ADDRESS') as Address, asset: env('MOCK_USDC_ADDRESS') as Address,
};

const account = (i: number) => mnemonicToAccount(mnemonic, { addressIndex: i });
const issuers = { HYBRID: account(3), AURA: account(4) } as const;   // PROJECT_SPEC 14
const publicClient = createPublicClient({ transport: http(rpcUrl) });
const submitter = createWalletClient({ account: account(2), transport: http(rpcUrl) });
const clients = { publicClient, submitter };
if ((await publicClient.getChainId()) !== chainId) throw new Error('RPC chain id mismatch');

// Issuers pay the 0.3% fee from their own balance: mint a little test USDC.
const deployer = createWalletClient({ account: account(0), transport: http(rpcUrl) });
for (const issuer of Object.values(issuers)) {
  const hash = await deployer.writeContract({
    address: deployment.asset, abi: parseAbi(['function mint(address to, uint256 amount)']),
    functionName: 'mint', args: [issuer.address, 10_000_000n], chain: null,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

// --- in-memory card ledger + retry queue (same contract as packages/ledger) ---
const credits = new Map<Hex, string>();                       // ledger_credits, UNIQUE(refund_key)
const queue = new Map<Hex, { advanceTxHash: Hex | null; confirmed: Hex | null }>();
const rows = new Map<Hex, RefundRow>();
const creditLedger = async (key: Hex, amount: string) => {
  if (credits.has(key)) return false;
  credits.set(key, amount);
  return true;
};
const store: LedgerRetryStore = {
  enqueue: async (key, advanceTxHash) => { if (!queue.has(key)) queue.set(key, { advanceTxHash, confirmed: null }); },
  pending: async () => [...queue].filter(([, v]) => !v.confirmed).map(([refundKey, v]) => ({ refundKey, advanceTxHash: v.advanceTxHash })),
  credit: async key => creditLedger(key, rows.get(key)!.amount),
  creditCount: async key => (credits.has(key) ? 1 : 0),
  markConfirmed: async (key, tx) => { queue.get(key)!.confirmed = tx; },
  noteFailure: async () => {},
};

const row = (refund_id: string, issuer_id: string, acquirer_id: string): RefundRow =>
  ({ refund_id, issuer_id, acquirer_id, amount: '1000.00', confirmed_at: '2026-09-14T10:00:00Z' });
const log: string[] = [];

// 1. Normal path.
const normal = row('REF-2026-003', 'HYBRID', 'ACQ-α');
const a = await processRefund({ clients, deployment, issuer: issuers.HYBRID, row: normal, creditLedger, retryStore: store });
rows.set(a.refundKey, normal);
log.push(`normal  REF-2026-003 -> ${a.status}, credited=${a.credited}, queued=${a.retryQueued}`);

// 2. Ledger outage: the advance succeeds on chain, the DB write fails.
const outage = row('REF-2026-002', 'AURA', 'ACQ-β');
const b = await processRefund({
  clients, deployment, issuer: issuers.AURA, row: outage, retryStore: store,
  creditLedger: async () => { throw new Error('simulated ledger outage'); },
});
rows.set(b.refundKey, outage);
log.push(`outage  REF-2026-002 -> ${b.status}, credited=${b.credited}, queued=${b.retryQueued}`);

// 3. Retry job: only the queued refund is recovered and acknowledged.
const first = await runLedgerRetryJob({ clients, deployment, store });
log.push(`retry#1 -> ${first.map(o => `${o.status}${o.status === 'confirmed' ? ` credited=${o.credited}` : ''}`).join(', ')} (${first.length} item)`);

// 4. Idempotence: nothing left to do; a duplicate acknowledgement is rejected on chain.
const second = await runLedgerRetryJob({ clients, deployment, store });
log.push(`retry#2 -> ${second.length} items`);
const dup = await confirmLedgerCredit(clients, deployment, b.refundKey);
log.push(`duplicate ack REF-2026-002 -> ${dup.status}`);

// 5. Repayment of the normal refund.
const repaid = await repayRefund({ clients, deployment, issuer: issuers.HYBRID, refundId: 'REF-2026-003' });
log.push(`repay   REF-2026-003 -> ${repaid.status}`);
log.push(`ledger rows: ${credits.size}, acknowledged: ${[...queue.values()].filter(v => v.confirmed).length}`);
console.log(log.join('\n'));
