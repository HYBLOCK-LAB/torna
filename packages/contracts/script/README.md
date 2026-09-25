# Local scenario runner and boundaries

Scope: Minseo's local contract deployment, all 13 scenario points, ledger retry and snapshot bundle. The
web, adapter and ledger packages are not modified. Viewing the plan does not read
secrets, contact an RPC endpoint, deploy contracts or create files.

## What is wired

```text
script/
  deploy.ts                 local-only preflight, receipt-confirmed deployment
  run-scenarios.ts          plan, partial rehearsals and explicit local-only full-bundle command
  snapshot.ts               block-pinned chain capture, no-overwrite writer and checked manifest
  runtime/
    local-config.ts         explicit local environment parsing and account derivation
    testnet-config.ts       explicit Monad Testnet opt-in, RPC and budget parsing
    ledger.ts               C ledger loader and read-only pre-run checks
    types.ts                public context; signing material is excluded
    errors.ts               explicit configuration and unsupported-state errors
  scenarios/
    plan.ts                 all 13 PRD timepoints and prerequisites
    execute.ts              receipt-checked t0-through-t7 plus separate t8/t9/t9b handlers
```

`scenario:plan` is always safe and does not access a chain:

```bash
corepack pnpm --filter @torna/contracts scenario:plan
```

The generic `--execute` entry point remains blocked; it must not be mistaken for a
testnet deployment command. The narrow t0 smoke path remains:

```bash
corepack pnpm --filter @torna/contracts scenario:t0
```

The local t0 rehearsal now calls C's `advanceRefund` and `repayRefund` from
`@torna/adapter`. The adapter hashes the identifiers, converts the two-decimal
amount, signs the action and Permit, submits with the index-2 wallet, and checks
the matching Torna events. The runner still checks its exact t0 accounting and
captures chain state. Its input is the example row from PROJECT_SPEC 10.6, **not**
a DB query: no `creditLedger` call or cardholder-balance update is claimed by this
command. The remaining scenario advances still use the local contract driver.
The adapter computes ordinary maturity from chain time plus five business days.
Scenario rows that require a same-run overdue review use a 120-second override.
The local contract driver now uses that short maturity for t1, t3 and t5 and
advances only the local Anvil clock to rehearse the wait. On public Testnet the
runner must wait for real block time; it must not call Anvil time-control RPCs.
The two initial issuers are registered at their real block time and receive
explicit bootstrap-ramp exemptions. The three t9 issuers do not.

The DB-backed path loads the seeded `REF-2026-001` row through C's ledger package.
At t0, C's `processRefund` commits the real card-ledger credit, then the injected
callback simulates a lost success response. The adapter queues the retry, while the
cardholder balance is already 1,300.00 and `ledger_credits` contains one row. This
is Minseo's 2026-09-24 interpretation of the same-key t0/t7 sample; it is not a
claim of a separate team-lead approval. At t7, only C's `runLedgerRetryJob` may call
`confirmLedgerCredit`: it must prove a matching `AdvanceIssued` log, prior DB
failure and retry-pending state, exactly one resulting `ledger_credits` row,
and no prior `LedgerCreditConfirmed` event. The ordinary advance path must never
call it. The retry returns `credited=false` because the first DB commit already
landed; the runner requires one acknowledgement, no duplicate balance increase and
no new advance.

The explicit full-run command accepts only a loopback PostgreSQL URL and local EVM
RPC. It reads all 378 seeded refund rows, uses their adapter-derived keys in the
scenario, and calls C's label-map builder once after all 13 captures. It refuses
an existing snapshot directory or label file. The project Supabase was checked
read-only; it was not reset or mutated. The focused Anvil test uses an in-memory
stand-in, while the complete local run uses a real throwaway Postgres database.

The currently implemented continuous segment has a separate, explicitly partial command:

```bash
corepack pnpm --filter @torna/contracts scenario:t6
```

