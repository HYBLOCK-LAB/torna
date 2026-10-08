# Torna

**Instant card refunds, backed by a shared pool on Monad.** When a merchant confirms a refund, a USDC pool on Monad advances it to the card issuer, so the cardholder can spend it at confirmation instead of days later. The issuer repays the pool at settlement, and if a refund never arrives, the loss is shared in a fixed order instead of falling on the issuer alone.

Built for **Monad Metropolis** — Consumer Products & Payments.

| | |
|---|---|
| Live demo | https://torna-six.vercel.app/ — replays a recorded Monad Testnet run, no wallet needed |
| Pitch video (2 min) | https://youtu.be/1BkC3ps4lpg |
| Network | Monad Testnet (chain id 10143) |
| Contract | [`0xc43121a73e3e4a46b6a2a8827a34d9a324138ed6`](https://testnet.monadscan.com/address/0xc43121a73e3e4a46b6a2a8827a34d9a324138ed6) |
| Recorded run | `run-testnet-20261001-a` — about 800 transactions, 806 on-chain events |

---

## The problem

Cancel a hotel booking and the refund is approved in seconds, but the money takes days to settle back onto the card. On a prepaid or debit travel card there is no credit line to lean on in between, so the traveller has to find the money for the next booking somewhere else.

Issuers could credit a confirmed refund early — the posting time is theirs to decide. They don't, because if the refund never arrives they carry the loss alone.

## What Torna does

Torna sells **risk sharing, not just liquidity.**

1. The issuer's adapter signs an advance request (EIP-712) for a confirmed refund.
2. The contract checks the signature, duplicates and limits, and sends USDC to the issuer's settlement wallet. The issuer pays a 0.3% fee.
3. The issuer restores the cardholder's balance in its own ledger. The cardholder sees dollars, not tokens — no wallet, no gas, no button.
4. When the refund settles (T+5 in the demo), the issuer repays the principal.
5. If a refund never arrives, a separate verifier confirms the loss and the waterfall absorbs it.

The fee is split 80% to LPs, 13.3% to the protocol reserve and 6.7% to the protocol.

**Premise: a hybrid issuer.** Torna assumes a card program that keeps the existing card rails and also settles in USDC between institutions — the kind of program already running on Visa (160+ stablecoin-linked card programs). Torna does not claim an integration with any real issuer or network; every issuer in the demo is fictional.

## Why a chain

Issuers, LPs, a verifier and the protocol do not trust each other, yet they need one ledger of who advanced what, who owes what and who absorbs a loss. On Monad the waterfall and limits are enforced by one contract, settlement is atomic, rival issuers can share one pool without trusting each other, and every rejection stays on the record.

---

## How the risk is contained

| Control | Value |
|---|---|
| Loss waterfall | issuer margin (first 20% of the position) → protocol reserve (seeded at 500) → LP senior |
| Single-event cap | losses from one acquirer finalize up to 20% of LP principal; the excess is held for review |
| Recovery | paid back in reverse order: held amount → LP → reserve → issuer |
| Issuer collateral | 15% of outstanding advances (= 50% acquirer concentration × 20% loss share × 1.5) |
| Issuer limit | min(collateral ÷ 15% × ramp-up, pool capacity × max(40%, 1 ÷ issuers)) |
| New issuer ramp-up | 50% of limit for the first 30 days |
| Acquirer exposure | 50% of pool capacity, checked on new advances |
| LP deposit cap | max(current outstanding, 5,000) ÷ 30% target utilization |
| Single LP concentration | 25% |
| Idle deployment | up to 50% of NAV to an external venue (mocked) |

The cap does not eliminate loss. It stops one event from taking down the pool.

---

## The demo

The site replays one recorded run: thirteen timepoints executed against a single deployment on Monad Testnet. Every state change behind them is a real testnet transaction, and every hash links to the Monad Testnet explorer. Replaying the record means no visitor needs gas and no two visitors overwrite each other.

| Timepoint | Scenario |
|---|---|
| t0 | Cardholder refund experience |
| t1 | One year of normal operation (365 advances) |
| t2 | Confirmed loss → waterfall |
| t3 · t3b | Correlated loss → cap triggered · recovery settlement |
| t4 · t4b | LP withdrawal and liquidity · follow-up |
| t5 | Delayed but repaid |
| t6 | External venue frozen |
| t7 | Chain succeeded, ledger failed → retry |
| t8 | Invalid requests rejected (duplicate ID, unregistered signer, wrong chain ID) |
| t9 · t9b | More issuers join · capital arrives beyond the deposit cap |

Eight of the nine scenarios after t0 are incidents. The numbers are a stress test of the safety machinery, not a business projection; cumulative LP P&L ends negative because the losses are packed into one run.

---

## Run it

```bash
corepack enable pnpm
pnpm install
pnpm dev                 # demo front end at http://localhost:5173
```

Verify the recorded bundle and its narrative:

```bash
pnpm verify:bundle shared/snapshots/run-testnet-20261001-a
pnpm verify:narrative
```

Contracts (requires [Foundry](https://getfoundry.sh)):

```bash
cd packages/contracts
pnpm setup:solidity      # forge-std 1.9.7, OpenZeppelin 5.4.0
pnpm test                # Foundry tests + shared-vector tests
```

Adapter and ledger tests:

```bash
pnpm --filter @torna/adapter test
pnpm --filter @torna/ledger test
```

---

## Layout

```
packages/
  contracts/   Torna.sol + MockUSDC, Foundry tests, deploy and scenario scripts
  adapter/     issuer side: refund conversion, EIP-712 signing, submission, retry
  ledger/      card issuer ledger (Postgres schema and seed data)
  web/         demo front end (React + Vite), replays the snapshot bundle
shared/        the contract between packages: ABI, types, copy, labels, snapshots
scripts/       bundle and narrative verifiers
docs/          index of the design documents
```

## Design documents

- [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) — the full product and system spec (Korean). Code comments refer to its chapters.
- [`packages/contracts/DECISIONS.md`](./packages/contracts/DECISIONS.md) — decision log for the contract.
- [`docs/README.md`](./docs/README.md) — index of the design rationale documents (Korean).

---

## Team

**HYBLOCK**, the blockchain society at Hanyang University.

- **Seojin Lee** — protocol design, front end (Information Systems)
- **Minseo Kim** — smart contracts (Computer Software Engineering)
- **Minjae Jeong** — issuer adapter, ledger (Computer Software Engineering)

## Notes

`HYBRID`, `AURA`, `NOVA`, `MERIDIAN` and `KITE` are fictional card issuers. The demo runs on Monad Testnet with mock USDC: no real money and no mainnet deployment are involved. Figures are demo assumptions and guarantee nothing about future returns; liquidity provision is aimed at institutions.

Internal design documents are in Korean. Everything shipped — this README, the product copy, contract comments, commit messages — is in English.
