# `shared/labels/` — 소유: C(민재)

체인에는 `refundId` 와 `acquirerId` 가 **keccak256 해시로만** 올라갑니다. 해시는 단방향이라 되돌릴 수 없고, 원본을 아는 곳은 카드사 DB뿐입니다.

**그래서 스냅샷 번들에도 해시만 들어 있습니다.** 발급사 콘솔과 검증자 화면에 사람이 읽는 값을 띄우려면 이 매핑이 반드시 있어야 합니다. 없으면 포지션 표에 `0x9f41…0e1f` 만 뜹니다.

> 공개 뷰는 반대입니다. 어느 발급사가 물렸는지 공개하지 않는 설계라 **일부러 해시를 그대로 보여줍니다.**

---

## 규칙

- 시점마다 뜨는 것이 아니라 **한 회차 실행에 한 번** 만드는 정적 파일입니다
- 번들에 나오는 **모든** `refundKey` · `acquirerHash` · 발급사 키가 여기 있어야 합니다. `pnpm verify:bundle` 이 강제합니다
- 해시 함수는 어댑터가 쓰는 것과 **같은 모듈을 import** 해야 합니다. 다르면 짝이 전부 어긋납니다

```
runId  =  스냅샷 폴더 이름  =  라벨 파일 이름
```

셋이 같아야 합니다. 검증 스크립트가 확인합니다.

---

## 형식

```json
{
  "runId": "run-20260925",
  "refunds": {
    "0x9f41089dda…": { "refundId": "REF-2026-001", "amountUsdc": 1000 }
  },
  "acquirers": {
    "0xea2b5fc87a…": { "acquirerId": "ACQ-a", "displayName": "Acquirer a (Alpha)" }
  },
  "issuers": {
    "HYBRID": { "name": "HYBRID Travel Card", "region": "North America / Europe" }
  }
}
```

`refunds` 와 `acquirers` 의 키는 **해시**, `issuers` 의 키는 **발급사 키**입니다. 발급사 이름은 `registerIssuer()` 로 체인에 올라가지만 지역은 올라가지 않아서 여기 둡니다.

타입은 `shared/types/snapshot.ts` 의 `LabelMap` 입니다.

---

## 만드는 법

실행이 끝난 뒤 DB에서 SELECT 한 번, 파일 쓰기 한 번입니다.

```ts
// packages/ledger/scripts/dump-labels.ts
import { keccak256 } from '@torna/adapter/hash';   // 어댑터와 같은 함수

const runId = process.env.RUN_ID!;
const out = { runId, refunds: {}, acquirers: {}, issuers: {} };

const { data: refunds } = await supabase
  .from('refunds')
  .select('refund_id, amount, confirmed_at');

for (const r of refunds) {
  out.refunds[keccak256(r.refund_id)] = {
    refundId: r.refund_id,
    amountUsdc: Number(r.amount),
    confirmedAt: r.confirmed_at,
  };
}

const { data: acquirers } = await supabase.from('acquirers').select('acquirer_id, display_name');
for (const a of acquirers) {
  out.acquirers[keccak256(a.acquirer_id)] = {
    acquirerId: a.acquirer_id,
    displayName: a.display_name,
  };
}

const { data: issuers } = await supabase.from('issuers').select('key, name, region');
for (const i of issuers) out.issuers[i.key] = { name: i.name, region: i.region };

fs.writeFileSync(`shared/labels/${runId}.json`, JSON.stringify(out, null, 2));
```

그다음 확인합니다.

```bash
pnpm verify:bundle shared/snapshots/run-20260925
```

번들의 해시 중 하나라도 여기 없으면 실패하고, 어느 해시가 빠졌는지 알려줍니다.

---

## 자주 나오는 실수

| 증상 | 원인 |
|---|---|
| 라벨에 없는 refundKey 가 있다 | DB에서 일부만 SELECT 했거나, 실행 중에 생긴 건을 빠뜨렸습니다 |
| 전부 다 없다고 나온다 | 해시 함수가 어댑터와 다릅니다. `abi.encodePacked` / `abi.encode` 차이도 포함 |
| 라벨의 runId 가 다르다 | `RUN_ID` 환경 변수를 실행 때와 다르게 넣었습니다 |
