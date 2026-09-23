# `packages/adapter/` — 소유: C(민재)

카드사 데이터를 온체인 형식으로 바꾸고 서명해 제출합니다. 돌아오는 길(원장 반영)도 여기서 연결합니다.

## 나가는 길

```
refundId, acquirerId      →  keccak256(UTF-8 바이트)            src/hash.ts
금액 "1000.00"              →  1000000000n (6자리, 여기서 한 번만)   src/amount.ts
만기                        →  max(confirmed_at, 체인 시각) + 영업일 5일   src/maturity.ts
nonce · deadline · chainId  →  advanceNonces(issuer), 체인 시각 + 10분   src/request.ts
EIP-712 서명 + 수수료 Permit   →  shared/abi 타입 import                src/sign.ts
제출 → AdvanceIssued 로그 확인                                        src/chain.ts
```

## 돌아오는 길

```
체인에서 선지급 확인(AdvanceIssued 로그)  →  creditLedger(refundKey, amount)  →  DB 반영
```

**2026-09-22 결정:** 잔액 복원은 T+5 상환이 아니라 **선지급 확인 직후**입니다 (PROJECT_SPEC 6장 ⑤).
`creditLedger` 는 `packages/ledger` 에 있고 멱등입니다. 같은 `refundKey` 를 두 번 넣어도 잔액은 한 번만 증가합니다.

## 사용법 (B·민서 실행기에서)

```ts
import { processRefund, repayRefund, refundKeyOf, acquirerHashOf, type Deployment } from '@torna/adapter';
import { connect, getRefund, creditLedger } from '@torna/ledger';

const deployment: Deployment = { chainId, torna, asset };           // 실제 배포 주소, chainId는 RPC에서
const clients = { publicClient, submitter };                         // submitter = index 2 지갑
const row = await getRefund(sql, 'REF-2026-001');

const out = await processRefund({
  clients, deployment, issuer: hybridAccount, row,                   // issuer = index 3..7 계정 (서명만)
  creditLedger: (key, amount, tx) => creditLedger(sql, key, amount, tx),
});
// out.status: 'issued' | 'already-issued' | 'rejected' (reason 1..8)
```

- `advanceRefund` 는 제출 전에 `positionOf(refundKey)` 를 먼저 읽습니다. 이미 선지급된 키면 **다시 보내지 않고** `already-issued` 를 돌려줍니다 (t7 재시도).
- 성공 판정은 receipt 상태가 아니라 **Torna 주소에서 나온 일치하는 `AdvanceIssued` 로그**입니다. `AdvanceRejected` 도 receipt는 성공입니다.
- 상환은 `repayRefund` — 발급사가 `RepaymentRequest` 와 원금 Permit에 서명하고 제출자가 보냅니다.
- 라벨 덤프는 `import { keccak256 } from '@torna/adapter/hash'` 로 같은 해시 함수를 씁니다.

## 검증

```bash
pnpm --filter @torna/adapter test        # shared/abi/fixtures 의 digest 와 일치 (서명 규격 검증)
pnpm --filter @torna/adapter typecheck
```

로컬 anvil 미니 통합은 `packages/ledger/scripts/mini-integration.ts` 에 있습니다.

## 가정 (확인 대기)

- **만기:** 시드 1년치는 확정일이 2025년이라 "확정일 + 영업일 5일"이 과거가 되고, 과거 만기는 컨트랙트에서 revert됩니다. 그래서 `max(확정일, 체인 시각)` 기준으로 영업일 5일을 셉니다. 민서님 답에 따라 `src/maturity.ts` 한 곳만 바꾸면 됩니다.
- 거절 코드 4(ChainMismatch)는 컨트랙트가 내지 않습니다. 다른 체인용 서명은 3(InvalidSignature)으로 나옵니다.

## 하지 말아야 할 것

**EIP-712 구조체를 직접 작성하지 마세요.** `shared/abi/` 의 타입을 import 합니다.

**금액 변환을 어댑터 밖에서 또 하지 마세요.** 변환은 `src/amount.ts` 에서 한 번만 합니다.

**해시 함수를 다시 짜지 마세요.** `src/hash.ts` 를 import 합니다.
