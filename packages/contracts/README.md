# Torna contracts

Owner: Minseo (B). Local PoC, updated 2026-09-22.

## Implemented

- Solidity 0.8.24, Foundry configuration, OpenZeppelin 5.4.0 and forge-std 1.9.7.
- Six-decimal MockUSDC with role-restricted test minting and OpenZeppelin ERC20Permit.
- Torna constructor, role configuration, asset validation and EIP-712 diagnostic helpers.
- PRD request/enum/event definitions and matching shared TypeScript exports.
- Pure Limits formulas and Waterfall allocation, cap and recovery calculations.
- D01 one-time initial LP funding: fixed 5,000/3,000/2,000 allocations, actual token
  receipt validation, principal accounting and irreversible completion.
- Admin-only issuer registration with immutable registration timestamps, 30-day
  ramp classification and a diagnostic limit preview using supplied accounting inputs.
- Relayed collateral deposits with separate signed action authorization, optional
  atomic Permit, exact token receipts and per-issuer/aggregate collateral balances.
- Signed advances with optional fee Permit, replay/limit checks, full principal
  payment, separate PRD fee accounting and position/outstanding records.
- Issuer-signed full-principal repayment with optional exact Permit, atomic token
  receipt, replay protection and outstanding/state updates.
- Verifier-only Review, CoveredLoss/CapHeld finalization, LP-loss accounting and
  aggregate recovery settlement for one active acquirer event.
- A local-EVM t0 scenario that verifies the complete Permit-backed normal path:
  LP funding, issuer ramp-up, collateral, reserve seed, advance, repayment,
  event receipts, exact accounting and replay prevention.
- Unit/fuzz tests and a shared Solidity/viem hash vector.

**Partial repayment is not implemented.** LP withdrawals now use NAV/share pricing:
`requestWithdraw(principal)` pays `min(NAV × share, cash × share)` immediately and keeps
the remainder pending until a repayment makes it payable. Completion removes the LP's
principal, proportional fee share and current LP-loss share. Post-bootstrap LP deposits are
implemented with PRD cap-based partial acceptance. Loss execution is implemented locally but
the current demo keeps one pending LP withdrawal at a time; a multi-request queue remains future work.
the 13-timepoint chain runner and production snapshot generation are not complete.
Do not send real funds: use synthetic local test tokens only.

## Initial liquidity (D01 approved by Minseo, 2026-09-20)

1. Admin calls `configureInitialLiquidity([lp01, lp02, lp03])` once. Distinct nonzero
   addresses (not Torna itself) receive fixed allocations of 5,000/3,000/2,000 USDC.
   Addresses cannot be replaced, even before funding: verify them before configuration.
2. Each LP approves Torna and calls `depositInitialLiquidity(amount)` for its exact
   allocation. Only this path bypasses individual concentration limits; the pool cap
   still applies. LPs pay their own transaction gas. Deposits may arrive in any order.
3. Successful exact token receipts update `lpPrincipal`/`totalLpPrincipal` and emit
   `LiquidityDeposited`. The final receipt sets `initialLiquidityComplete` and emits
   `InitialLiquidityCompleted`. No role can reopen or repeat initial funding.

Missing allowance, failed/short token receipts and reentrancy are rejected atomically.
Direct token donations do not grant principal or count toward completion. The initial
deposit records are now connected to the NAV/share withdrawal accounting described below.
Configuration and completion events are additional setup events, separate from the
20 PRD events; their ABI is available in the compiled artifact, not shared/events.ts.

`whenLiquidityReady` gates both implemented advance entry points and
`depositLiquidity`. Post-bootstrap deposits use
`Limits.depositRoom(totalLpPrincipal, lpPrincipal[lp], totalOutstanding)` with no
initial-LP exception. `depositLiquidity(amount)` receives only its available room,
emits `LiquidityDeposited` for that amount and emits `DepositRejected` for any
remainder. At zero outstanding LP-01 has no additional room. The caller pays gas and
only the accepted amount is transferred; callers can read `liquidityDepositRoom` before
approving an exact amount. A fully rejected request transfers no tokens.

## Issuer registration and 30-day ramp

