# `packages/ledger/` — 소유: C(민재)

카드사 원장 역할을 하는 DB. 권장은 Supabase(Postgres)입니다.

## 첫 30분

1. supabase.com 에서 프로젝트 생성 (무료 플랜)
2. 연결 문자열을 `.env` 에 넣는다 (**커밋 금지**)
3. 팀에게 조회 권한 부여 — A(서진)과 B(민서)도 데이터를 볼 수 있어야 합니다

## 테이블

```
cardholders      사용자
transactions     결제 · 취소 이력
refunds          환불 건            ← 핵심
ledger_credits   잔액 반영 기록      ← UNIQUE(refund_key)
issuers          발급사             key · name · region
acquirers        매입사             acquirer_id · display_name
```

`issuers.region` 과 `acquirers.display_name` 은 체인에 올라가지 않습니다. **화면에 띄우려면 라벨 덤프에 들어가야 하므로 DB에 있어야 합니다.**

**`ledger_credits` 에 `UNIQUE(refund_key)` 를 반드시 거세요.**
같은 환불이 두 번 들어와도 한 번만 반영된다는 걸 이 제약으로 증명합니다.
시점 7(체인 성공 · DB 실패)이 보여주려는 성질이 바로 이것입니다.

## 데이터

```
365건   1년치 정상 운영 (364건 종결 + 1건 검토 중)
+       시나리오 2~9b 에서 쓰는 건들
```

## 데모는 DB에 의존하지 않습니다

제출된 데모는 사전 생성된 스냅샷 번들을 읽습니다. DB는 데이터를 **만드는 단계**에서만 씁니다.
그래서 심사 중 Supabase가 멈춰도 데모는 돕니다.

자세한 내용은 `PROJECT_SPEC.md` 13장.
