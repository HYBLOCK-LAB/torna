/**
 * Torna — per-timepoint narrative.
 *
 * The prose is the mockup's, unchanged. What changed is that every figure
 * inside a sentence is now a placeholder resolved against the snapshot, so a
 * sentence can never disagree with the number on the screen beside it.
 *
 * ── Placeholder syntax ────────────────────────────────────────────────────
 *   {pool.reserve}              value at this timepoint
 *   {pool.reserve:delta}        "500 → 646", computed against the PREVIOUS
 *                               timepoint in TIMEPOINT_ORDER. Never write the
 *                               arrow by hand.
 *   {metrics.lossRatePct:pct}   percentage, 2 decimals
 *   {issuer.AURA.collateralRemaining}
 *   {count.CapHeld}             positions in that state
 *   {param.singleEventCapPct}   frozen protocol parameter (see params.ts)
 *
 * ── Translation ───────────────────────────────────────────────────────────
 * `en` is empty and is being written separately. The renderer falls back to
 * `ko` while it is empty, so nothing is blank on screen — but the product
 * language is English and `en` must be filled before submission.
 * Keep the placeholders identical between ko and en. They are code, not words.
 *
 * Owner: A(서진)
 */

import type { TimepointId } from './types/snapshot';
import type { Bilingual } from './types/snapshot';

export type ScreenKey = 'user' | 'issuer' | 'lp' | 'val' | 'pub';

export interface WatchLine {
  /** Which screen this line is about. */
  screen: ScreenKey;
  text: Bilingual;
  /**
   * DOM id of the panel this line is about. "Check it" scrolls there and
   * flashes it — on a screen six panels tall, dropping the viewer at the top
   * means they have to hunt for the figure the briefing just promised.
   */
  anchor?: string;
  /**
   * True when the correct outcome is that NOTHING moved (the ledger-failure and
   * fraud-rejection timepoints). Rendered as its own "no change" block, so a
   * still screen reads as a result rather than as a broken one.
   */
  still?: boolean;
}

export interface TimepointNarrative {
  title: Bilingual;
  /** Screens that changed here — drives the unread dot on each tab. */
  dirty?: ScreenKey[];
  /** Seeing this timepoint first makes the current one make sense. */
  nudge?: { need: TimepointId; text: Bilingual };
  /**
   * A second stage of the SAME incident, not a sibling scenario. It is reached
   * only from this briefing, so the causal link survives: a recovery that
   * closes t3 makes no sense opened on its own, and listing it beside t3 in the
   * navigator invites exactly that.
   */
  follow?: { next: TimepointId; text: Bilingual; btn: Bilingual };
  /**
   * The issuer this timepoint is about. The console opens on it, because a
   * watch line that says "AURA's collateral drops" is useless on a screen
   * still showing HYBRID.
   */
  issuer?: string;
  /** "Up to here" — what the viewer has already seen. */
  soFar: Bilingual | null;
  situation: Bilingual | null;
  why: Bilingual | null;
  designPoint: Bilingual | null;
  watch: WatchLine[];
}

/**
 * Fields whose change is worth a chip on the result row, per screen.
 * The renderer emits a chip ONLY when the value actually moved, so a quiet
 * timepoint shows a quiet row instead of a wall of unchanged numbers.
 */
export const CHIP_FIELDS: Record<ScreenKey, string[]> = {
  user:   ['metrics.cumulativeCount'],
  issuer: ['pool.advancedOutstanding'],
  lp:     ['pool.netAssetValue', 'pool.reserve', 'pool.lpLossApplied', 'pool.cashAvailable'],
  val:    ['metrics.lossTotal', 'pool.capHeld'],
  pub:    ['metrics.cumulativeCount', 'metrics.lossRatePct', 'metrics.rejectedRequests'],
};