Minseo approved the local demo setup: register HYBRID and AURA, advance the local
test clock by 30 days before t0, then register NOVA/MERIDIAN/KITE at t9 as new issuers.
Company names and this schedule belong in test/scenario setup, not protocol exceptions.

- `registerIssuer(address, bytes32, string)` is admin-only, emits IssuerRegistered,
  and records the actual block timestamp. Duplicate registration, zero/self addresses,
  zero acquirer hashes and empty names revert. There is no timestamp override/reset.
- `issuerRegistrationOf(address)` returns registration metadata, not operational
  Active/Suspended status or proof of collateral. Unknown issuers revert.
- `isIssuerRamping(address)` is true before registration + 30 days, false at that
  exact timestamp and afterward. Unknown issuers revert; existence is a separate flag.
- `previewIssuerLimit(address, collateral, poolCapacity, issuerCount)` applies the
  registered age to the existing Limits formula. During ramp-up, only the collateral
  side is halved; the pool concentration cap still applies. **Inputs are supplied by
  the caller; the result is diagnostic, not an enforceable spending allowance.**

Collateral and advance authorization are implemented below. A registered company
is not automatically approved to receive funds. Execution uses `issuerLimit`, backed
by actual stored balances and `registeredIssuerCount`, including unfunded issuers.
Excluding suspended issuers is NOT implemented; administrative suspension/removal
and its counting policy remain future work. `issuerStateOf` derives only the current
collateral status (zero collateral => Suspended, insufficient 15% margin => MarginCall).
The registration-only demo test does not generate the full 13-snapshot bundle.
Local clock control does not work on public testnet; that demonstration plan remains D10.

## Gasless token approval (Permit)

MockUSDC inherits OpenZeppelin 5.4.0 ERC20Permit. An issuer signs Permit off-chain;
the submitter calls the token's `permit` and pays gas. `owner` is the issuer,
`spender` is Torna (not the submitter). The domain is **Torna Mock USDC / 1 / actual
chainId / token address**, distinct from the AdvanceRequest domain at Torna.
Token `nonces(owner)` provides per-owner replay protection; successful permits
replace allowances. Invalid/expired/replayed signatures revert atomically.

`deadline` accepts equality and limits submission time, not allowance lifetime.
Permit alone does not transfer tokens, choose a beneficiary or record collateral.
The implemented collateral flow separately authorizes its action and safely handles
permits submitted first by another caller. The standard token permit is publicly
relayable, not SUBMITTER_ROLE-gated; relayers acquire no allowance themselves.

Shared signing types/domain/ABI are in `shared/abi/permit.ts`; the shared README
has an adapter signing example and integration constraints. Test vectors contain
only public hashes. ECDSA EOA signatures are supported; contract-wallet signatures
and compatibility with other USDC implementations are not claimed.

Tests cover an issuer with zero native balance and no approve transaction, altered
fields/domain/chain/token, expiration/equality, replay and nonce rollback, per-owner
nonces, allowance replacement/revocation, relayers unable to spend, a test spender
consuming only its allowance, and Solidity/viem hash/ABI conformance. The spender
probe is test-only, not a collateral entry point. Gas cost on testnet was not measured.

## Relayed collateral deposits

Only SUBMITTER_ROLE can call either deposit entry point. Each requires an issuer's
separate `CollateralDepositRequest(issuer, amount, nonce, deadline)` signature under
the Torna domain. This is an implementation addition to the old address/amount-only
interface draft: a generic token allowance must not let a relayer choose a deposit.
The action nonce comes from `collateralDepositNonces(issuer)` and is independent of
the token's permit nonce and advance nonce. Deadline equality is allowed.

- `depositCollateral(request, signature)`: consume an already-existing allowance.
- `depositCollateralWithPermit(request, signature, permitSignature)`: token approval
  and collateral deposit in one relayer transaction. Permit owner/spender/value are
  fixed to request.issuer/Torna/request.amount. No arbitrary beneficiary is accepted.
- `collateralOf(issuer)` and `totalCollateral()` read credited amounts in six-decimal
  units. Unknown addresses return zero collateral; use registration queries for existence.

