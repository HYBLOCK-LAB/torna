# `packages/adapter/` — 소유: C(민재)

카드사 데이터를 온체인 형식으로 바꾸고 서명해 제출합니다. 돌아오는 길(원장 반영)도 여기서 연결합니다.

## 나가는 길

```
refundId, acquirerId      →  keccak256(UTF-8 바이트)            src/hash.ts
금액 "1000.00"              →  1000000000n (6자리, 여기서 한 번만)   src/amount.ts
만기                        →  체인 시각 + 영업일 5일 (시나리오 건은 override)  src/maturity.ts
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

## t7 원장 재시도 잡 (2026-09-24 확정)

`LedgerCreditConfirmed`는 **재시도 잡에서만** 남깁니다. 정상 선지급 경로(`processRefund`)는 절대 부르지 않습니다.

```ts
import { processRefund, runLedgerRetryJob } from '@torna/adapter';
import { connect, creditLedger, ledgerRetryStore } from '@torna/ledger';

const store = ledgerRetryStore(sql);

// 정상 경로: 원장 반영이 실패하면 예외 대신 대기열에 넣고 retryQueued=true
await processRefund({
  clients, deployment, issuer, row, retryStore: store,
  creditLedger: (key, amount, tx) => creditLedger(sql, key, amount, tx),
});

// 재시도 잡: 대기 건만 처리
const outcomes = await runLedgerRetryJob({ clients, deployment, store });
// [{ refundKey, status: 'confirmed', credited, txHash, blockNumber }] 등
```

`confirmLedgerCredit(refundKey)`는 아래 네 조건이 전부 참일 때 한 번만 나갑니다.

1. 체인에 포지션이 있고, 기록된 선지급 트랜잭션에 **일치하는 `AdvanceIssued` 로그**가 있다
2. 그 환불이 원장 반영 실패로 **재시도 대기열**(`ledger_credit_retries`)에 있다
3. 재반영 후 `ledger_credits`에 그 키의 행이 **정확히 1건**이다
4. 아직 확인되지 않았다 — DB 대기 건이 열려 있고, 호출 전 시뮬레이션에서 컨트랙트가 거부하지 않는다

한 조건이라도 어긋나면 그 건은 `skipped`로 남고 다음 실행 때 다시 봅니다. 잡을 여러 번 돌려도 확인 기록은 하나만 남습니다.

시나리오 실행에서 원장 장애를 재현할 때는 해당 건의 `creditLedger`만 실패하게 넘기면 됩니다.

```ts
await processRefund({ ..., retryStore: store,
  creditLedger: async () => { throw new Error('simulated ledger outage'); } });
```

`confirmLedgerCredit`의 함수 정의는 `shared/abi`에 올라오기 전까지 `src/ledgerAck.ts`에 한 줄로 두었고, `Torna.json`에 함수가 생기면 `test/conformance.test.ts`가 자동으로 형식을 대조합니다.

## 검증

```bash
pnpm --filter @torna/adapter test        # shared/abi/fixtures 의 digest 와 일치 (서명 규격 검증)
pnpm --filter @torna/adapter typecheck
```

로컬 anvil 스모크 테스트: `pnpm --filter @torna/adapter smoke` (상단 주석의 환경 변수 필요, DB 없이 메모리 원장 사용)

## 만기 규칙 (2026-09-23 확정)

만기는 **체인 시각 + 영업일 5일**입니다. 확정일(`confirmed_at`)은 원장 기록으로만 쓰고 만기 계산에 넣지 않습니다. 1년치 시드를 지금 시점으로 다시 돌리는 구조라 확정일 기준 만기는 항상 과거가 되고, 과거 만기는 컨트랙트에서 revert되기 때문입니다.

실행 중에 만기가 지나야 하는 6건(`REF-2026-021`, `031`~`034`, `014`)은 `refunds.maturity_override_seconds` 에 **120**이 들어 있고, 어댑터는 그 건만 **체인 시각 + 120초**로 서명합니다. 실행 스크립트가 t1 · t3 · t5 직전에 2분씩 기다리면 관리자가 상태를 강제로 넘기지 않고도 연체 → 검토 경로가 성립합니다.

## 가정 (확인 대기)

- 거절 코드 4(ChainMismatch)는 컨트랙트가 내지 않습니다. 다른 체인용 서명은 3(InvalidSignature)으로 나옵니다.

## 하지 말아야 할 것

**EIP-712 구조체를 직접 작성하지 마세요.** `shared/abi/` 의 타입을 import 합니다.

**금액 변환을 어댑터 밖에서 또 하지 마세요.** 변환은 `src/amount.ts` 에서 한 번만 합니다.

**해시 함수를 다시 짜지 마세요.** `src/hash.ts` 를 import 합니다.