It deploys once, executes and immediately saves `t0`, `t1`, `t2`, `t3`, `t3b`, `t4`,
`t4b`, `t5` and `t6`. It does not create a final bundle manifest or pretend t7+ succeeded.
The old `scenario:t5` command remains available for a shorter regression rehearsal.

For a fresh local Anvil and disposable Postgres seeded with C's ledger reset, set
the four local EVM variables below plus `DATABASE_URL` for that **loopback test DB**.
Then run from the repository root:

```bash
corepack pnpm --filter @torna/contracts scenario:local-bundle
corepack pnpm verify:bundle shared/snapshots/$RUN_ID
```

The first command saves all 13 snapshots, C's same-run DB label map and a manifest.
The second is the independent acceptance check. The local 2026-09-24 rehearsal
passed this check; it is not a Monad Testnet execution or submission bundle.

## Monad Testnet execution

The separate Testnet command uses the same 13 receipt-checked handlers and the
same throwaway **loopback** PostgreSQL ledger, but only accepts Monad Testnet
(10143) over HTTPS. It never changes block time: the three loss/delay waits poll
real block timestamps until their 120-second maturity. The 1-year and T+5 labels
are replayed scenario-calendar time; all state transitions and block timestamps
remain real. Testnet execution writes permanent public chain records and can
consume the configured gas budget. Do not use a production mnemonic or shared
database.

Set these values only in the shell session used for the run; never commit or
print the mnemonic or a credentialed RPC URL:

| Variable | Requirement |
| --- | --- |
| `TORNA_TESTNET_RPC_URL` | HTTPS Monad Testnet RPC. Keep any provider credential private. |
| `TORNA_TESTNET_MNEMONIC` | Dedicated throwaway Testnet mnemonic with the PRD's 15 derived accounts. |
| `RUN_ID` | New unique ID beginning `run-testnet-`. |
| `TORNA_TESTNET_BROADCAST` | Must be exactly `I_ACCEPT_TESTNET_GAS`; otherwise no runner starts. |
| `TORNA_TESTNET_GAS_BUDGET_MON` | Explicit budget, at least 15 MON, and the derived signers together must hold at least this amount. |
| `DATABASE_URL` | Disposable, seeded, loopback-only PostgreSQL URL; public or Supabase URLs are rejected. |

After a local 13-point rehearsal has passed and all nine gas-paying accounts
have been funded and checked, run:

```bash
corepack pnpm --filter @torna/contracts scenario:testnet-bundle
corepack pnpm verify:bundle shared/snapshots/$RUN_ID
```

Preflight checks the actual chain ID, compiled artifacts and combined signer
balance before the first deployment. That balance threshold is a floor, not a
promise that the chosen budget will cover every transaction; Monad charges by
gas limit. Use the 10-transaction rehearsal to measure per-signer gas before
attempting the full ~800-transaction run. The command refuses an existing run
directory or label file.

## Explicit local configuration

Local chain commands require every setting below. There is no fallback mnemonic,
RPC URL, account list or chain ID. The existing root `.env.example` is for Monad
Testnet, so it is intentionally not consumed by this local runner.

| Variable | Required value |
| --- | --- |
| `TORNA_LOCAL_RPC_URL` | A loopback HTTP(S) RPC URL such as your local node endpoint. Public and authenticated endpoints are rejected. |
| `TORNA_LOCAL_CHAIN_ID` | The actual local chain ID. `10143` (Monad Testnet) is rejected. |
| `TORNA_LOCAL_MNEMONIC` | Your explicitly started **local test** node mnemonic. Never commit, print or put it in a snapshot. |
| `RUN_ID` | A new ID in the form `run-local-...`; it is used only if capture can safely write output. |

The runner derives the PRD account allocation from that mnemonic: deployer index 0,
verifier 1, submitter 2, five issuers at 3–7, LP-01 through LP-06 at 8–13,
and the external idle EOA at 14. Start Anvil with **at least 15 accounts**. It checks the RPC-reported chain ID and gas balance for every account that
sends a transaction before deployment. The runtime keeps signing accounts in a private
closure; `RunContext` contains only public addresses, contract addresses, block numbers
and confirmed transaction hashes.

