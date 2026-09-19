# `packages/contracts/` — 소유: B(민서)

Solidity 컨트랙트, Foundry 테스트, 배포·실행·스냅샷 스크립트.

## 첫 30분

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
forge build
```

그다음 바로:

1. 니모닉 1개 생성 → index 0~12에서 주소 13개 파생
2. 주소 목록을 팀에 공유 (**개인키는 절대 공유 금지**)
3. https://faucet.quicknode.com/monad 에서 9개 주소 각각 청구
4. QuickNode Build Plan 신청 → Monad Testnet 엔드포인트 → URL 팀 공유

**faucet은 오늘부터 매일 받으세요.** 12시간 쿨다운이라 하루에 모을 수 있는 양이 정해져 있습니다.

## 폴더

```
src/       컨트랙트
test/      Foundry 테스트
script/    배포 · 시나리오 실행 · 스냅샷 생성
```

## 첫 작업은 구현이 아니라 인터페이스 확정

`docs/interface-draft.md` 를 다듬어 `shared/abi/` 에 올리세요. **기한 9/21.**

## 완료 기준

- `forge test` 전부 통과
- anvil에서 12개 시점을 순서대로 실행해 스냅샷 12개 생성
- `pnpm verify:bundle <생성된 폴더>` 통과

자세한 내용은 `PRD.md` 12장.