Both paths require a registered issuer, a positive amount, an unexpired action,
the current action nonce and a valid issuer signature. They pull only that issuer's
funds into Torna and credit only that issuer after exact receipt. They emit the PRD
`CollateralDeposited` event. No native gas balance or on-chain approve from the issuer
is required when using Permit. Existing approve-based allowances also work, but
still require a valid signed collateral action and an authorized submitter.

The combined path tolerates permit failure (including someone having relayed it
first) only with sufficient existing allowance and the independently valid action.
It does not silently bypass action signature/expiry/nonce checks. A transfer or
receipt failure rolls back all effects in that transaction, including a permit
registered within it. A permit from an earlier transaction remains unchanged.
Reentrancy is blocked across the deposit/initial-liquidity entry points.

Collateral is separate from LP principal and is not automatically pool liquidity.
Direct donations grant neither collateral nor LP principal. Collateral withdrawals,
partial repayment and administrative operational-state transitions remain unavailable.
Loss finalization may deduct collateral according to the PRD waterfall. See
`shared/abi/collateral.ts` and the shared README for signing/ABI.

## Signed advances (2026-09-21)

- `advance(request, signature)` uses an existing fee allowance.
- `advanceWithPermit(request, signature, permitSignature)` approves only the fee
  (`quoteAdvanceFee(amount).fee`) and executes in one submitter transaction.
- Both require SUBMITTER_ROLE, completed initial funding and a registered issuer's
  EIP-712 signature. The original AdvanceRequest type/domain is unchanged.
- `advanceNonces(issuer)` is strictly sequential, consumed only on issuance. It is
  independent of the collateral-action and token Permit nonces. Deadline equality
  is accepted; maturity must be strictly in the future. Business-day conversion is
  the adapter's job. refundKey must be nonzero and is unique across all issuers.
- The signed acquirer must equal the issuer's registered acquirer. Checks use the
  stored collateral, accumulated issuer/acquirer outstanding, 30-day ramp and LP
  capacity. They never trust the diagnostic preview's caller-supplied inputs.

### Fee decision and accounting

Notion document 6 specifies issuer payment at successful advance time from a separate
balance, no user fee, no charge on rejection, and principal-only repayment. Minseo
explicitly chose the **PRD split** on 9/21: 80% / 13.3% / 6.7%, not Notion's rounded
2.40 / 0.40 / 0.20 example. A 1,000 USDC advance therefore collects 3 USDC and records
LP 2.400000, reserve 0.399000 and protocol 0.201000. Total fee, LP and reserve shares
round down to six-decimal base units; protocol receives the residual so no dust is lost.
Amounts below 334 base units have a zero rounded fee; there is no added minimum fee.

The issuer must already hold the fee before principal is paid. The contract pulls
the fee first, records the position/counters, then transfers the **full principal**
to the signed issuer. Collateral is unchanged: the position's 20% issuerMargin and
80% poolCoverage are loss terms, not collateral locked for each advance. The position
stores fee, maturity, these loss amounts, termsVersion=1 and Advanced state.

`poolCapacity = max(totalLpPrincipal + totalLpFees - totalLpLoss - temporary withdrawal payments, 0)` and
`poolCash = capacity - outstanding`. Finalized LP losses reduce capacity; reserve,
protocol fees, collateral and unsolicited donations do not increase LP capacity.
`totalLoss()` separately reports current collateral loss + reserve loss + LP loss for
the public metrics view.
Per-issuer/acquirer/aggregate outstanding and total successful count/amount are stored.
Aggregate LP fees are distributed pro rata when an LP withdrawal completes; an active
withdrawal's immediate payment is tracked separately until its pending remainder is paid.
The admin seeds the fixed 500 USDC reserve once through `seedReserve`; the seed is
tracked separately from fee-funded reserve balance and does not increase LP capacity.

### Business rejection vs reverted transaction

`advance*` returns bool. Duplicate key (1), unknown issuer (2), invalid signature (3),
expiry (5), issuer limit (6), acquirer limit (7) and zero-collateral suspension (8)
emit AdvanceRejected and return false without consuming an action nonce, permit or fee.
Check order is key, registration, expiry, signature, nonce/input, status, issuer limit,
acquirer limit, cash. A wrong chain/contract cannot be inferred from the signature;
it maps to InvalidSignature (3), NOT reserved code 4.