Start a fresh local-only Anvil process in a separate terminal. Choose a new local test
mnemonic yourself, keep it in that terminal session only, and do not commit it or paste
it into source files:

```bash
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --accounts 15 --mnemonic "$TORNA_LOCAL_MNEMONIC"
```

The runner requires the same session-local mnemonic in its own environment. The t0 command
logs a public execution report after the repayment confirms: contract addresses, confirmed
transaction hashes and block numbers only. It also reads the repayment block and checks
the exact t0 accounting: 10,000 LP principal, 2.4 LP fees, 500.399 reserve, 0.201
protocol fees, 3,600 collateral, zero outstanding and one 1,000-USDC advance.

The required t0 sequence is receipt-confirmed in this order:

1. Deploy MockUSDC and Torna, then verify the three contract roles.
2. Mint local test tokens, configure LP-01/02/03, approve and deposit 5,000/3,000/2,000 USDC.
3. Register HYBRID and AURA, advance only the local EVM clock by 30 days and confirm ramp-up ended.
4. Submit issuer-signed Permit-backed collateral deposits (3,000 and 600 USDC).
5. Seed the one-time 500 USDC reserve.
6. Ask the adapter to submit a signed 1,000 USDC advance and require a matching `AdvanceIssued` event.
7. Ask the adapter to submit the issuer-signed full-principal repayment and require a matching `AdvanceRepaid` event.

Issuers sign data but do not send a transaction or pay gas. The submitter pays gas for
the relayed collateral, advance and repayment calls; LPs pay gas for their own initial
liquidity deposits.

## Snapshot boundary

After each receipt, capture reads the Torna state and logs at that exact block. It derives
positions from real `AdvanceIssued` logs, reads each current position, and calculates pool,
issuer, LP and metric fields from contract values. It does not import or copy sample JSON.
The t0 smoke command writes a real `t0.json` to a new run directory. The t5 command writes
eight block-pinned snapshots from the same deployment. Reusing a run ID or overwriting a
snapshot is refused.

Because the command sends real transactions to the configured local node before reaching
that capture guard, use an expendable local chain and restart it between rehearsal runs.
It cannot run against Monad Testnet or a remote RPC endpoint.

## Verification boundary

Run the normal contract gate from the repository root:

```bash
corepack pnpm --filter @torna/contracts check
```

TypeScript tests cover missing local configuration, chain-ID/loopback rejection, public
context secrecy, t0 call order, t0-through-t7 capture order and the rule that a missing
required receipt event blocks capture and snapshot saving. They use in-memory fixtures
only; they are not chain integration evidence.

`test/T0Scenario.t.sol` covers the narrow normal path. `test/ScenarioAccounting.t.sol`
keeps one deployed contract alive through t0–t6 and independently exercises t8/t9/t9b
without t7. `test/IdleDeployment.t.sol` separately proves t6's real transfer, NAV-based
50% cap, role separation, failed recall freeze and successful approved recall. These verify
loss/cap/recovery, the t4 request boundary, repayment-triggered
LP exit, three rejected requests, three issuer registrations, two new advances and exact
six-decimal partial LP deposits. These are Foundry proofs, not an Anvil run or complete bundle.

The t8 rejection, t9 issuer-expansion and t9b partial-deposit handlers are connected
to the same local run. The 2026-09-24 disposable-DB rehearsal generated and passed
`verify:bundle` on 13 snapshots.
The t9b handler applies the section 7 deposit-cap formula in six-decimal base units;
the rounded sample values are not implementation targets. The t6 local handler moves
3,638.88 MockUSDC to an external EOA, leaves its allowance unset, and verifies both
token balances and the freeze event before capture. The t7 handler now delegates
to C's retry job. The manifest is written only after all snapshots and C's
same-run label map are checked. The local result still does not prove a testnet
deployment, gas budget or frontend narrative validation.
