# 컨트랙트 인터페이스 초안

**이건 초안입니다. 확정 권한은 B(민서)에게 있습니다.**

백지에서 시작하면 느리니까, 설계에서 필요한 것들을 미리 적어두었습니다. 보시고 다듬어서 `shared/abi/`에 확정본을 올려주세요. **기한은 9/21입니다.** 이게 안 나오면 C(민재)가 어댑터 서명부를 못 만듭니다.

완벽하지 않아도 됩니다. 이름과 필드가 정해지는 게 중요합니다.

---

## 1. 식별자

```solidity
// 환불 건의 온체인 식별자
bytes32 refundKey   = keccak256(abi.encodePacked(refundId));     // "REF-2026-001"
bytes32 acquirerHash = keccak256(abi.encodePacked(acquirerId));  // "ACQ-α"
```

**결정할 것**

- `abi.encodePacked` vs `abi.encode` — 어느 쪽인지 확정해서 C(민재)에게 알려주세요. 다르면 해시가 달라집니다
- `refundId` 문자열 포맷 — 현재 `REF-YYYY-NNN` 을 전제로 데이터를 만들고 있습니다

---

## 2. EIP-712 타입 정의

**이 구조체가 C(민재)의 서명과 글자 단위로 일치해야 합니다.**

```solidity
bytes32 constant ADVANCE_REQUEST_TYPEHASH = keccak256(
  "AdvanceRequest(bytes32 refundKey,address issuer,bytes32 acquirerHash,uint256 amount,uint64 maturity,uint256 nonce,uint256 deadline)"
);

struct AdvanceRequest {
    bytes32 refundKey;
    address issuer;
    bytes32 acquirerHash;
    uint256 amount;      // 6 decimals
    uint64  maturity;    // unix seconds
    uint256 nonce;       // per issuer, increasing
    uint256 deadline;    // unix seconds
}
```

도메인:

```solidity
EIP712("Torna", "1")   // chainId, verifyingContract 는 자동
```

**확정 후 `shared/abi/eip712.ts` 로 내보내 주세요.** C(민재)가 손으로 다시 적지 않고 import 할 수 있어야 합니다.

---

## 3. 함수

### 등록

```solidity
function registerIssuer(address issuer, bytes32 acquirerHash, string calldata name) external;
function depositCollateral(address issuer, uint256 amount) external;
function withdrawCollateral(uint256 amount) external;
function deregisterIssuer(address issuer) external;
```

### 선지급과 상환

```solidity
function advance(AdvanceRequest calldata req, bytes calldata signature) external;
function repay(bytes32 refundKey, uint256 amount) external;
```

`advance` 가 검사해야 하는 것:

1. 서명이 등록된 발급사의 것인가
2. `refundKey` 가 이미 쓰였는가 (중복 차단)
3. `deadline` 이 지나지 않았는가
4. `chainId` · `verifyingContract` 가 맞는가
5. 발급사 유효 한도 안인가
6. **매입사 노출 한도 안인가** — 풀 가능액 × 50%, 신규 선지급에만 적용

### 판정

```solidity
function openReview(bytes32 refundKey, string calldata evidence) external;   // 검증자
function finalizeCoveredLoss(bytes32 refundKey) external;                    // 검증자
function recordRecovery(bytes32 refundKey, uint256 recovered) external;      // 검증자
```

### 유동성

```solidity
function depositLiquidity(uint256 amount) external;
function requestWithdraw(uint256 amount) external;
function deployIdle(uint256 amount) external;
function recallIdle(uint256 amount) external;
```

### 조회

**컨트랙트를 조회용으로 오염시키지 마세요.** 이력은 이벤트로만 남기고, 집계와 필터는 오프체인에서 합니다. 필요한 최소한만 둡니다.

```solidity
function positionOf(bytes32 refundKey) external view returns (Position memory);
function issuerOf(address issuer) external view returns (Issuer memory);
function poolState() external view returns (Pool memory);
```

---

## 4. 이벤트

**스냅샷과 프론트가 이 이름을 그대로 씁니다.**

