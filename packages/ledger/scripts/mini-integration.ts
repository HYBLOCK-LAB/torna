/**
 * Mini integration (PROJECT_SPEC 16, "9/22에 미니 통합"): 3 refunds end to end
 *   DB row -> adapter (hash, convert, EIP-712 + fee Permit) -> local Torna -> AdvanceIssued
 *   -> creditLedger (idempotent) -> retry does nothing -> repayment.
 *
 * LOCAL ONLY. Prerequisites: anvil + Minseo's local t0 deployment
 * (packages/contracts: scenario:t0), and a throwaway Postgres (this RESETS it).
 *
 *   TORNA_LOCAL_RPC_URL=http://127.0.0.1:8545 TORNA_LOCAL_CHAIN_ID=31337 \
 *   TORNA_LOCAL_MNEMONIC="test test ... junk" TORNA_ADDRESS=0x... MOCK_USDC_ADDRESS=0x... \
 *   TEST_DATABASE_URL=postgres://... pnpm --filter @torna/ledger exec node --import tsx scripts/mini-integration.ts
 */
import { createPublicClient, createWalletClient, http, parseAbi, type Address } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import { processRefund, readPosition, repayRefund, type Deployment } from '@torna/adapter';
import { balanceOf, connect, creditLedger, getRefund, resetLedger, setPositionState } from '../src/index';

function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

const rpcUrl = env('TORNA_LOCAL_RPC_URL');
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(rpcUrl)) throw new Error('Local RPC only');
const chainId = Number(env('TORNA_LOCAL_CHAIN_ID'));
if (chainId === 10143) throw new Error('Refusing to run the mini integration on Monad Testnet');
const dbUrl = env('TEST_DATABASE_URL');
if (/supabase/.test(dbUrl)) throw new Error('Refusing to reset the shared Supabase DB; use a throwaway Postgres');
const mnemonic = env('TORNA_LOCAL_MNEMONIC');
const deployment: Deployment = {
  chainId,
  torna: env('TORNA_ADDRESS') as Address,
  asset: env('MOCK_USDC_ADDRESS') as Address,
};

const account = (i: number) => mnemonicToAccount(mnemonic, { addressIndex: i });
const deployer = account(0);
const submitterAccount = account(2);
const issuers = { HYBRID: account(3), AURA: account(4) } as const; // PROJECT_SPEC 14 index table

const publicClient = createPublicClient({ transport: http(rpcUrl) });
const submitter = createWalletClient({ account: submitterAccount, transport: http(rpcUrl) });
const clients = { publicClient, submitter };
if ((await publicClient.getChainId()) !== chainId) throw new Error('RPC chain id mismatch');

// Test-only setup: issuers pay the 0.3% fee from their own USDC balance.
const mintAbi = parseAbi(['function mint(address to, uint256 amount)']);
const deployerWallet = createWalletClient({ account: deployer, transport: http(rpcUrl) });
for (const issuer of Object.values(issuers)) {
  const hash = await deployerWallet.writeContract({
    address: deployment.asset, abi: mintAbi, functionName: 'mint', args: [issuer.address, 10_000_000n], chain: null,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

const sql = connect(dbUrl);
try {
  await resetLedger(sql);
  const credit = (key: `0x${string}`, amount: string, tx: `0x${string}` | null) => creditLedger(sql, key, amount, tx);
  const rows: string[] = [];

  for (const refundId of ['REF-2026-003', 'REF-2026-002', 'REF-2026-005']) {
    const row = await getRefund(sql, refundId);
    if (!row?.cardholder_id) throw new Error(`${refundId} missing`);
    const issuer = issuers[row.issuer_id as keyof typeof issuers];
    const before = await balanceOf(sql, row.cardholder_id);
    const out = await processRefund({ clients, deployment, issuer, row, creditLedger: credit });
    if (out.status !== 'rejected') await setPositionState(sql, out.refundKey, 'Advanced', out.status === 'issued' ? out.txHash : null);
    const after = await balanceOf(sql, row.cardholder_id);
    rows.push(`${refundId} ${row.issuer_id.padEnd(6)} ${out.status.padEnd(14)} credited=${out.credited} balance ${before} -> ${after}`);
  }

  // t7-style retry: the key already exists on chain -> no new tx, no second credit.
  const again = await getRefund(sql, 'REF-2026-003');
  const retry = await processRefund({ clients, deployment, issuer: issuers.HYBRID, row: again!, creditLedger: credit });
  rows.push(`retry REF-2026-003 -> ${retry.status}, credited=${retry.credited}, balance ${await balanceOf(sql, again!.cardholder_id!)}`);

  // Repayment of one position (issuer-signed RepaymentRequest + principal Permit).
  const repaid = await repayRefund({ clients, deployment, issuer: issuers.HYBRID, refundId: 'REF-2026-003' });
  const position = await readPosition(clients, deployment, repaid.refundKey);
  if (position) await setPositionState(sql, repaid.refundKey, position.state);
  rows.push(`repay REF-2026-003 -> ${repaid.status}, on-chain state ${position?.state}`);

  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.ledger_credits`;
  rows.push(`ledger_credits rows: ${n}`);
  console.log(rows.join('\n'));
} finally {
  await sql.end();
}
