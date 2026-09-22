# 민서의 컨트랙트 학습 노트

개발·테스트는 Codex가 진행하고, 기능마다 실제 코드의 핵심만 함께 읽는다.
수요일까지는 별도 강의 진도보다 구현한 기능당 10분 복습을 우선한다.
Git 커밋·브랜치·병합·pull/push는 민서가 직접 한다.

## 1회차 — 선지급: 돈 이동과 장부를 한 거래로 묶기

### 이번에 만든 것

발급사가 서명한 환불 요청을 제출자가 전달하면, 계약이 검사를 통과한 건에만
원금을 지급하고 빌려준 금액을 기록한다. 발급사는 서명만 하고 제출자가 가스를 낸다.

1,000 USDC 예시:

1. 발급사 지갑 → Torna: 이용 수수료 3 USDC. 담보에서 빼지 않는다.
2. Torna → 발급사 지갑: 원금 1,000 USDC 전액.
3. 장부: 미상환 +1,000, 포지션 Advanced, 다음 선지급 nonce +1.
4. 수수료 장부: LP +2.40, 준비금 +0.399, 프로토콜 +0.201.

발급사 지갑의 최종 변화는 +997이지만, 계약은 원금에서 수수료를 공제해
997만 송금하는 방식이 아니다. 먼저 별도 수수료 잔액이 필요하다.
사용자의 카드 잔액 복원은 어댑터/DB 영역이며 이 Solidity 함수가 직접 처리하지 않는다.

### 오늘의 개념 1: nonce — 한 번 쓴 승인은 다시 못 쓰게

`mapping(address => uint256) public advanceNonces;`

`mapping`은 주소별 값을 보관하는 표다. 발급사 A의 현재 값이 0이면 nonce=0으로
서명한 요청만 받는다. 선지급 성공 후 값이 1이 되어 이전 승인을 다시 쓸 수 없다.
실패하거나 업무상 거절되면 값은 바뀌지 않는다.

여기에 refundKey 중복 검사도 필요하다. 같은 환불 건을 nonce만 새로 바꿔 다시
제출하는 것을 막기 때문이다. nonce와 환불 키는 서로 다른 중복을 차단한다.

토큰 사용 승인(Permit), 담보 입금 승인, 선지급 승인은 각자 별도 nonce를 사용한다.
한 작업의 승인을 다른 작업에 재사용하지 않기 위해서다.

### 오늘의 개념 2: revert — 현재 거래 전체를 되돌리기

[Torna.sol](../packages/contracts/src/Torna.sol)의 `_issueAdvance`를 읽는다.

```solidity
if (fee != 0) _receiveAdvanceFee(request.issuer, fee);
// 포지션·nonce·미상환·수수료 장부 기록
_payAdvance(request.issuer, request.amount);
emit AdvanceIssued(request.refundKey, request.issuer, request.amount, request.maturity);
```

수수료를 받은 뒤 원금 송금이 실패하면 어떻게 될까?

`revert`가 발생해 **이 거래 안의** 수수료 이동, 새 Permit, nonce 증가와 장부 기록이
전부 취소된다. 이전에 별도 거래로 끝낸 Permit까지 취소되는 것은 아니다.
취소된 거래라도 제출자가 사용한 가스비는 돌려받지 못할 수 있다.

확인할 테스트:
`testPrincipalFailureOrShortPaymentRollsBackFeePermitNonceAndPosition`.
돈을 못 보내는 테스트 토큰을 사용해, 수수료와 장부도 원래대로인지 검사한다.

### 주의: 정상 거래와 선지급 성공은 다르다

PRD는 일부 거절 사유를 `AdvanceRejected` 이벤트로 남기도록 한다.
이 경우 함수는 false를 반환하고 거래 자체는 정상 처리된다.
어댑터는 receipt 성공만 보고 사용자에게 선지급됐다고 표시하면 안 된다.
우리 Torna 주소에서 나온, 해당 환불 건의 `AdvanceIssued` 이벤트를 확인해야 한다.

### 10분 복습 순서

1. `_advanceRejection`: 서명·중복·한도를 왜 검사하는지 읽기 (3분).
2. `_issueAdvance`: 수수료, 장부, 원금 지급 순서 읽기 (3분).
3. 위 실패 테스트와 정상 지급 테스트를 비교하기 (4분).

저장소 루트에서 테스트 한 개만 실행:

```bash
forge test --root packages/contracts --match-test testPrincipalFailureOrShortPaymentRollsBackFeePermitNonceAndPosition -vv
```

스스로 설명해볼 질문: **“원금 송금이 실패했는데 수수료와 nonce가 남아 있으면 왜 위험할까?”**

답: 발급사는 돈을 받지 못하고 수수료만 잃으며, nonce까지 소비되어 같은 승인으로
재시도할 수도 없어진다. 그래서 돈과 장부의 성공·실패를 한 거래로 묶는다.

현재 상환·출금은 미구현이며 실제 자금을 넣으면 안 된다. 이 회차는 로컬 테스트 토큰 기준이다.