Unauthorized callers, incomplete bootstrap, wrong nonce, malformed signed input,
acquirer mismatch, insufficient pool cash/backing, missing fee allowance and token
failures revert with custom/OpenZeppelin errors. No rejection event survives a revert.
An adapter must require AdvanceIssued from the configured Torna address and matching
refundKey/issuer/amount, not just receipt success. Simulation bool is not final proof.

Missing/short fee or principal transfers roll back the entire transaction, including
new Permit, fee collection, position, nonce and counters. An earlier separately relayed
permit remains valid if the later advance reverts. Reentrancy is blocked on both paths.
No complete adapter integration or 13-snapshot run is claimed. The local t0 runner is
documented below; it is restricted to explicit loopback configuration and refuses to
write a partial snapshot while required on-chain metrics are unavailable.
See `shared/abi/advance.ts`, `test/Advance.t.sol` and `docs/CONTRACT_LEARNING.md`.

## Full-principal repayment (2026-09-21)

- `repay(request, signature)` uses an existing exact principal allowance.
- `repayWithPermit(request, signature, permitSignature)` approves and receives the
  exact principal in the same SUBMITTER_ROLE transaction.
- `RepaymentRequest` binds refundKey, issuer, full position amount, the independent
  `repaymentNonces(issuer)` value and deadline to the Torna EIP-712 domain.
- Only an existing `Advanced` or `Review` position can be repaid. The issuer and amount
  must match the stored position exactly; partial, excess and repeated repayments revert.
- Success receives the token amount exactly, sets the position to `Repaid`, and reduces
  issuer, acquirer and aggregate outstanding. Advance totals and all fee balances stay
  unchanged because PRD repayment is principal-only.
- Failed/short token receipts, invalid signatures/nonces, expired actions, missing
  allowance, reentrancy or insufficient pool backing revert the entire transaction.
  A Permit from an earlier transaction remains available after a later repayment revert.

This is the full-principal repayment required for t0 and the implemented Review escape
path before loss finalization. D05 remains open for partial repayment policy and
collateral withdrawal. See `shared/abi/repayment.ts`,
`test/Repayment.t.sol` and `test/RepaymentVector.t.sol`.

## Loss review, capped losses and recovery (implemented locally)

The verifier owns the loss path through three role-gated calls:

- `openReview(refundKey, evidence)` can be called after maturity. It records both
  `MarkedOverdue` and `ReviewOpened`, then changes the position to `Review`.
- `finalizeCoveredLoss(refundKey)` applies the PRD waterfall once. Issuer margin is
  charged first, then reserve, then LP loss. The position becomes `CoveredLoss` only
  when the same acquirer's cumulative coverage fits within `20%` of total LP principal;
  otherwise it becomes `CapHeld`.
- `recordRecovery(refundKey, recovered)` pulls the recovery amount from the verifier's
  allowance and settles every position grouped by the anchor's `acquirerHash`. Previously
  recognized loss is reconciled so issuer collateral is not charged twice, and all grouped
  positions become `RecoveryRecorded`.

The current demo groups an event by `acquirerHash` and requires one issuer per event.
This is an implementation boundary, not a final product decision; a multi-issuer event
needs a separate collateral allocation rule. Recovery is recorded once per active event,
and a later call for the same positions is rejected because they are terminal; temporary
event aggregation is cleared so a future event can use the same acquirer. `Loss.t.sol` covers the
PRD t3/t3b numbers, Review repayment, maturity and role checks, missing allowance,
over-recovery rollback and duplicate recovery.

The local contract gate passes, but the full 13-timepoint chain run, testnet deployment,
and generated production snapshot bundle are not claimed here.

## Setup

Run from the repository root. Node 20+, Corepack and Foundry are required.

```bash
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm --filter @torna/contracts setup:solidity
```

