# Deployment and scenario scaffold

Scope: Minseo's contract deployment, scenario orchestration and snapshot generation.
The web, adapter and ledger packages are not modified. No Git operations, network
requests, key generation, deployment or snapshot writes occur when viewing the plan.

## Structure

```text
script/
  deploy.ts                 deployment boundary (not wired)
  run-scenarios.ts          sequential orchestrator and safe plan CLI
  snapshot.ts               block-pinned capture/write/finalize boundaries (not wired)
  runtime/
    types.ts                shared execution context and dependency interfaces
    errors.ts               explicit unimplemented error
  scenarios/
    plan.ts                 all 12 timepoints, prerequisites and missing features
    execute.ts              scenario handler boundary (not wired)
  export-abi.mjs             existing, working compiled ABI exporter
  install-dependencies.mjs   existing Solidity dependency installer
```

## What runs now

From the repository root:

```bash
corepack pnpm --filter @torna/contracts scenario:plan
corepack pnpm --filter @torna/contracts check
```

The first command displays the plan without reading secrets or accessing RPC.
The second checks TypeScript scripts as well as the existing contract tests.
`--execute` deliberately exits nonzero in preflight: it must not pretend to deploy
or emit demo snapshots while required features and chain IO are missing.

`runScenarios(runtime)` implements orchestration with explicit dependencies:
preflight → deployment → execute/capture/save for each timepoint → finalization.
Unit tests inject **in-memory mocks only**; they are not chain integration evidence.
Capture must immediately follow each step using that step's confirmed block number.
Run ID, chain, contract, timepoint, sequence and block mismatches prevent saving.
Any failure stops later steps and finalization. No automatic transaction retries exist.

## Implementation sequence

1. Implement repayment and reserve seeding in the contracts with agreed authorization.
2. Wire preflight and deployment: validate configured chain/addresses and explicit
   signing configuration; deploy only MockUSDC and Torna, await receipts and retain
   public deployment metadata. Never export private keys, mnemonic or RPC credentials.
3. Implement t0 funding, collateral, advance and repayment using actual calls.
   A successful receipt alone does not prove advance approval: verify AdvanceIssued.
4. Wire snapshot reads at a fixed block, including historical logs up to that block.
   Use shared/types/snapshot.ts; do not invent zero values for unimplemented metrics.
5. Implement remaining handlers in PRD order, then no-overwrite snapshot output and
   manifest finalization with Minjae's matching label map. Run the real bundle verifier.

Only after these steps may a run be described as an executed 12-timepoint bundle.
Do not use sample JSON as runtime data. The sample is used exclusively in unit tests
as an in-memory shape fixture. Keep local time travel separate from a future testnet
time model; this scaffold makes no public-testnet time assumptions.

The initial runtime is intentionally blocked even for t8/t9, whose underlying
contract features exist: scenario history, accounts, deployment and IO are not wired.
No generated snapshots, placeholder transaction hashes or deployment addresses are
published by the scaffold.
