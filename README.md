# Torna

**Instant card refunds on Monad.** A collateral-backed liquidity pool fronts card issuers, so a cardholder's balance is restored in seconds instead of days.

Built for **Monad Metropolis** — Consumer Products & Payments.

> **Team members start here:** [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) — roles, shared contracts, timeline. Read sections 1–10, then the chapter for your role.

---

## The problem

When you cancel a hotel booking, the refund is confirmed immediately but the money is not. Settlement takes three to five business days, and until it lands your spending power is gone. You have the budget. You just cannot reach it.

Card networks guarantee that the refund eventually arrives, so nobody is out of pocket in the end. What nobody fixes is the wait.

## What Torna does

A shared pool advances the confirmed refund to the card issuer the moment it is confirmed. The issuer restores the cardholder's balance right away and repays the pool when settlement arrives, typically five days later. The pool earns a fee for carrying those five days.

The cardholder does nothing. There is no button, no wallet, no USDC, no gas — just a balance that is already there.

**Torna sells time, not protection.**

## Why it needs a chain

Four parties who do not trust each other — issuers, liquidity providers, a verifier, and the protocol — need to agree on one ledger of who advanced what, who owes what, and who absorbs a loss. Settlement is atomic, the loss waterfall is enforced by code rather than by a contract nobody reads, and every rejection stays on the record for audit.

---

## How the risk is contained

| Control | Value |
|---|---|
| Issuer collateral | 15% of outstanding |
| Issuer first-loss share | 20% of the advance |
| Loss waterfall | issuer margin → protocol reserve → LP senior → single-event cap |
| Single-event cap | 20% of LP deposits |
| Acquirer exposure cap | 50% of deployable capital, on new advances |
| Idle deployment cap | 50% |
| LP deposit cap | average outstanding ÷ 30% target utilization |
| Single LP concentration | 25% |
| New issuer ramp-up | 50% of limit for the first 30 days |

The cap does not eliminate loss. It stops one event from taking down the pool.

---

## The demo

Five screens read one on-chain ledger: the cardholder app, the issuer console, the LP dashboard, the verifier, and a public view.

Twelve timepoints walk through a year of operation and eight failure modes — a confirmed loss, a correlated loss that triggers the cap, recovery settlement, an LP withdrawal under pressure, a delayed repayment, a frozen external venue, a ledger write that fails after the chain succeeded, invalid requests refused at the door, and the pool taking on more issuers and more capital.

**Nine of the twelve are stress cases.** The numbers are not a business projection; they are a test of whether the safety machinery works.

Every scenario was executed on Monad Testnet ahead of time. The site replays the record, so no visitor needs gas and no two visitors overwrite each other.

---

## Run it

```bash
corepack enable pnpm
pnpm install
pnpm dev                 # http://localhost:5173
```

Verify a snapshot bundle:

```bash
pnpm verify:bundle shared/snapshots/sample
```

---

## Layout

```
packages/
  contracts/   Solidity, Foundry tests, deploy and scenario scripts
  adapter/     issuer-side conversion, EIP-712 signing, submission
  ledger/      card issuer ledger (Postgres) and seed data
  web/         the demo front end
shared/        the contract between the three: ABI, types, copy, snapshots, labels
scripts/       bundle verifier
docs/          interface draft and Notion index
```

## Deployment

| | |
|---|---|
| Network | Monad Testnet (chain id 10143) |
| Contract | _to be filled after deployment_ |
| Explorer | _to be filled after deployment_ |
| Demo | _to be filled after deployment_ |

---

## Notes

`HYBRID`, `AURA`, `NOVA`, `MERIDIAN` and `KITE` are fictional card issuers. All figures are demo assumptions and no real transaction is involved. Returns shown are realised past figures and guarantee nothing about the future; liquidity provision is aimed at institutions.

Internal design documents are in Korean. Everything shipped — this README, the product copy, contract comments, commit messages — is in English.