```solidity
event IssuerRegistered(address indexed issuer, bytes32 acquirerHash, string name);
event CollateralDeposited(address indexed issuer, uint256 amount);
event IssuerMarginCall(address indexed issuer);
event IssuerSuspended(address indexed issuer);

event AdvanceIssued(bytes32 indexed refundKey, address indexed issuer, uint256 amount, uint64 maturity);
event AdvanceRejected(bytes32 indexed refundKey, uint8 reason);
event AdvanceRepaid(bytes32 indexed refundKey, uint256 amount);

event MarkedOverdue(bytes32 indexed refundKey);
event ReviewOpened(bytes32 indexed refundKey, string evidence);
event CoveredLossFinalized(bytes32 indexed refundKey, uint256 coverage);
event LossCapTriggered(bytes32 indexed acquirerHash, uint256 cap);
event RecoveryRecorded(bytes32 indexed refundKey, uint256 recovered);

event LiquidityDeposited(address indexed lp, uint256 amount);
event DepositRejected(address indexed lp, uint256 amount, uint8 reason);
event WithdrawRequested(address indexed lp, uint256 amount);
event WithdrawPaid(address indexed lp, uint256 amount);
event WithdrawCompleted(address indexed lp, uint256 amount);

event IdleDeployed(uint256 amount);
event IdleWithdrawFailed(uint256 amount);
event LedgerCreditConfirmed(bytes32 indexed refundKey);
```

---

## 5. 거절 사유 코드

`AdvanceRejected` 와 `DepositRejected` 의 `reason` 입니다. **프론트가 이 숫자를 문구로 바꿔 표시합니다.**

```
선지급 거절
1  DuplicateRefundKey       이미 사용된 환불 키
2  UnregisteredIssuer       등록되지 않은 발급사
3  InvalidSignature         서명 검증 실패
4  ChainMismatch            chainId 또는 verifyingContract 불일치
5  DeadlineExpired          제출 기한 경과
6  IssuerLimitExceeded      발급사 유효 한도 초과
7  AcquirerExposureExceeded 매입사 노출 한도 초과
8  IssuerSuspended          담보 소진으로 중단된 발급사

예치 거절
1  DepositCapExceeded       풀 예치 한도 초과
2  ConcentrationExceeded    단일 LP 집중 한도 25% 초과
```

---

## 6. 상태 전이

```
Registered → Advanced → Repaid
                ↓
             Overdue → Review → CoveredLoss
                             → CapHeld → RecoveryRecorded
```

발급사: `Active` → `MarginCall` → `Suspended` → `Deregistered`

**담보가 0이 되면 `Suspended` 입니다.** 「필요 마진 0 ≤ 담보 0」이라고 `Active` 로 두면 안 됩니다.

---

## 7. 파라미터

컨트랙트에 상수로 고정합니다. 값의 근거는 `PRD.md` 7장과 Notion 6번에 있습니다.

```solidity
uint256 constant MARGIN_RATE   = 1500;  // 15%   담보율
uint256 constant LOSS_SHARE    = 2000;  // 20%   발급사 손실 부담률
uint256 constant FEE_RATE      = 30;    // 0.3%  건당 수수료
uint256 constant EVENT_CAP     = 2000;  // 20%   단일 사건 손실 상한 (LP 예치금 대비)
uint256 constant DEPLOY_CAP    = 5000;  // 50%   유휴자금 운용 상한
uint256 constant ISSUER_CONC   = 4000;  // 40%   발급사 집중 한도
uint256 constant ACQ_EXPOSURE  = 5000;  // 50%   매입사 노출 한도
uint256 constant TARGET_UTIL   = 3000;  // 30%   목표 가동률
uint256 constant LP_CONC       = 2500;  // 25%   단일 LP 집중 한도
uint256 constant RAMP_RATE     = 5000;  // 50%   신규 발급사 램프업
uint256 constant BPS           = 10000;
```

---

## 8. 쓰지 말아야 할 것

**서명 검증을 직접 구현하지 마세요.** OpenZeppelin의 `ECDSA` 와 `EIP712` 를 씁니다. 손으로 짜면 거의 확실히 틀리고, 틀렸다는 걸 알아채기도 어렵습니다.

```solidity
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
```
