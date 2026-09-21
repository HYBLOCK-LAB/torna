# Shared contract interface

Owner: Minseo (B). Version-one wire-format proposal, ready for consumer review.

## Available now

| File | Purpose |
|---|---|
| eip712.ts | AdvanceRequest fields, TypeScript input type and explicit domain builder |
| permit.ts | MockUSDC Permit signing types, token domain and narrow token approval ABI |
| collateral.ts | Collateral action signing types and implemented deposit/read ABI |
| advance.ts | Implemented advance/fee Permit API and position/accounting queries |
| Torna.json | Full ABI exported from the compiled implementation, including custom errors |
| states.ts | Solidity enum indexes and snapshot-compatible state names |
| reasons.ts | Advance rejection codes 1..8 and deposit rejection codes 1..2 |
| events.ts | The 20 PRD protocol event ABI entries, including indexed fields |
| fixtures/advance-request.json | Public fixed hashes consumed by Solidity and TypeScript tests |
| fixtures/permit.json | Public Permit hashes checked by Solidity and TypeScript, without keys/signatures |
| fixtures/collateral-deposit.json | Public collateral-action hashes checked by both languages |

Regenerate Torna.json with `corepack pnpm --filter @torna/contracts export:abi` after
changing Solidity interfaces. Tests compare it exactly to the compiled implementation.
Initial LP funding emits LiquidityDeposited, admin issuer registration emits
IssuerRegistered, collateral deposits emit CollateralDeposited, and advances emit
AdvanceIssued or AdvanceRejected. Repayment/withdrawal/loss execution is still pending.
D01 also adds InitialLiquidityConfigured(address[3]) and
InitialLiquidityCompleted(uint256) setup events in the compiled artifact; they are
not part of the 20 PRD entries in events.ts. See the contracts README for the setup API.
Issuer registration metadata and the diagnostic ramp/limit queries are documented
there too. Balance-derived status and signed advance execution are implemented;
administrative suspension/removal and loss-driven state transitions remain pending.

## Signing input

Import the shared definitions instead of rewriting the struct in the adapter.
Example imports below assume a file directly inside packages/adapter/src/.

```ts
import {
  advanceRequestTypes, tornaDomain, ADVANCE_REQUEST_PRIMARY_TYPE,
  type AdvanceRequest,
} from '../../../shared/abi/eip712';

// issuerAccount, verifiedChainId, tornaAddress and request come from the adapter.
const typedData = {
  domain: tornaDomain(verifiedChainId, tornaAddress),
  types: advanceRequestTypes,
  primaryType: ADVANCE_REQUEST_PRIMARY_TYPE,
  message: request satisfies AdvanceRequest,
};
const signature = await issuerAccount.signTypedData(typedData);
```

Name is Torna and version is 1. Obtain chainId from the connected chain.
Monad Testnet uses the PRD target 10143; local tests also exercise 31337.
Never silently sign for a different chain or a placeholder contract address.

Amount is bigint in six-decimal base units. Maturity is uint64 and deadline is
uint256, both Unix seconds. Nonce is uint256. Only the issuer signs this approval;
the submitter sends the advance transaction and pays gas. Read `advanceNonces(issuer)`.

## Token approval by signature

MockUSDC now supports OpenZeppelin ERC20Permit (ERC-2612). The issuer signs off-chain;
the submitter sends the on-chain `permit` transaction and pays its gas. The issuer
does not send an `approve` transaction. The approval grants Torna an allowance only:
**it neither transfers tokens nor records collateral.**

Keep the two signatures separate:

| Field | Token approval (Permit) | Advance request |
|---|---|---|
| Meaning | Allow Torna to spend a specified amount of tokens | Request a specified refund advance |
| Domain name | Torna Mock USDC | Torna |
| Domain verifyingContract | Deployed MockUSDC address | Deployed Torna address |
| Owner/signer | Issuer | Issuer |
| Spender | Torna address, never the submitter wallet | Not a Permit field |
| Nonce source | MockUSDC.nonces(issuer) | Torna.advanceNonces(issuer) |

Example imports from packages/adapter/src; all clients/addresses/accounts below
must come from the actual configured deployment, not the public test vector:

```ts
import { parseUnits } from 'viem';
import {
  mockUsdcPermitAbi, mockUsdcPermitDomain, permitTypes, PERMIT_PRIMARY_TYPE,
} from '../../../shared/abi/permit';

const chainId = await publicClient.getChainId();
const nonce = await publicClient.readContract({
  address: tokenAddress, abi: mockUsdcPermitAbi,
  functionName: 'nonces', args: [issuerAccount.address],
});
const message = {
  owner: issuerAccount.address,
  spender: tornaAddress,
  value: parseUnits('3000', 6), // exact needed allowance, not unlimited
  nonce,
  deadline, // bigint Unix seconds, chosen using the connected chain's time
};
const signature = await issuerAccount.signTypedData({
  domain: mockUsdcPermitDomain(chainId, tokenAddress),
  types: permitTypes, primaryType: PERMIT_PRIMARY_TYPE, message,
});
```

