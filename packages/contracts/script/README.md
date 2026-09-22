# Local t0 runner and scenario boundaries

Scope: Minseo's contract deployment, t0 orchestration and snapshot boundary. The
web, adapter and ledger packages are not modified. Viewing the plan does not read
secrets, contact an RPC endpoint, deploy contracts or create files.

## What is wired

```text
script/
  deploy.ts                 local-only preflight, receipt-confirmed deployment
  run-scenarios.ts          plan CLI, strict local t0 runner, full-run guard
  snapshot.ts               t0 block-pinned read boundary and no-overwrite writer
  runtime/
    local-config.ts         explicit local environment parsing and account derivation
    types.ts                public context; signing material is excluded
    errors.ts               explicit configuration and unsupported-state errors
  scenarios/
    plan.ts                 all 13 PRD timepoints and prerequisites
    execute.ts              receipt-checked t0 normal path; later handlers blocked
```

`scenario:plan` is always safe and does not access a chain:

```bash
corepack pnpm --filter @torna/contracts scenario:plan
```

`--execute` deliberately exits nonzero. It does not deploy contracts or write a
partial 13-timepoint bundle. Only the local t0 path is implemented:

```bash
corepack pnpm --filter @torna/contracts scenario:t0
```

## Explicit local configuration

The local t0 command requires every setting below. There is no fallback mnemonic,
RPC URL, account list or chain ID. The existing root `.env.example` is for Monad
Testnet, so it is intentionally not consumed by this local runner.

| Variable | Required value |
| --- | --- |
| `TORNA_LOCAL_RPC_URL` | A loopback HTTP(S) RPC URL such as your local node endpoint. Public and authenticated endpoints are rejected. |
| `TORNA_LOCAL_CHAIN_ID` | The actual local chain ID. `10143` (Monad Testnet) is rejected. |
| `TORNA_LOCAL_MNEMONIC` | Your explicitly started **local test** node mnemonic. Never commit, print or put it in a snapshot. |
| `RUN_ID` | A new ID in the form `run-local-...`; it is used only if capture can safely write output. |

The runner derives the PRD account allocation from that mnemonic: deployer index 0,
verifier 1, submitter 2, HYBRID issuer 3, AURA issuer 4, and LP-01/02/03 at indices
8/9/10. Start Anvil with **at least 11 accounts**; its default is only 10 and cannot
fund LP-03 at index 10. It checks the RPC-reported chain ID and gas balance for every account that
sends a transaction before deployment. The runtime keeps signing accounts in a private
closure; `RunContext` contains only public addresses, contract addresses, block numbers
and confirmed transaction hashes.

Start a fresh local-only Anvil process in a separate terminal. Choose a new local test
mnemonic yourself, keep it in that terminal session only, and do not commit it or paste
it into source files:

```bash
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --accounts 11 --mnemonic "$TORNA_LOCAL_MNEMONIC"
```

The runner requires the same session-local mnemonic in its own environment. It logs a
public execution report after the repayment confirms: contract addresses, confirmed
transaction hashes and block numbers only. It also reads the repayment block and checks
the exact t0 accounting: 10,000 LP principal, 2.4 LP fees, 500.399 reserve, 0.201
protocol fees, 3,600 collateral, zero outstanding and one 1,000-USDC advance.

The required t0 sequence is receipt-confirmed in this order:

1. Deploy MockUSDC and Torna, then verify the three contract roles.
2. Mint local test tokens, configure LP-01/02/03, approve and deposit 5,000/3,000/2,000 USDC.
3. Register HYBRID and AURA, advance only the local EVM clock by 30 days and confirm ramp-up ended.
4. Submit issuer-signed Permit-backed collateral deposits (3,000 and 600 USDC).
5. Seed the one-time 500 USDC reserve.
6. Submit a signed 1,000 USDC advance and require a matching `AdvanceIssued` event.
7. Submit the issuer-signed full-principal repayment and require a matching `AdvanceRepaid` event.

Issuers sign data but do not send a transaction or pay gas. The submitter pays gas for
the relayed collateral, advance and repayment calls; LPs pay gas for their own initial
liquidity deposits.

## Snapshot safety boundary

Immediately after the repayment receipt, t0 reads supported Torna values at that exact
block: LP principal/fees, outstanding, reserve, protocol fees and advance counters. It
does not import or copy any sample JSON.

The current contract has no on-chain source for several required schema fields, including
loss totals, reserve usage, loss-cap state, external-deployment state, repayment-rate
history and rejected-request totals. Therefore capture throws
`SnapshotMetricUnavailableError` and **does not save `t0.json`**. This is intentional:
writing zeroes would make a non-evidenced snapshot look real. The no-overwrite writer is
implemented for the point when all metrics are chain-backed, but no snapshot directory is
created by the current strict capture path.

Because the command sends real transactions to the configured local node before reaching
that capture guard, use an expendable local chain and restart it between rehearsal runs.
It cannot run against Monad Testnet or a remote RPC endpoint.

## Verification boundary

Run the normal contract gate from the repository root:

```bash
corepack pnpm --filter @torna/contracts check
```

TypeScript tests cover missing local configuration, chain-ID/loopback rejection, public
context secrecy, t0 call order and the rule that a missing required receipt event blocks
capture and snapshot saving. They use in-memory fixtures only; they are not chain
integration evidence.

`test/T0Scenario.t.sol` complements those boundary tests with one Foundry local-EVM
scenario. It executes the same t0 economic path using synthetic test identities and
asserts Permit-backed token movement, `AdvanceIssued`/`AdvanceRepaid`, exact PRD fee
accounting and both advance/repayment replay prevention. It is still not an Anvil run
or a generated snapshot bundle.

The remaining PRD handlers (`t1` through `t9b`), generated bundle manifest and Minjae's
label map are still external dependencies or scaffolds. Do not describe this as an
executed 13-timepoint bundle until all handlers run on a local chain, capture every schema
field from authoritative sources and `pnpm verify:bundle` succeeds on that generated run.