The repository pins pnpm 9.12.0. Use Corepack to avoid an unrelated global pnpm
version. Solidity libraries are downloaded into this package's ignored lib/
directory at explicit release tags; the installer does not create Git submodules
or commits. It resolves an absolute project root for nested-repository support
in Foundry 1.5.1.

This host also has a pnpm 11 executable on PATH. Existing root scripts that invoke
bare pnpm can reach that executable even when their parent was started through
Corepack. The contract test command avoids nesting pnpm. To smoke-test the web
package here, use `corepack pnpm --filter @torna/web build` directly.

## Verify

All commands below run from the repository root.

For the complete local contract gate, run `corepack pnpm --filter @torna/contracts check`.
It checks formatting, compilation, exported ABI freshness, types and all tests without
overwriting the shared ABI. See [Sunday handoff](SUNDAY_HANDOFF.md) for scope and follow-ups.

```bash
corepack pnpm --filter @torna/contracts build
corepack pnpm --filter @torna/contracts export:abi
corepack pnpm --filter @torna/contracts test
corepack pnpm --filter @torna/contracts typecheck
corepack pnpm --filter @torna/contracts fmt:check
corepack pnpm verify:bundle shared/snapshots/sample
```

The test command runs Foundry, then TypeScript conformance checks. Fuzz tests run
256 inputs each. Shared tests compare the request tuple and all 20 declared
protocol events to the compiled Solidity ABI, including indexed fields.

The fixed public vector lives in shared/abi/fixtures/advance-request.json.
Both languages validate its UTF-8 identifiers and final EIP-712 digest.
It contains no private key. Test identities are synthetic and local to Foundry:
3 operators + 5 issuers + 6 LPs = 14 actors.

If a restricted macOS environment crashes in system-configuration while starting
Forge, run the same test command with the environment's normal execution approval.
This is a host-tool startup failure, not a Solidity test failure.

## Layout

The local t0 runner and the remaining deployment/scenario boundaries are documented in
[script/README.md](script/README.md). `corepack pnpm --filter @torna/contracts scenario:plan`
displays the 13-timepoint plan without chain access. `scenario:t0` is the only wired
chain path; later handlers and final bundle output remain unavailable.

- src/Torna.sol: roles, initial/ordinary liquidity, reserve, collateral, issuer/ramp
  queries, signed advances and full-principal repayments.
- src/MockUSDC.sol: test asset with ERC-2612 Permit, not native or bridged USDC.
- src/TornaTypes.sol: request, enum codes and foundation errors.
- src/TornaEvents.sol: protocol event declarations, including implemented loss events.
- src/libraries/Limits.sol: current-outstanding deposit cap, issuer and acquirer limits.
- src/libraries/Waterfall.sol: fresh-loss allocation, whole-position cap admission and
  aggregate recovery settlement.
- test/: Solidity tests, including synthetic role fixtures.
- test-ts/: shared wire-format conformance tests.
- script/install-dependencies.mjs: pinned Solidity dependency installation.
- DECISIONS.md: unresolved product rules and handoff checklist.

No issuer-count policy or bootstrap exception is hidden in Limits. The caller
supplies pool capacity and issuer count. Monetary calculations round down in token
base units; display rounding is a separate concern. The stateful loss path applies
the same pure calculations and keeps event grouping in Torna.

## Next implementation gate

Initial funding follows the approved D01 decision. Resolve the remaining decisions
in DECISIONS.md before building the other stateful token flows.
Then implement collateral withdrawal and extend the LP withdrawal accounting into the
full timepoint runner alongside its tests.
`shared/abi/Torna.json` is generated from the current compiled implementation.
Regenerate with `export:abi` after interface changes; do not hand-edit it.

The Wednesday acceptance target remains: all Foundry tests, a continuous local
t0-to-t9b run, and verification of the generated bundle with Minjae's label map.
Passing the existing sample bundle does not satisfy that target.

Use feature branches and review the shared interface with its consumers before
integration. Keep authenticated RPC URLs and signing material out of source and
logs. This package has not deployed to a public network.

References: [OpenZeppelin EIP-712 and ECDSA](https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography),
[Foundry dependency installation](https://getfoundry.sh/projects/dependencies).