export const NARRATIVE: Record<TimepointId, TimepointNarrative> = {
  t0: {
    title:       {
      ko: '사용자 환불 체험',
      en: 'Cardholder refund experience',
    },
    soFar:       {
      ko: '데모의 시작점입니다. 아직 아무 사건도 일어나지 않았고, 카드 소지자가 환불을 한 번 겪습니다.',
      en: 'The demo starts here. Nothing has happened yet — a cardholder simply lives through one refund.',
    },
    situation:   {
      ko: '호텔 예약을 취소하면 환불 USD 1,000은 확정되지만, 기존 카드에서는 영업일 3~5일 동안 쓸 수 없습니다. 같은 상황을 「즉시 환불 적용」으로 한 번 더 재생하면 취소하는 순간 잔액이 복원됩니다.',
      en: 'Cancelling the hotel booking confirms a refund of USD 1,000, but on an ordinary card that money is unusable for 3-5 business days. Replay the same situation with instant refund switched on and the balance is restored the moment the booking is cancelled.',
    },
    why:         {
      ko: '이 제품이 해결하는 문제가 여기서 한 번에 보입니다. 사용자는 지갑도 USDC도 보지 않고, 쓰던 카드 그대로입니다.',
      en: 'The problem this product solves is visible in a single screen. The cardholder never sees a wallet or USDC, and keeps the card they already had.',
    },
    designPoint: {
      ko: '사용자가 누른 것은 「예약 취소」와 「결제」뿐입니다. 환불금을 따로 요청하는 화면은 없습니다.',
      en: 'The only buttons pressed were Cancel booking and Pay. There is no screen for claiming the refund.',
    },
    watch: [
      { screen: 'user', text: {
          ko: '잔액이 복원되기까지 걸린 시간이 화면에 표시됩니다. 기다린 날짜는 0일입니다.',
          en: 'The time it took to restore the balance is shown on screen. Days waited: zero.',
        } },
      { screen: 'pub', text: {
          ko: '이 체험 1건이 그대로 온체인에 올라가 누적 건수 {metrics.cumulativeCount}건으로 잡힙니다.',
          en: 'This single run goes on chain like any other, and counts toward the {metrics.cumulativeCount} refunds to date.',
        } },
    ],
  },
  t1: {
    dirty: ['lp', 'pub', 'val', 'issuer'],
    title:       {
      ko: '1년 정상 운영',
      en: 'One year of normal operation',
    },
    soFar:       {
      ko: '데모의 출발점입니다. 1년차 운영이 끝난 시점이며, 마지막 1건만 아직 판정 전입니다.',
      en: 'The demo\'s starting position. Year one has closed; only the final refund is still awaiting a ruling.',
    },
    situation:   {
      ko: '데모 시작 전 1년치 운영 결과를 불러옵니다. 가동률 50%, 평균 5일 회전으로 365건을 처리했고, 이 중 364건이 정상 종결되었습니다. 마지막 1건은 만기가 지나 검토 중입니다.',
      en: 'A year of operation is loaded before the demo begins. At 50% utilisation on a 5-day cycle it handled 365 refunds, 364 of which closed normally. The last one is past due and under review.',
    },
    why:         {
      ko: '손실만 제시하면 LP의 참여 유인이 드러나지 않습니다. 수수료 적립 속도를 먼저 확인해야 이후 손실의 상대적 크기를 판단할 수 있습니다.',
      en: 'Showing only losses hides why an LP would take part at all. You have to see how fast fees accrue before you can judge how large the later losses really are.',
    },
    designPoint: {
      ko: '이 요약만 가정값이고 나머지 시나리오는 전부 실제 상태 변화입니다.',
      en: 'This summary is the only assumed figure. Every other timepoint is a real state change.',
    },
    watch: [
      { screen: 'lp', text: {
          ko: '누적 수수료가 설계된 비율대로 나뉩니다 — LP 80%, 준비금 13.3%, 프로토콜 6.7%. 준비금은 {pool.reserve}까지 쌓였습니다.',
          en: 'Accrued fees split at the designed ratio — 80% to LPs, 13.3% to the reserve, 6.7% to the protocol. The reserve has built up to {pool.reserve}.',
        }, anchor: 'p-lp-year'},
      { screen: 'lp', text: {
          ko: '평가액 {pool.netAssetValue}가 예치금 {pool.lpDeposits}를 넘어섭니다. 이후 손실은 이 수익에서 먼저 깎입니다.',
          en: 'Net asset value {pool.netAssetValue} now exceeds deposits of {pool.lpDeposits}. Losses from here are taken out of that income first.',
        }, anchor: 'p-lp-rows'},
      { screen: 'lp', text: {
          ko: '준비금 {pool.reserve:delta}. 출범 시드 위에 수수료가 쌓입니다.',
          en: 'Reserve {pool.reserve:delta}. Fees accumulate on top of the launch seed.',
        }, anchor: 'p-lp-funds'},
      { screen: 'val', text: {
          ko: '365건 중 마지막 1건이 판정 대기로 남아 있습니다. 이 건이 2번에서 확정됩니다.',
          en: 'One of the 365 refunds is still waiting for a ruling. It is settled at timepoint 2.',
        }, anchor: 'p-val-rows'},
      { screen: 'lp', text: {
          ko: '심사 중인 1건의 잠재 부담분만 출금에서 묶입니다. 판정이 나면 해제되거나 손실로 확정됩니다.',
          en: 'Only the potential exposure of that one refund under review is locked against withdrawal. A ruling either releases it or confirms it as a loss.',
        }, anchor: 'p-lp-wd'},
    ],
  },
  t2: {
    nudge: { need: 't1', text: {
      ko: '1번을 먼저 보면 이 건이 1년치 365건의 마지막 1건이라는 게 보입니다.',
      en: 'Seeing t1 first shows that this is the last of the year\'s 365 refunds.',
    } },
    dirty: ['val', 'lp', 'pub'],
    title:       {
      ko: '최종 손실 → 워터폴',
      en: 'Confirmed loss → waterfall',
    },
    soFar:       {
      ko: '1년 운영으로 수수료가 쌓인 상태에서, 판정이 남아 있던 그 1건이 손실로 확정됩니다.',
      en: 'A year of fees has accrued. Now the refund that was still awaiting a ruling is confirmed as a loss.',
    },
    situation:   {
      ko: '1년치 365건 중 마지막 1건입니다. 선지급 1,000의 만기가 지났는데 정산금이 오지 않았고, 검증자가 미수취 확인서를 보고 보장 손실로 승인했습니다.',
      en: 'The last of the year\'s 365 refunds. A 1,000 advance passed its due date with no settlement received, and the verifier approved it as a covered loss against a non-receipt certificate.',
    },
    why:         {
      ko: '풀이 선지급한 원금이 회수되지 않는 가장 직접적인 손실입니다. 부담 순서가 사전에 정해져 있지 않으면 사고 이후 부담 주체를 두고 분쟁이 발생합니다.',
      en: 'This is the most direct loss there is: principal the pool advanced and did not get back. Without an absorption order fixed in advance, an incident turns into an argument over who pays.',
    },
    designPoint: {
      ko: '발급사가 {param.issuerLossSharePct}%를 우선 부담하므로 부실한 건을 그대로 제출할 유인이 없습니다.',
      en: 'The issuer takes the first {param.issuerLossSharePct}%, so there is no incentive to submit a weak refund and hope.',
    },
    watch: [
      { screen: 'val', text: {
          ko: '판정이 「검토 중」에서 「보장 손실」로 바뀝니다. 시간이 지난 것만으로는 손실이 되지 않습니다.',
          en: 'The ruling moves from under review to covered loss. Time passing is not, by itself, a loss.',
        }, anchor: 'p-val-rows'},
      { screen: 'lp', text: {
          ko: '발급사 마진 → 준비금 → LP 순서로 빠집니다. 막대 길이가 각 층이 실제로 부담한 금액입니다.',
          en: 'It drains in order: issuer margin → reserve → LP senior. Each bar is what that layer actually paid.',
        }, anchor: 'p-lp-fall'},
      { screen: 'lp', text: {
          ko: '「심사 중 제한」이 판정과 함께 풀립니다.',
          en: 'The held-under-review lock is released together with the ruling.',
        }, anchor: 'p-lp-wd'},
    ],
  },
  t3: {
    issuer: 'AURA',
    dirty: ['lp', 'val', 'pub', 'issuer'],
    follow: {
      next: 't3b',
      text: {
        ko: '유예된 1,600은 아직 확정되지 않았습니다. 회수되면 해소되고, 끝내 회수되지 않으면 발급사 채무로 남습니다.',
        en: 'The 1,600 held at the cap is not settled yet. A recovery clears it; if nothing is recovered it stays as a debt of the issuer.',
      },
      btn: { ko: '후속 · 회수 정산 →', en: 'Follow-up · recovery settled →' },
    },
    title:       {
      ko: '상관 손실 → 상한 발동',
      en: 'Correlated loss → cap triggered',
    },
    soFar:       {
      ko: '개별 손실 1건을 워터폴이 흡수한 뒤, 같은 상류를 공유한 손실이 한꺼번에 들어옵니다.',
      en: 'The waterfall has absorbed a single loss. Now losses that share the same upstream arrive together.',
    },
    situation:   {
      ko: '같은 매입사 β를 쓰는 4건이 동시에 선지급된 상태에서 그 매입사의 정산이 중단되었습니다. 카드망이 정산을 보증하므로 실제로는 드문 극단 가정이며, 상관 손실의 구조를 보기 위한 설정입니다.',
      en: 'Four refunds routed through the same acquirer β were outstanding when that acquirer stopped settling. Card networks guarantee settlement, so this is a deliberately extreme assumption — it exists to show the shape of a correlated loss.',
    },
    why:         {
      ko: '풀의 핵심 위험은 산발적 손실이 아니라 상관 손실입니다. 같은 상류를 공유한 건들이 동시에 부실화됩니다. AURA는 매입사가 하나뿐이라 내부 집중도가 100%이며, 원칙대로라면 담보율이 {param.issuerCollateralPct}%가 아니라 30%여야 하는 발급사입니다.',
      en: 'A pool\'s real risk is not scattered losses but correlated ones: positions sharing an upstream fail at the same time. AURA uses a single acquirer, so its internal concentration is 100% — by the rule its collateral ratio should be 30%, not {param.issuerCollateralPct}%.',
    },
    designPoint: {
      ko: '상한은 손실을 없애는 장치가 아니라 한 사건이 풀 전체를 무너뜨리지 못하게 막는 장치입니다.',
      en: 'The cap does not remove losses. It stops one event from taking down the whole pool.',
    },
    watch: [
      { screen: 'lp', text: {
          ko: '확정 손실은 단일 사건 상한(LP 예치금의 {param.singleEventCapPct}%)까지만 잡히고 초과분은 「상한 유예」로 내려갑니다.',
          en: 'Confirmed loss is recognised only up to the single-event cap ({param.singleEventCapPct}% of LP deposits). Anything above it drops into held above cap.',
        }, anchor: 'p-lp-fall'},
      { screen: 'issuer', text: {
          ko: 'AURA 예치금이 {issuer.AURA.collateralRemaining:delta}으로 깎입니다. 손실 확정된 2건에서 마진이 200씩 실제로 빠져나갔습니다.',
          en: 'AURA\'s collateral is cut {issuer.AURA.collateralRemaining:delta}. Two confirmed losses took 200 of margin each, for real.',
        }, anchor: 'p-iss-cmp'},
      { screen: 'issuer', text: {
          ko: '마진 사용률 150% — 남은 포지션조차 담보로 못 덮는다는 뜻입니다. 상태가 MarginCall로 바뀝니다.',
          en: 'Margin usage 150% — its collateral no longer covers even the positions still open. The state flips to MarginCall.',
        }, anchor: 'p-iss-cmp'},
      { screen: 'issuer', text: {
          ko: '미상환 2,000은 유예 2건입니다. 유예는 손실이 아니라 판정 보류라 아직 나가 있는 돈으로 잡힙니다.',
          en: 'The 2,000 outstanding is two held positions. A hold is not a loss but a deferred ruling, so the money still counts as out.',
        }, anchor: 'p-iss-cmp'},
      { screen: 'issuer', text: {
          ko: 'HYBRID는 Active 그대로입니다. 담보와 한도가 발급사별로 독립이라 한쪽 사고가 다른 쪽을 멈추지 않습니다.',
          en: 'HYBRID stays Active. Collateral and limits are per issuer, so one issuer\'s incident does not stop another.',
        }, anchor: 'p-iss-cmp'},
      { screen: 'pub', text: {
          ko: '매입사 집중도가 한도 {param.acquirerExposurePct}%를 넘습니다. 어느 발급사가 물렸는지는 공개하지 않습니다.',
          en: 'Acquirer concentration passes its {param.acquirerExposurePct}% limit. Which issuer is exposed is not disclosed here.',
        }, anchor: 'p-pub-bars'},
    ],
  },
  t3b: {
    issuer: 'AURA',
    dirty: ['lp', 'issuer', 'pub'],
    title:       {
      ko: '상관 손실 → 상한 발동 · 후속',
      en: 'Correlated loss → cap triggered · follow-up',
    },
    soFar:       null,
    situation:   {
      ko: '유예된 1,600은 아직 확정되지 않았습니다. 회수되면 해소되고, 끝내 회수되지 않으면 발급사 채무로 남습니다.',
      en: 'The 1,600 held above the cap is not settled yet. Recovery clears it; failing to recover leaves it as a debt of the issuer.',
    },
    why:         null,
    designPoint: null,
    watch: [
      { screen: 'lp', text: {
          ko: '원금 4,000 − 회수 2,200 = 최종 손실 1,800. 담보 600과 풀 1,200으로 갈립니다.',
          en: 'Principal 4,000 − recovered 2,200 = final loss 1,800, split between 600 of collateral and 1,200 from the pool.',
        }, anchor: 'p-lp-fall'},
      { screen: 'lp', text: {
          ko: '상한 유예가 0으로 해제되고, 과다 인식분은 LP 시니어부터 역순으로 돌아갑니다.',
          en: 'The held amount releases to zero, and anything over-recognised is returned in reverse order, starting with LP senior.',
        }, anchor: 'p-lp-fall'},
      { screen: 'issuer', text: {
          ko: 'AURA 예치금이 0이 되어 Suspended로 전이합니다. 유예 2건까지 정산되며 담보 전액이 소진됐습니다.',
          en: 'AURA\'s collateral reaches zero and it moves to Suspended. Both held positions settle and the collateral is fully consumed.',
        }, anchor: 'p-iss-cmp'},
      { screen: 'issuer', text: {
          ko: '담보 600으로는 부담분 800을 못 냅니다. 부족분 200은 풀이 떠안습니다 — 담보율 {param.issuerCollateralPct}%와 부담률 {param.issuerLossSharePct}%의 간격입니다.',
          en: '600 of collateral cannot cover an 800 share. The pool absorbs the 200 shortfall — that is the gap between a {param.issuerCollateralPct}% collateral ratio and a {param.issuerLossSharePct}% loss share.',
        }, anchor: 'p-iss-cmp'},
    ],
  },
  t4: {
    dirty: ['lp'],
    title:       {
      ko: 'LP 출금 · 유동성',
      en: 'LP withdrawal and liquidity',
    },
    soFar:       {
      ko: '두 차례 손실로 풀이 얇아진 상태에서 LP가 출금을 요청합니다.',
      en: 'Two losses have thinned the pool. Now an LP asks to withdraw.',
    },
    situation:   {
      ko: '평시 운영 상태에서 LP-03이 지분 전액 출금을 요청했습니다. 풀의 돈 일부는 선지급으로 나가 있어 즉시 지급할 수 있는 현금은 한정되어 있습니다.',
      en: 'In normal operation, LP-03 requested its entire share. Part of the pool\'s money is out as advances, so the cash available to pay immediately is limited.',
    },
    why:         {
      ko: '전액 회수에 7일이 걸린다면 외부 LP는 참여하지 않습니다. 반대로 현금을 선착순으로 전액 지급하면 잔여 LP의 몫과 선지급 재원을 침범합니다.',
      en: 'If a full exit took 7 days, outside LPs would not join. Pay everyone in full, first come first served, and you eat into the remaining LPs\' share and the funding for new advances.',
    },
    designPoint: {
      ko: '통보기간 0일, 전액 회수 5일. 담는 자산의 평균 만기가 5일이라 최악의 대기도 5일입니다.',
      en: 'Zero notice period, full recovery in 5 days. The assets held average a 5-day term, so the worst wait is 5 days.',
    },
    watch: [
      { screen: 'lp', text: {
          ko: '즉시 지급 한도는 지분율 × 현금성 잔액입니다. 나머지는 D+5에 자동 지급됩니다.',
          en: 'The instant payout is share × cash balance. The rest pays out automatically at D+5.',
        }, anchor: 'p-lp-wd'},
      { screen: 'lp', text: {
          ko: 'LP-03이 지분 표에서 사라지고 남은 LP의 지분이 재계산됩니다.',
          en: 'LP-03 disappears from the holdings table and the remaining shares are recalculated.',
        }, anchor: 'p-lp-rows'},
      { screen: 'lp', text: {
          ko: '출금이 진행되는 동안에도 핫 버킷이 남아 신규 선지급이 멈추지 않았습니다.',
          en: 'The hot bucket survives the withdrawal, so new advances never stopped.',
        }, anchor: 'p-lp-donut'},
    ],
  },
  t5: {
    issuer: 'HYBRID',
    dirty: ['issuer', 'pub'],
    title:       {
      ko: '지연 후 정상 상환',
      en: 'Delayed, then repaid',
    },
    soFar:       {
      ko: '손실과 출금을 겪은 뒤, 이번에는 지연됐던 건이 정상적으로 돌아옵니다.',
      en: 'After a loss and a withdrawal, a delayed refund comes back normally.',
    },
    situation:   {
      ko: '만기가 지났는데 정산금이 안 들어왔습니다. 유예와 증빙 확인을 거쳐 뒤늦게 정상 수취됐습니다.',
      en: 'A refund passed its due date with no settlement received. After a grace period and document checks, it arrived late but in full.',
    },
    why:         {
      ko: '만기 경과를 즉시 손실로 처리하면 단순 지연 건으로 담보가 차감되고 이용이 중단됩니다.',
      en: 'Treating a passed due date as an immediate loss would take collateral from an issuer over a simple delay and suspend its access.',
    },
    designPoint: {
      ko: '시간 경과는 손실이 아닙니다. 손실은 검증자 판정으로만 확정됩니다.',
      en: 'Time passing is not a loss. A loss is confirmed only by a verifier\'s ruling.',
    },
    watch: [
      { screen: 'issuer', text: {
          ko: '포지션이 세 단계를 지나 정상 상환으로 끝납니다. 상태 칸 아래 이력에 경로가 남습니다.',
          en: 'The position passes through three states and ends as repaid. The path stays in the history under the state column.',
        }, anchor: 'p-iss-pos'},
      { screen: 'issuer', text: {
          ko: '담보 차감 0. 지연 동안 신규 선지급만 멈췄다가 상환과 함께 풀립니다.',
          en: 'Collateral taken: zero. Only new advances paused during the delay, and they resume on repayment.',
        }, anchor: 'p-iss-cmp'},
    ],
  },
  t6: {
    dirty: ['lp'],
    title:       {
      ko: '외부 운용처 동결',
      en: 'External venue frozen',
    },
    soFar:       {
      ko: '풀이 회복 국면에 들어선 상태에서 외부 운용처가 동결됩니다.',
      en: 'The pool is recovering when the external venue freezes.',
    },
    situation:   {
      ko: '유휴자금을 넣어둔 외부 대출 시장의 가동률이 100%에 도달해 인출이 실패했습니다.',
      en: 'The external lending market holding idle funds hit 100% utilisation, and the withdrawal failed.',
    },
    why:         {
      ko: '운용처가 막히면 선지급 재원까지 함께 묶일 수 있습니다. 부수 운용의 실패가 본 기능을 정지시키는 상황입니다.',
      en: 'A blocked venue can lock up the funding for advances along with it — a side activity failing would stop the core one.',
    },
    designPoint: {
      ko: '서킷 브레이커는 운용 배치만 멈추고 환불 선지급은 멈추지 않습니다.',
      en: 'The circuit breaker stops the deployment batch only. Refund advances keep running.',
    },
    watch: [
      { screen: 'lp', text: {
          ko: '운용 버킷이 동결 색으로 바뀌어도 핫 버킷은 남아 있습니다.',
          en: 'The deployed bucket turns to its frozen colour, but the hot bucket is still there.',
        }, anchor: 'p-lp-donut'},
      { screen: 'lp', text: {
          ko: '운용 상한 {param.idleDeployCapPct}%가 실제로 지켜지는지 여기서 확인됩니다.',
          en: 'This is where you see whether the {param.idleDeployCapPct}% deployment cap actually holds.',
        }, anchor: 'p-lp-wd'},
    ],
  },
  t7: {
    dirty: ['issuer', 'pub'],
    title:       {
      ko: '체인 성공 · DB 실패',
      en: 'Chain succeeded, ledger failed',
    },
    soFar:       {
      ko: '자금 쪽 사고가 정리된 뒤, 이번에는 기록 정합성 문제가 발생합니다.',
      en: 'With the funding incidents settled, a record-consistency problem appears.',
    },
    situation:   {
      ko: '선지급 트랜잭션은 체인에서 성공했는데, 그 결과를 카드사 내부 장부에 반영하는 단계가 실패했습니다.',
      en: 'The advance transaction succeeded on chain, but writing the result into the issuer\'s own ledger failed.',
    },
    why:         {
      ko: '재실행하면 동일 환불 건에 선지급이 중복됩니다. 아무 조치도 하지 않으면 사용자 잔액이 복원되지 않습니다.',
      en: 'Retrying double-advances the same refund. Doing nothing leaves the cardholder\'s balance unrestored.',
    },
    designPoint: {
      ko: '발급사가 refundKey로 체인 상태를 먼저 확인합니다. 선지급이 확정돼 있으면 내부 원장만 다시 맞추고, 확정돼 있지 않을 때만 재제출합니다.',
      en: 'The issuer checks chain state by refundKey first. If the advance is confirmed it only re-syncs its internal ledger, and re-submits only when it is not.',
    },
    watch: [
      { screen: 'pub', text: {
          ko: '장부 반영 확정 기록만 추가되고 누적 선지급액은 그대로입니다.',
          en: 'A ledger-confirmation record is added and nothing else. Cumulative advances are unchanged.',
        }, anchor: 'p-pub-ev'},
      { screen: 'issuer', text: {
          ko: '포지션 표는 행이 늘지 않습니다. 변화가 없는 것이 정상 동작입니다.',
          en: 'The position table gains no rows. Nothing changing is the correct behaviour.',
        }, still: true},
    ],
  },
  t8: {
    dirty: ['val', 'pub'],
    title:       {
      ko: '부정 요청 거절',
      en: 'Invalid requests rejected',
    },
    soFar:       {
      ko: '여기까지는 모두 들어온 뒤에 생긴 사고였습니다. 이번 건은 들어오기 전에 걸립니다.',
      en: 'Everything so far went wrong after a refund was let in. This one is caught before it gets in.',
    },
    situation:   {
      ko: '이미 사용된 환불 ID 재제출, 미등록 발급사 서명, 다른 체인용 서명 — 세 종류의 잘못된 요청이 들어왔습니다.',
      en: 'Three bad requests arrive: a reused refund id, a signature from an unregistered issuer, and a signature meant for another chain.',
    },
    why:         {
      ko: '선지급은 자금이 먼저 나가는 구조이므로 요청 검증에 실패하면 그대로 손실이 됩니다.',
      en: 'An advance sends money out first, so a request that wrongly passes verification is a loss outright.',
    },
    designPoint: {
      ko: 'refundKey 중복, 발급사 등록 여부, chainId 일치는 전부 체인 위에서 확인 가능합니다.',
      en: 'Duplicate refundKey, issuer registration and chainId match can all be checked on chain.',
    },
    watch: [
      { screen: 'pub', text: {
          ko: '거절 3건이 기록됩니다. 거절 역시 기록으로 남아 사후 감사가 가능합니다.',
          en: 'Three rejections are recorded. A refusal is kept on the record too, so it can be audited afterwards.',
        }, anchor: 'p-pub-ev'},
      { screen: 'issuer', text: {
          ko: '포지션 표에 행이 늘지 않습니다. 선지급 전에 차단되었습니다.',
          en: 'The position table gains no rows. It was blocked before any money moved.',
        }, still: true},
    ],
  },
  t9: {
    issuer: 'NOVA',
    follow: {
      next: 't9b',
      text: {
        ko: '미상환 수요가 증가하면서 LP 예치 한도가 확대되었습니다. LP 세 곳이 예치를 신청했습니다.',
        en: 'Outstanding demand has grown, so the LP deposit cap widens with it. Three LPs have applied to deposit.',
      },
      btn: { ko: '2단계 · 자본 유입 →', en: 'Stage 2 · capital arrives →' },
    },
    nudge: { need: 't3', text: {
      ko: '3번을 먼저 보면 이번에 줄어드는 집중도가 무엇을 줄이는 것인지 보입니다.',
      en: 'Seeing t3 first shows what the concentration falling here is actually reducing.',
    } },
    dirty: ['issuer', 'lp', 'pub'],
    title:       {
      ko: '발급사가 늘어날 때',
      en: 'More issuers join',
    },
    soFar:       {
      ko: '사고와 거절을 모두 겪은 풀에 발급사와 자본이 추가로 들어옵니다.',
      en: 'A pool that has been through incidents and refusals now takes on more issuers and more capital.',
    },
    situation:   {
      ko: '발급사 3곳이 참여를 신청했습니다. 카드망 라이선스와 과거 미도착률을 심사해 등록합니다. 지금까지의 손실은 발급사 2곳, 매입사 β 한 곳에 미상환의 80%가 몰린 상태에서 났습니다.',
      en: 'Three issuers applied. They are registered after a review of network licensing and past non-arrival rates. Every loss so far happened with 80% of outstanding concentrated in two issuers and a single acquirer, β.',
    },
    why:         {
      ko: '이미 발생한 손실은 회복되지 않습니다. 변화하는 것은 향후 노출입니다. 신규 발급사가 물량을 만들어야 LP 자리가 생기며, 순서가 반대이면 자본만 유휴 상태가 됩니다.',
      en: 'Losses already taken do not come back. What changes is future exposure. New issuers have to create volume before there is room for LPs — in the other order, capital just sits idle.',
    },
    designPoint: {
      ko: '위험을 줄이는 축은 자본이 아니라 분산입니다.',
      en: 'Risk is reduced along the axis of diversification, not capital.',
    },
    watch: [
      { screen: 'issuer', text: {
          ko: '3곳이 램프업으로 등록됩니다. 첫 {param.rampUpDays}일은 담보 대비 한도의 {param.rampUpPct}%만 열립니다 — 가장 위험한 순간은 새 발급사의 첫 거래입니다.',
          en: 'Three register in ramp-up. For the first {param.rampUpDays} days only {param.rampUpPct}% of the collateral-based limit opens — a new issuer\'s first transactions are the most dangerous moment.',
        }, anchor: 'p-iss-cmp'},
      { screen: 'issuer', text: {
          ko: '지금은 다섯 곳의 유효 한도가 모두 같습니다. 풀 여력이 얇아 담보 차이가 한도에 반영되지 못하는 상태이며, 2단계에서 풀리는 지점입니다.',
          en: 'All five effective limits are identical right now. Pool capacity is too thin for collateral differences to reach the limits; that resolves at stage 2.',
        }, anchor: 'p-iss-cmp'},
      { screen: 'lp', text: {
          ko: '신규 발급사가 유휴 현금을 사용하면서 가동률이 목표 {param.lpTargetUtilizationPct}%를 상회합니다. 자본이 필요해진 시점이며 2단계의 원인입니다.',
          en: 'New issuers draw on idle cash and utilisation rises above the {param.lpTargetUtilizationPct}% target. This is the moment capital is needed, and the reason for stage 2.',
        }, anchor: 'p-lp-donut'},
      { screen: 'pub', text: {
          ko: '매입사 집중도가 한도 {param.acquirerExposurePct}% 아래로 내려옵니다. 3번 사고의 크기를 키운 것은 손실률이 아니라 집중도였습니다.',
          en: 'Acquirer concentration falls back under the {param.acquirerExposurePct}% limit. What made incident 3 large was concentration, not the loss rate.',
        }, anchor: 'p-pub-bars'},
    ],
  },
  t9b: {
    dirty: ['lp', 'pub'],
    title:       {
      ko: '발급사가 늘어날 때 · 후속',
      en: 'More issuers join · follow-up',
    },
    soFar:       null,
    situation:   {
      ko: '미상환 수요가 증가하면서 LP 예치 한도가 확대되었습니다. LP 세 곳이 예치를 신청했습니다.',
      en: 'Rising outstanding demand widened the LP deposit cap. Three LPs applied to deposit.',
    },
    why:         null,
    designPoint: null,
    watch: [
      { screen: 'lp', text: {
          ko: '요청 총액이 예치 한도를 넘어 초과분이 거절됩니다. 한도 = 평균 미상환 ÷ 목표 가동률 {param.lpTargetUtilizationPct}%.',
          en: 'The total requested exceeds the cap, so the excess is refused. Cap = average outstanding ÷ the {param.lpTargetUtilizationPct}% target utilisation.',
        }, anchor: 'p-lp-funds'},
      { screen: 'lp', text: {
          ko: '한 곳은 금액이 커서 단일 LP 집중 한도 {param.lpSingleCapPct}%에 걸립니다. 그 LP가 나갈 때 풀이 흔들리지 않게 하는 선입니다.',
          en: 'One is large enough to hit the {param.lpSingleCapPct}% single-LP concentration limit — the line that keeps the pool steady when that LP leaves.',
        }, anchor: 'p-lp-rows'},
      { screen: 'lp', text: {
          ko: '거절하지 않으면 가동률과 개별 LP 수익률이 같은 비율로 하락합니다. 손실 총액은 불변이며, 희석은 분산이 아닙니다.',
          en: 'Accept it all and utilisation and every LP\'s return fall by the same proportion. Total losses do not change: dilution is not diversification.',
        }, anchor: 'p-lp-donut'},
      { screen: 'issuer', text: {
          ko: '풀이 커지자 발급사 유효 한도가 같이 올랐습니다. 담보를 다시 넣지 않아도 풀 성장이 한도로 돌아옵니다.',
          en: 'A larger pool raises the issuers\' effective limits with it. Pool growth returns as headroom without anyone posting more collateral.',
        }, anchor: 'p-iss-cmp'},
      { screen: 'issuer', text: {
          ko: '한도가 발급사마다 갈립니다. 천장이 풀에서 각자의 담보로 넘어갔기 때문이며, 이것이 담보율이 실제로 작동하는 상태입니다.',
          en: 'Limits now differ per issuer. The ceiling has moved from the pool to each issuer\'s own collateral — this is the collateral ratio actually doing its job.',
        }, anchor: 'p-iss-cmp'},
      { screen: 'pub', text: {
          ko: '손실률과 손익분기 0.35%를 비교해보세요. 사고가 1년치 물량에 겹쳐 난 스트레스 구간이라 위에 있습니다 — 평시처럼 단일 손실 1건이면 0.27%로 아래입니다.',
          en: 'Compare the loss rate with the 0.35% break-even. It sits above because incidents were stacked on top of a year\'s volume in a stress run — with a single ordinary loss it is 0.27%, below the line.',
        }, anchor: 'p-pub-bars'},
    ],
  },
};
