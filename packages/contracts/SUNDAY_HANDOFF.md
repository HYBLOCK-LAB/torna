# 일요일 작업 마감 · 민서(B)

대상: 2026-09-20(일) 예정 작업. 실제 최종 점검: 9/21(월) KST.

**로컬 개발 산출물은 준비 완료. 팀 공유·검토·Git 반영은 별도 미완료다.**
사용자가 Git을 직접 관리하므로 커밋·브랜치 변경·push·PR·merge는 수행하지 않았다.
팀에게 메시지를 보내거나 합의된 것으로 처리하지 않았다.

## 일요일 완료 기준 대조

| 예정 항목 | 결과와 확인 근거 |
|---|---|
| 식별자 규칙 | 원문 UTF-8 keccak256. shared/abi/README.md와 공개 advance-request.json 벡터, Solidity/TS 교차 테스트 |
| EIP-712 타입 | eip712.ts의 필드·순서·타입·domain, Torna.sol 및 shared.test.ts/SharedVector.t.sol 일치 |
| 금액·시간 단위 | 금액 6자리 bigint, 시간 Unix 초. 1,000 USDC=1,000,000,000 최소단위. DB 입력 변환과 영업일 계산은 어댑터 책임 |
| 상태·이벤트·거절 코드 | states.ts/reasons.ts/events.ts, 컴파일 ABI 대조 테스트. enum 0과 미존재를 구분 |
| Foundry 골격 | Solidity 0.8.24, 고정 OZ/forge-std 의존성, MockUSDC, 역할, Torna, 가짜 로컬 계정 fixture |
| 계산 테스트 | Limits의 한도·경계, Waterfall의 신규 손실 흡수·사건 상한 순수 계산 및 퍼즈 테스트 |
| 서명 테스트 | Solidity/viem 해시 동일성, chain/domain·변조·nonce·만료 검증 |
| 남은 쟁점 기록 | DECISIONS.md D01~D10 및 아래 후속 결정 표 |

일요일 기준을 넘어 구현된 항목: 초기 LP 자금 10,000 구성, 등록·30일 램프업,
Permit 기반 담보 입금, 실제 선지급과 별도 수수료 회계, 컴파일된 전체 ABI.
상환·출금·손실/회수 실행·준비금 500 시드·실제 12시점 실행은 완료되지 않았다.

## 재검증

저장소 루트에서 실행한다. 의존성이 설치된 현재 작업공간 기준이다.

```bash
corepack pnpm --filter @torna/contracts check
corepack pnpm verify:bundle shared/snapshots/sample
```

`check`는 포맷 → 빌드 → 생성 ABI 일치 → 타입 → Solidity → TypeScript 순서로
검사하며 실패하면 중단한다. ABI를 자동으로 덮어쓰지 않는다. Solidity 인터페이스를
변경했다면 `corepack pnpm --filter @torna/contracts export:abi`로 먼저 갱신한다.

현재 컴파일러 오류는 없으며 Foundry의 비차단 스타일/테스트 코드 lint 경고는 남아 있다.
macOS 샌드박스의 Foundry 시작 충돌 시 일반 실행 권한에서 같은 로컬 검증을 실행했다.
기존 sample 번들 검증은 형식 점검일 뿐, 새 계약의 12시점 실행 증거가 아니다.

최종 결과: 통합 `check` 통과 — Solidity 142개, TypeScript 24개, 포맷·빌드·ABI·타입
검사 통과. `git diff --check`도 통과했다. 기존 sample 12시점 및 라벨 검증도 통과했다.
샌드박스에서 tsx CLI의 IPC 생성이 차단되어 sample 검증은 동일 스크립트를
`node --import tsx scripts/verify-bundle.ts shared/snapshots/sample`로 실행했다.

## 민재가 사용할 인터페이스

`shared/abi/`에서 아래를 import한다. 기존 문서의 미구현 함수 초안을 호출하지 않는다.

- `eip712.ts`: AdvanceRequest와 Torna domain.
- `permit.ts`: MockUSDC Permit. spender는 제출자가 아닌 Torna.
- `collateral.ts`: 담보 작업 서명과 입금 API.
- `advance.ts`: 선지급 API·수수료 견적·nonce·상태 조회.
- `Torna.json`: 실제 컴파일 ABI와 custom errors. 선언된 이벤트만으로 기능 구현 여부를 판단하지 않는다.
- `events.ts`, `states.ts`, `reasons.ts`: 이벤트·상태·거절 코드.

