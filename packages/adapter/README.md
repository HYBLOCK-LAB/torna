# `packages/adapter/` — 소유: C(민재)

카드사 데이터를 온체인 형식으로 바꾸고 서명해 제출합니다. 돌아오는 길도 여기서 처리합니다.

## 나가는 길

```
refundId, acquirerId      →  keccak256 해시
금액                       →  소수점 2자리를 6자리로
confirmedAt + 영업일 5일    →  unix 만기
nonce · deadline · chainId 부착
EIP-712 서명
컨트랙트에 제출
```

## 돌아오는 길

```
체인에서 상환 확인  →  creditLedger(refundKey, amount)  →  DB 반영
```

`creditLedger` 는 **멱등**이어야 합니다. 같은 `refundKey` 를 두 번 넣어도 잔액은 한 번만 증가합니다.
`ledger_credits` 테이블의 `UNIQUE(refund_key)` 가 이를 보장합니다.

## 하지 말아야 할 것

**EIP-712 구조체를 직접 작성하지 마세요.** B(민서)가 `shared/abi/eip712.ts` 에 내보낸 타입을 import 합니다.

**금액 변환을 어댑터 밖에서 또 하지 마세요.** 변환은 여기서 한 번만 합니다.

실제 값 예시는 `PRD.md` 10.6절에 한 건이 통째로 적혀 있습니다. 그걸 보고 만드시면 됩니다.