The submitter splits the signature into v/r/s and calls
`MockUSDC.permit(owner, tornaAddress, value, deadline, v, r, s)` using its own wallet.
Use v=27/28 (not raw yParity=0/1). Nonce is signed, but it is not a permit call
argument: the token checks its current nonce internally. Wait for the receipt and
verify the allowance before assuming approval is available. This snippet covers
approval only, not a full adapter service. The deposit API is described below.

Integration constraints:

- A successful permit replaces the allowance and consumes the owner's token nonce.
  Replays/expired/invalid signatures revert. Failures do not consume the nonce.
- Exactly at deadline is valid. **Deadline limits when the signature can be
  submitted, not how long the resulting allowance lasts.** Value 0 can revoke an
  allowance via a new signature. Prefer exact amounts and short submission windows.
- Anyone can relay a valid permit; the token does not require SUBMITTER_ROLE. Relaying
  it gives that caller no spending rights. Only the signed spender receives allowance.
- A permit is not authorization for a particular collateral deposit, repayment or
  beneficiary. Collateral now requires its own signed action as described below;
  future financial actions must also enforce their own authorization.
- Another caller can submit the permit first. The combined deposit tolerates this
  only after independently validating the action and checking the required allowance.
- This implementation uses ECDSA signatures from our synthetic EOA test accounts.
  Smart-contract-wallet signature support and real USDC variants are not promised.
- Never reuse the AdvanceRequest domain/signature/nonce for Permit. Do not log
  still-valid permit signatures or store them in public artifacts.

## Collateral action and submission (implemented)

The old draft `depositCollateral(address,uint256)` is replaced by the signed-action
API below. A permit alone is not a deposit instruction. The issuer signs two messages
for the combined path; both are off-chain. Only the submitter sends a transaction.

| Signature | Domain contract | Nonce source | What it authorizes |
|---|---|---|---|
| Permit | MockUSDC | token.nonces(issuer) | Torna's token allowance |
| CollateralDepositRequest | Torna | Torna.collateralDepositNonces(issuer) | This issuer's exact collateral deposit |

Import `collateralDepositTypes`, `COLLATERAL_DEPOSIT_PRIMARY_TYPE`, `collateralAbi`
from `shared/abi/collateral.ts` and `tornaDomain` from `eip712.ts`.

```ts
const actionNonce = await publicClient.readContract({
  address: tornaAddress, abi: collateralAbi,
  functionName: 'collateralDepositNonces', args: [issuerAccount.address],
});
const request = {
  issuer: issuerAccount.address,
  amount: parseUnits('3000', 6),
  nonce: actionNonce,
  deadline: actionDeadline, // bigint Unix seconds
};
const actionSignature = await issuerAccount.signTypedData({
  domain: tornaDomain(chainId, tornaAddress),
  types: collateralDepositTypes,
  primaryType: COLLATERAL_DEPOSIT_PRIMARY_TYPE,
  message: request,
});
// permitSignature contains { deadline, v, r, s } from a separate token Permit:
// owner=request.issuer, spender=tornaAddress, value=request.amount.
const txHash = await submitterWallet.writeContract({
  address: tornaAddress, abi: collateralAbi,
  functionName: 'depositCollateralWithPermit',
  args: [request, actionSignature, permitSignature],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
if (receipt.status !== 'success') throw new Error('Collateral deposit reverted');
```

The example assumes configured clients/accounts and the connected chain's addresses,
time and current nonces; it does not implement the adapter service. If allowance
already exists, use `depositCollateral(request, actionSignature)` instead. Both
entry points require SUBMITTER_ROLE, a registered issuer, positive amount, valid
action signature and current action nonce. No beneficiary parameter exists: the
token owner and collateral beneficiary are always request.issuer.

Read `collateralOf(issuer)` and `totalCollateral()` and decode CollateralDeposited
using events.ts. A successful deposit consumes only its action nonce plus a token
nonce if a new permit was accepted. The signed action expires after its deadline
(equality allowed), even if token allowance remains. A permit submitted previously
may be reused as input to the combined call because the action signature and
allowance are independently checked; invalid permit data alone grants nothing.

Failure rolls back only the current transaction. Thus combined approval+deposit
roll back together, while approval from a previous successful transaction remains.
Retry the same action only after confirming it did not already succeed and reading
the action nonce. LP principal, collateral and raw contract token balance are
different accounting values. Withdrawals, repayment and full issuer status transitions
remain unimplemented. Fee collection and state-backed advance limits are now implemented.

## Advance submission (implemented)

Import `advanceAbi` from `shared/abi/advance.ts`; continue using the unchanged
AdvanceRequest signing type/domain from eip712.ts. Both entry points require
SUBMITTER_ROLE and completed initial LP funding.