세 nonce를 혼용하지 않는다: 토큰 Permit, 담보 입금, 선지급.
선지급은 `AdvanceIssued` 로그의 계약 주소와 요청 필드를 확인해야 한다.
`AdvanceRejected`는 receipt가 성공이어도 업무상 거절이다. domain 불일치는
서명만으로 구별할 수 없어 InvalidSignature(3)로 처리한다. ChainMismatch(4)는 예약값이다.

수수료: 발급사가 선지급 시 별도 잔액에서 0.3%를 낸다. 민서의 PRD 기준 선택으로
1,000당 LP 2.40 / 준비금 0.399 / 프로토콜 0.201이다. 원금은 전액 지급하며
상환 때 수수료를 다시 받지 않는다. 기존 샘플의 0.40/0.20을 정확한 원장 값으로 쓰지 않는다.

## 월요일 첫 작업과 남은 결정

다음 구현은 **원금 상환**이다. 이미 정해진 규칙은 원금만 상환·미상환 감소이며,
부분 상환 정책과 서명 기반 자금 회수 API는 구현 전에 명시한다.
아래 담당은 민서의 확인 창구 제안이지 외부 업무 배정이나 팀 합의가 아니다.

| 쟁점 | 확인 창구 제안 | 확인 기한/이유 |
|---|---|---|
| 부분 상환·담보 회수·탈퇴 D05 | 민서 + PRD 작성자 | 9/21, 해당 자금 이동 구현 전 |
| 중단/탈퇴 발급사 수 D02 | 민서 + PRD 작성자 | 행정 상태 변경 구현 전. 현재 전체 등록 수를 유지 |
| 사건 묶음·손실 cap 시점·기차감 담보 D06/D07 | 민서 + PRD 작성자 | 9/21~22, 손실/회수 구현 전 |
| LP 출금 시점·수익/손실 분배 D08 | 민서 + 서진/PRD 작성자 | 9/22 출금과 스냅샷 연결 전 |
| 사용자 원장 반영 이벤트 D09 | 민서 + 민재/PRD 작성자 | 9/22 미니 통합 전 |
| 실제 테스트넷 시간 모델 D10 | 민서 + 민재 | 로컬 실행기를 테스트넷으로 옮기기 전 |

먼저 알려진 제약: 등록 수는 담보 0인 회사도 포함한다. 손실/외부 운용/출금을
추가할 때 poolCapacity·poolCash·상태 계산도 확장해야 한다. 현재 집계 LP 수수료는
LP별 출금 가능 수익 정산까지 구현된 것이 아니다. 실제 자금은 넣지 않는다.

## 민서가 직접 보낼 수 있는 인계 초안 (미전송)

> 일요일 인터페이스·Foundry 기반 작업을 로컬에서 정리했습니다. shared/abi의
> 타입과 ABI를 import해 주세요. 금액은 6자리 bigint, 시간은 Unix 초,
> 식별자는 원문 UTF-8 keccak256입니다. 담보 입금·선지급은 구현했고 상환은 다음
> 작업입니다. 선지급 receipt 성공만 보지 말고 AdvanceIssued/AdvanceRejected를
> 구분해 주세요. 현재 코드의 Git 공유 후 9/21 저녁까지 타입·호출 방식의 이견을
> 알려주시면 반영하겠습니다. 실제 어댑터 연결은 9/22 미니 통합에서 확인합니다.

위 검토 기한은 전송용 제안이다. 실제 전송 전에는 검토 기간이 시작됐거나
“이견이 없으므로 확정”됐다고 볼 수 없다.

## 내일 읽을 것

1. 이 문서의 월요일 첫 작업/결정 표.
2. [학습 노트](../../docs/CONTRACT_LEARNING.md)의 nonce와 revert 설명 (10분).
3. [상세 인터페이스](../../shared/abi/README.md), [결정 기록](DECISIONS.md).

이후 Git 검토·커밋·공유는 민서가 직접 진행한다. 계약 테스트 통과는 보안 감사나
실제 어댑터 통합, 테스트넷 배포, 수요일 전체 인수 완료를 의미하지 않는다.