1. Read `advanceNonces(issuer)` and construct/sign the request, with a nonzero globally
   unique refundKey, registered acquirer, positive amount and future maturity.
2. Read `quoteAdvanceFee(amount)`; sign a token Permit for **fee only**, not principal
   or principal+fee: owner=issuer, spender=Torna, value=fee. Keep the token and action
   domains/nonces separate. The issuer must already have that separate fee balance.
3. Submit `advanceWithPermit(request, signature, permitSignature)`. If the fee allowance
   already exists, `advance(request, signature)` also works. Both return bool in simulation.
4. Wait for the actual receipt. A reverted receipt is failure. For a successful receipt,
   filter logs by the configured **Torna address**, then decode events using events.ts.
   Require `AdvanceIssued` matching the request key/issuer/amount/maturity. `AdvanceRejected`
   means no issuance even though the receipt succeeded. Do not credit a user's ledger
   based on receipt status or simulation alone. DB credit timing remains a separate team decision.

Only a successful issuance consumes `advanceNonces` and the refundKey. Duplicate keys
are rejected across all issuers. Business rejection consumes neither nonce nor Permit
nor fee, so an unchanged unexpired request can be retried if its blocking condition clears.
Token Permit from a previous transaction persists even if a later advance reverts.
Do not create a new refundKey just because a receipt or adapter response was lost;
inspect positionOf, the logs and current nonce first.

PRD split chosen by Minseo: a 1,000 advance collects 3 USDC separately and books
2.400000 to LPs, 0.399000 to reserve and 0.201000 to protocol. The issuer receives
the full 1,000 principal. Total fee/LP/reserve are floored in token base units and
protocol receives the residual. No fee is charged again by the planned principal-only repayment.

Rejection order: duplicate key (1), unregistered issuer (2), expired deadline (5),
invalid signature/domain (3), then nonce/input validation, suspended (8), issuer limit (6),
acquirer limit (7), available pool cash. Wrong nonce, zero amount/key, nonfuture maturity,
acquirer mismatch, insufficient cash/backing/allowance and token errors **revert** instead
of emitting a business rejection. Reserved code 4 cannot be inferred from a signature.
Deadline equality is accepted. Malformed signatures return reason 3 without ECDSA panics.

Queries: `positionOf`, `issuerLimit`, `issuerStateOf`, `advanceNonces`,
`issuerOutstanding`, `acquirerOutstanding`, `totalOutstanding`, `poolCapacity`,
`poolCash`, `totalLpFees`, `reserveBalance`, `protocolFees`, `totalAdvanceCount`,
`totalAdvanced`, `registeredIssuerCount`. Position `exists` is separate from enum zero;
unknown keys revert. Margin/coverage are frozen loss terms, not individually locked collateral.
Count includes all registered issuers; suspension does not increase other issuers' limits.
Pool queries currently assume no losses, withdrawals or external deployments; those
operations and per-LP fee distribution are not enabled yet. Reserve seed funding is pending.

## Identifier encoding

Hash the **exact UTF-8 bytes** of refundId and acquirerId:

```ts
keccak256(stringToHex('REF-2026-001'))
keccak256(stringToHex('ACQ-α'))
```

This matches Solidity keccak256(bytes(value)), not keccak256(abi.encode(value)).
Do not trim, change case, transliterate Greek characters or normalize input in one
consumer only. A different source identifier must be rejected or intentionally
specified by the data producer. The adapter owns the reusable hashing function;
its label dumper must import the same implementation.

A DB decimal string "1000.00" becomes 1000000000n. If the input is instead an
integer number of cents, 100000n becomes 1000000000n by multiplying by 10000n.
Do not multiply an already converted on-chain amount again. Snapshot serialization
converts base units back to human USDC units.

## Important boundaries

- Enum value 0 means Registered/Active, not record existence. The contract must
  track whether a record exists separately when storage is introduced.
- Rejection code 4 (ChainMismatch) is reserved by the PRD draft. A signature alone
  does not reveal which wrong chain or contract domain was used. Domain mismatch
  currently only changes the recovered signer; no distinct failure classification
  is promised.
- AdvanceRequest and token Permit each have their own implemented nonce/deadline
  rules. A successful advance changes neither the collateral nonce nor collateral balance.
- Calling recoverAdvanceSigner is diagnostic only. It does not approve an advance
  or prevent replay.
- Receipt success alone does not mean issuance: require a matching AdvanceIssued event.

## Conformance

```bash
corepack pnpm --filter @torna/contracts test
corepack pnpm --filter @torna/contracts typecheck
```

These commands compare types, event ABI entries, identifier hashes and EIP-712
digests. See packages/contracts/DECISIONS.md for implementation decisions and the
remaining repayment/loss/withdrawal work. Real adapter integration is not yet verified.
