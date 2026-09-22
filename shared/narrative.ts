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

/**
 * A figure pulled out of the sentence and set beside it. The sentence carries
 * the reasoning, the chip carries the number — a judge scanning the card reads
 * the chips and only then the prose.
 *
 * `v` may hold placeholders, so a chip stays true when the bundle changes.
 */
export interface WatchChip {
  k: Bilingual;
  v: Bilingual;
  /** ok · crit · warn colour the value. Plain by default. */
  tone?: 'ok' | 'crit' | 'warn';
  /**
   * An event name. The chip then shows that event's transaction hash from this
   * snapshot as a link instead of a value — the claim and its receipt together.
   */
  tx?: string;
}

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
  /** Figures for this line, shown as chips under it. */
  chips?: WatchChip[];
}

export interface TimepointNarrative {
  title: Bilingual;
  /** Screens that changed here — drives the unread dot on each tab. */
  dirty?: ScreenKey[];
  /**
   * "What changed" — the run itself, in order, with the figures it produced.
   * Separate from `watch` because they answer different questions: this one
   * says what happened, `watch` says where to go and look at it.
   */
  changed?: WatchLine[];
  /**
   * What this timepoint proves, beyond any one screen. The mockup keeps these
   * at the bottom of the briefing — they belong to the scenario, not to a
   * panel, so they have no "check it" button and no anchor.
   */
  conclusion?: WatchLine[];
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
    changed: [
      { screen: 'lp', text: {
          ko: '지난 1년 누적 운영 요약을 불러왔습니다 — 가동률 {param.idleDeployCapPct}%, 평균 선지급 {param.avgTermDays}일 기준 {year.count}건 정상 처리(가정값).',
          en: 'A year of operation was loaded — {year.count} refunds handled at {param.idleDeployCapPct}% utilisation on a {param.avgTermDays}-day cycle (assumed).',
        }, anchor: 'p-lp-year',
        chips: [
          { k: { ko: '처리 건수', en: 'Refunds' }, v: { ko: '0 → {year.count}', en: '0 → {year.count}' }, tone: 'ok' },
          { k: { ko: '누적 수수료', en: 'Fees' }, v: { ko: '0 → {year.feeTotal}', en: '0 → {year.feeTotal}' }, tone: 'ok' },
        ]},
      { screen: 'lp', text: {
          ko: '수수료 {year.feeTotal}이 설계된 비율대로 나뉘었습니다. LP 몫은 예치금 {pool.lpDeposits} 대비 연 {year.annualPct:pct}입니다.',
          en: 'The {year.feeTotal} in fees was split at the designed ratios. The LP share is {year.annualPct:pct} a year against deposits of {pool.lpDeposits}.',
        }, anchor: 'p-lp-year',
        chips: [
          { k: { ko: 'LP', en: 'LPs' }, v: { ko: '{year.lpShare}', en: '{year.lpShare}' } },
          { k: { ko: '준비금', en: 'Reserve' }, v: { ko: '{pool.reserve:delta}', en: '{pool.reserve:delta}' }, tone: 'ok' },
          { k: { ko: '프로토콜', en: 'Protocol' }, v: { ko: '{year.protocolShare}', en: '{year.protocolShare}' } },
        ]},
      { screen: 'val', text: {
          ko: '{year.closed}건은 정상 상환으로 종결됐고, 마지막 1건은 만기가 지나 검토 중입니다. 시간 경과만으로는 손실이 아니며 판정은 시나리오 2에서 내려집니다.',
          en: '{year.closed} closed as repaid; the last one is past due and under review. Time passing is not a loss — the ruling comes in scenario 2.',
        }, anchor: 'p-val-rows',
        chips: [
          { k: { ko: '정상 종결', en: 'Closed' }, v: { ko: '{year.closed}', en: '{year.closed}' }, tone: 'ok' },
          { k: { ko: '검토 중', en: 'Under review' }, v: { ko: '{count.Review}', en: '{count.Review}' }, tone: 'warn' },
          { k: { ko: '미상환', en: 'Outstanding' }, v: { ko: '{pool.advancedOutstanding:delta}', en: '{pool.advancedOutstanding:delta}' }, tone: 'crit' },
        ]},
    ],
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
    changed: [
      { screen: 'val', text: {
          ko: '1년치의 마지막 1건이 판정 단계에 들어갑니다. 검증자가 상류 정산기관의 미수취 확인서를 확인했습니다.',
          en: 'The last of the year\'s refunds reaches a ruling. The verifiers examined the upstream non-receipt confirmation.',
        }, anchor: 'p-val-rows',
        chips: [
          { k: { ko: '대상', en: 'Subject' }, v: { ko: 'REF-2026-021', en: 'REF-2026-021' } },
          { k: { ko: '판정', en: 'Ruling' }, v: { ko: '보장 손실', en: 'covered loss' }, tone: 'crit' },
        ]},
      { screen: 'lp', text: {
          ko: '검증자가 보장 대상으로 승인했습니다. 워터폴이 위에서부터 순서대로 작동합니다.',
          en: 'The verifiers approved it as covered. The waterfall runs from the top down, in order.',
        }, anchor: 'p-lp-fall',
        chips: [
          { k: { ko: '발급사 마진', en: 'Issuer margin' }, v: { ko: '{derive.marginAbsorbed}', en: '{derive.marginAbsorbed}' } },
          { k: { ko: '준비금', en: 'Reserve' }, v: { ko: '{pool.reserve:delta}', en: '{pool.reserve:delta}' }, tone: 'crit' },
          { k: { ko: 'LP', en: 'LPs' }, v: { ko: '{pool.lpLossApplied}', en: '{pool.lpLossApplied}' }, tone: 'crit' },
          { k: { ko: '', en: '' }, v: { ko: '', en: '' }, tx: 'CoveredLossFinalized' },
        ]},
    ],
    conclusion: [
      { screen: 'lp', text: {
          ko: '누적 {year.count}건 중 1건 손실 — 손실률 {metrics.lossRatePct:pct}로 손익분기 {param.breakEvenPct:pct}를 밑돕니다. LP는 손실을 맞고도 순이익 구간에 남습니다.',
          en: 'One loss in {year.count} refunds — a {metrics.lossRatePct:pct} loss rate, under the {param.breakEvenPct:pct} break-even. The LPs took the loss and are still in profit.',
        },
        chips: [
          { k: { ko: '손실률', en: 'Loss rate' }, v: { ko: '{metrics.lossRatePct:pct}', en: '{metrics.lossRatePct:pct}' } },
          { k: { ko: '손익분기', en: 'Break-even' }, v: { ko: '{param.breakEvenPct:pct}', en: '{param.breakEvenPct:pct}' } },
          { k: { ko: 'LP 순손익', en: 'LP net' }, v: { ko: '{derive.lpNet}', en: '{derive.lpNet}' }, tone: 'ok' },
        ]},
      { screen: 'lp', text: {
          ko: '사용자 잔액은 환수하지 않습니다. 소비자는 이 경로를 인지하지 않습니다.',
          en: 'The cardholder\'s balance is never clawed back. None of this reaches the consumer.',
        },
        chips: [{ k: { ko: '사용자 영향', en: 'Cardholder impact' }, v: { ko: '없음', en: 'none' }, tone: 'ok' }]},
    ],
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
    changed: [
      { screen: 'issuer', text: {
          ko: '매입사 β 소속 4건이 한꺼번에 선지급된 상태에서 그 매입사가 정산을 멈췄습니다. AURA의 예치금 {issuer.AURA.collateralInitial}이 열어주던 한도 {issuer.AURA.effectiveLimit:prev}를 꽉 채운 상태였습니다.',
          en: 'Four advances routed through acquirer β were outstanding together when that acquirer stopped settling. They filled the {issuer.AURA.effectiveLimit:prev} limit that AURA\'s {issuer.AURA.collateralInitial} of collateral opened.',
        }, anchor: 'p-iss-cmp',
        chips: [
          { k: { ko: '익스포저', en: 'Exposure' }, v: { ko: '{metrics.acquirerTopExposure:delta}', en: '{metrics.acquirerTopExposure:delta}' }, tone: 'crit' },
          { k: { ko: 'AURA 담보', en: 'AURA collateral' }, v: { ko: '{issuer.AURA.collateralRemaining:delta}', en: '{issuer.AURA.collateralRemaining:delta}' }, tone: 'crit' },
          { k: { ko: '', en: '' }, v: { ko: '', en: '' }, tx: 'CorrelatedExposureFlagged' },
        ]},
      { screen: 'issuer', text: {
          ko: 'AURA는 남은 담보로 기존 포지션을 감당하지 못해 MarginCall로 전환됐습니다. 신규 선지급만 막히고 기존 포지션은 그대로 유지됩니다.',
          en: 'AURA\'s remaining collateral no longer covers the positions it already has, so it flips to MarginCall. Only new advances stop; the open positions stay exactly as they are.',
        }, anchor: 'p-iss-cmp',
        chips: [
          { k: { ko: 'AURA', en: 'AURA' }, v: { ko: 'Active → MarginCall', en: 'Active → MarginCall' }, tone: 'crit' },
          { k: { ko: 'HYBRID', en: 'HYBRID' }, v: { ko: 'Active 유지', en: 'still Active' }, tone: 'ok' },
        ]},
      { screen: 'lp', text: {
          ko: '단일 사건 상한은 LP 예치금의 {param.singleEventCapPct}%입니다. 거기까지만 확정 손실로 인식하고, 초과분 {pool.capHeld}는 「상한 유예」로 내려갑니다. 확정분은 발급사 마진 → 준비금 → LP 시니어 순으로 빠집니다.',
          en: 'The single-event cap is {param.singleEventCapPct}% of LP deposits. Loss is recognised up to it and no further — the {pool.capHeld} above it drops into held above cap. What is recognised drains in order: issuer margin → reserve → LP senior.',
        }, anchor: 'p-lp-fall',
        chips: [
          { k: { ko: '상한', en: 'Cap' }, v: { ko: '{derive.singleEventCap}', en: '{derive.singleEventCap}' } },
          { k: { ko: '상한 유예', en: 'Held above cap' }, v: { ko: '{pool.capHeld:delta}', en: '{pool.capHeld:delta}' }, tone: 'warn' },
          { k: { ko: 'LP 부담', en: 'LP absorbed' }, v: { ko: '{pool.lpLossApplied:delta}', en: '{pool.lpLossApplied:delta}' }, tone: 'crit' },
          { k: { ko: '', en: '' }, v: { ko: '', en: '' }, tx: 'LossCapTriggered' },
        ]},
    ],
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
    changed: [
      { screen: 'lp', text: {
          ko: '몇 달 뒤 — 매입사 β가 정산을 일부 재개하고 나머지는 파산 배당으로 정리되어 {recovery.AURA.recovered}가 회수됐습니다(원금 {recovery.AURA.principal} 대비 {recovery.AURA.recoveredPct:pct}). 회수금은 발급사 AURA를 거쳐 풀로 들어옵니다.',
          en: 'Months later — acquirer β resumed settling part of what it owed and the rest came through as a bankruptcy distribution, recovering {recovery.AURA.recovered} ({recovery.AURA.recoveredPct:pct} of the {recovery.AURA.principal} principal). The money returns to the pool through AURA.',
        }, anchor: 'p-lp-fall',
        chips: [
          { k: { ko: '회수', en: 'Recovered' }, v: { ko: '{recovery.AURA.recovered}', en: '{recovery.AURA.recovered}' }, tone: 'ok' },
          { k: { ko: '회수율', en: 'Recovery rate' }, v: { ko: '{recovery.AURA.recoveredPct:pct}', en: '{recovery.AURA.recoveredPct:pct}' }, tone: 'ok' },
          { k: { ko: '', en: '' }, v: { ko: '', en: '' }, tx: 'RecoveryRecorded' },
        ]},
      { screen: 'lp', text: {
          ko: '상한 유예 {pool.capHeld:prev}이 전액 해제됐습니다. 유예분은 손실이 아니라 판정을 미뤄둔 상태였고, 회수로 정리됐습니다.',
          en: 'All {pool.capHeld:prev} held above the cap is released. A hold was never a loss — it was a ruling deferred, and the recovery settles it.',
        }, anchor: 'p-lp-fall',
        chips: [
          { k: { ko: '상한 유예', en: 'Held above cap' }, v: { ko: '{pool.capHeld:delta}', en: '{pool.capHeld:delta}' }, tone: 'ok' },
        ]},
      { screen: 'lp', text: {
          ko: '과다 인식된 손실 {recovery.AURA.lpRestored}을 부담의 역순으로 돌려줍니다 — LP 시니어가 먼저, 남으면 준비금입니다.',
          en: 'The {recovery.AURA.lpRestored} of loss that was over-recognised is returned in reverse order of absorption — LP senior first, the reserve after that if anything is left.',
        }, anchor: 'p-lp-fall',
        chips: [
          { k: { ko: 'LP 손실 회복', en: 'LP loss restored' }, v: { ko: '{recovery.AURA.lpRestored}', en: '{recovery.AURA.lpRestored}' }, tone: 'ok' },
          { k: { ko: '준비금 복구', en: 'Reserve restored' }, v: { ko: '{recovery.AURA.reserveRestored}', en: '{recovery.AURA.reserveRestored}' } },
          { k: { ko: 'LP 잔여 손실', en: 'LP loss remaining' }, v: { ko: '{pool.lpLossApplied}', en: '{pool.lpLossApplied}' }, tone: 'crit' },
        ]},
      { screen: 'lp', text: {
          ko: '정산 요약 — 원금 {recovery.AURA.principal} − 회수 {recovery.AURA.recovered} = 최종 손실 {recovery.AURA.finalLoss}. 담보 {recovery.AURA.collateralBorne}과 풀 {recovery.AURA.poolBorne}으로 갈립니다.',
          en: 'Settled — principal {recovery.AURA.principal} − recovered {recovery.AURA.recovered} = a final loss of {recovery.AURA.finalLoss}, split between {recovery.AURA.collateralBorne} of collateral and {recovery.AURA.poolBorne} from the pool.',
        }, anchor: 'p-lp-fall',
        chips: [
          { k: { ko: '원금', en: 'Principal' }, v: { ko: '{recovery.AURA.principal}', en: '{recovery.AURA.principal}' } },
          { k: { ko: '회수', en: 'Recovered' }, v: { ko: '{recovery.AURA.recovered}', en: '{recovery.AURA.recovered}' }, tone: 'ok' },
          { k: { ko: '담보 부담', en: 'Borne by collateral' }, v: { ko: '{recovery.AURA.collateralBorne}', en: '{recovery.AURA.collateralBorne}' } },
          { k: { ko: '풀 부담', en: 'Borne by pool' }, v: { ko: '{recovery.AURA.poolBorne}', en: '{recovery.AURA.poolBorne}' }, tone: 'crit' },
        ]},
      { screen: 'issuer', text: {
          ko: '유예되어 있던 2건이 함께 정산되며 AURA의 미상환이 0으로 떨어집니다.',
          en: 'The two held positions settle together and AURA\'s outstanding balance falls to zero.',
        }, anchor: 'p-iss-cmp',
        chips: [
          { k: { ko: '미상환', en: 'Outstanding' }, v: { ko: '{issuer.AURA.outstanding:delta}', en: '{issuer.AURA.outstanding:delta}' }, tone: 'ok' },
          { k: { ko: 'AURA 담보', en: 'AURA collateral' }, v: { ko: '{issuer.AURA.collateralRemaining:delta}', en: '{issuer.AURA.collateralRemaining:delta}' }, tone: 'crit' },
          { k: { ko: 'AURA', en: 'AURA' }, v: { ko: 'MarginCall → Suspended', en: 'MarginCall → Suspended' }, tone: 'crit' },
        ]},
    ],
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
          ko: '회수는 손실을 되돌리는 절차가 아니라 과다 인식분을 정정하는 절차입니다. 확정된 {pool.lpLossApplied}는 그대로 남습니다.',
          en: 'A recovery does not undo the loss — it corrects what was over-recognised. The {pool.lpLossApplied} that was genuinely lost stays lost.',
        }, anchor: 'p-lp-fall'},
      { screen: 'lp', text: {
          ko: '평가액이 {pool.netAssetValue:delta}로 회복되고 미상환은 0이 됩니다. 이 사건은 여기서 닫힙니다.',
          en: 'Net asset value recovers {pool.netAssetValue:delta} and nothing is left outstanding. The event closes here.',
        }, anchor: 'p-lp-rows'},
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
    follow: {
      next: 't4b',
      text: {
        ko: '대기 중인 800은 아직 지급되지 않았습니다. D+5에 만기가 도래하면 그 자금으로 자동 지급되고 출금이 끝납니다.',
        en: 'The 800 still queued has not been paid yet. At D+5 the maturing advances fund it automatically and the withdrawal closes.',
      },
      btn: { ko: '후속 · D+5 정산 →', en: 'Follow-up · D+5 settled →' },
    },
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
          ko: '평시 운영 상태입니다 — 최근 며칠에 걸쳐 4건, 총 {pool.advancedOutstanding:delta}이 나가 있습니다. 만기가 서로 달라 매일 일부가 상환되고 일부가 새로 나갑니다. 가동률 {metrics.utilizationPct:pct}.',
          en: 'Normal operation — four advances over the last few days, {pool.advancedOutstanding:delta} outstanding. Their terms are staggered, so every day some are repaid and some go out. Utilisation {metrics.utilizationPct:pct}.',
        }, anchor: 'p-lp-donut',
        chips: [{ k: { ko: '미상환', en: 'Outstanding' }, v: { ko: '{pool.advancedOutstanding:delta}', en: '{pool.advancedOutstanding:delta}' } },
          { k: { ko: '가동률', en: 'Utilisation' }, v: { ko: '{metrics.utilizationPct:pct}', en: '{metrics.utilizationPct:pct}' } }]},
      { screen: 'lp', text: {
          ko: 'LP-03(지분 {lp.LP-03.sharePct:pct})이 지분 전액 {lp.LP-03.equity} 출금을 요청했습니다. 고정 통보기간도, 사전 통보 의무도 없습니다.',
          en: 'LP-03, holding {lp.LP-03.sharePct:pct} of the pool, has asked to withdraw its entire stake of {lp.LP-03.equity}. There is no fixed notice period and no obligation to warn anyone in advance.',
        }, anchor: 'p-lp-rows',
        chips: [{ k: { ko: '요청', en: 'Requested' }, v: { ko: '{lp.LP-03.equity}', en: '{lp.LP-03.equity}' } },
          { k: { ko: '통보기간', en: 'Notice' }, v: { ko: '없음', en: 'none' }, tone: 'ok' }]},
      { screen: 'lp', text: {
          ko: '이 중 {lp.LP-03.instant}이 즉시 지급됩니다 — 지분율 × 현금성 잔액이 한도입니다. 현금을 먼저 온 LP에게 전부 내주면 다른 LP 몫을 침범하고 선지급도 멈추기 때문입니다. 나머지 {lp.LP-03.queued}은 만기 도래분에서 D+5에 자동 지급됩니다 — 묶이는 금액은 그 LP 지분이 선지급으로 나가 있는 만큼입니다.',
          en: '{lp.LP-03.instant} of that goes out at once — the cap is the LP\'s share of the cash actually held. Handing all of the cash to whoever asks first would eat into the other LPs\' money and stop new advances. The remaining {lp.LP-03.queued} is paid automatically at D+5, out of the advances that mature — what is held back is exactly this LP\'s share of the money currently out on advances.',
        }, anchor: 'p-lp-wd',
        chips: [{ k: { ko: '즉시 지급', en: 'Paid at once' }, v: { ko: '{lp.LP-03.instant}', en: '{lp.LP-03.instant}' } },
          { k: { ko: '대기', en: 'Queued' }, v: { ko: '{lp.LP-03.queued}', en: '{lp.LP-03.queued}' } },
          { k: { ko: '예상 완료', en: 'Expected' }, v: { ko: 'D+5', en: 'D+5' } }]},
    ],
  },
  t4b: {
    dirty: ['lp'],
    title: {
      ko: 'LP 출금 · 유동성 · 후속',
      en: 'LP withdrawal and liquidity · follow-up',
    },
    soFar: {
      ko: '출금 요청 중 즉시 지급분만 나갔고 나머지는 만기를 기다리는 상태였습니다.',
      en: 'Only the instant portion of the withdrawal has gone out; the rest was waiting on maturity.',
    },
    situation: {
      ko: 'D+5이 되어 만기가 도래한 3건 3,000이 상환되었고, 그 자금으로 대기 중이던 800이 자동 지급되어 출금이 100% 완료되었습니다. LP-03은 지분 표에서 사라집니다.',
      en: 'At D+5 three advances totalling 3,000 were repaid, and the 800 that was queued was paid automatically out of that money. The withdrawal is complete and LP-03 leaves the register.',
    },
    why: {
      ko: '출금 재원이 신규 선지급을 침범하지 않고 만기 도래분에서 나왔다는 것이 이 단계의 요점입니다. 자본이 빠져나가는 동안에도 서비스는 멈추지 않았습니다.',
      en: 'The point of this stage is where the money came from: maturing advances, not the funds that back new ones. Capital left and the service never stopped.',
    },
    designPoint: {
      ko: '통보기간 0일, 전액 회수 5일. 담는 자산의 평균 만기가 5일이라 최악의 대기도 5일입니다.',
      en: 'No notice period, full exit in five days. The assets it holds mature in five days, so five days is also the worst case.',
    },
    watch: [
      { screen: 'lp', text: {
          ko: 'D+5 — 이날 만기가 도래한 3건 3,000이 상환됐습니다. 선지급 잔액 {pool.advancedOutstanding:delta}. 나머지 1건은 아직 만기 전입니다.',
          en: 'D+5 — the three advances maturing today were repaid, 3,000 in all. Outstanding {pool.advancedOutstanding:delta}. The fourth is not due yet.',
        }, anchor: 'p-lp-donut',
        chips: [{ k: { ko: '선지급 잔액', en: 'Outstanding' }, v: { ko: '{pool.advancedOutstanding:delta}', en: '{pool.advancedOutstanding:delta}' } }]},
      { screen: 'lp', text: {
          ko: '즉시 지급분과 대기 중이던 {lp.LP-03.queued:prev}이 모두 나가 출금 {lp.LP-03.equity:prev}이 100% 완료됐습니다. LP-03은 지분 표에서 사라지고 남은 LP의 지분이 재계산됩니다 — 통보기간 0일, 전액 회수 5일.',
          en: 'The instant portion and the {lp.LP-03.queued:prev} that was queued have both gone out: {lp.LP-03.equity:prev} withdrawn, the whole stake. LP-03 leaves the register and the remaining shares are recalculated — no notice period, full exit in five days.',
        }, anchor: 'p-lp-rows',
        chips: [{ k: { ko: '출금 완료', en: 'Withdrawn' }, v: { ko: '{lp.LP-03.equity:prev}', en: '{lp.LP-03.equity:prev}' }, tone: 'ok' },
          { k: { ko: '통보기간', en: 'Notice' }, v: { ko: '0일', en: '0 days' } },
          { k: { ko: '전액 회수', en: 'Full exit' }, v: { ko: '5일', en: '5 days' } }]},
      { screen: 'lp', text: {
          ko: 'LP-03이 빠지면서 풀 규모가 {pool.netAssetValue:delta}으로 줄었습니다. 출금 재원은 만기 도래분에서 조달되었고 신규 선지급은 중단되지 않았습니다. 같은 물량을 더 적은 자본이 처리하므로 잔여 LP의 가동률과 수익률은 상승합니다.',
          en: 'With LP-03 gone the pool is down to {pool.netAssetValue:delta}. The payout came from maturing advances, and new advances never stopped. The same volume now sits on less capital, so utilisation and return rise for the LPs who stayed.',
        }, anchor: 'p-lp-funds',
        chips: [{ k: { ko: '풀 규모', en: 'Pool' }, v: { ko: '{pool.netAssetValue:delta}', en: '{pool.netAssetValue:delta}' } },
          { k: { ko: '서비스 중단', en: 'Service stopped' }, v: { ko: '없음', en: 'never' }, tone: 'ok' }]},
    ],
  },
  t5: {
    issuer: 'HYBRID',
    dirty: ['issuer', 'pub'],
    changed: [
      { screen: 'issuer', text: {
          ko: '만기 경과 → 검토 중 → 정상 상환. 세 단계를 지나는 동안 담보는 한 번도 차감되지 않았습니다.',
          en: 'Overdue → under review → repaid. The position passed through three states and collateral was never touched.',
        }, anchor: 'p-iss-pos',
        chips: [
          { k: { ko: '거친 상태', en: 'States passed' }, v: { ko: '3단계', en: '3' } },
          { k: { ko: '담보 차감', en: 'Collateral drawn' }, v: { ko: '0', en: '0' }, tone: 'ok' },
          { k: { ko: '최종 손실', en: 'Final loss' }, v: { ko: '0', en: '0' }, tone: 'ok' },
          { k: { ko: '', en: '' }, v: { ko: '', en: '' }, tx: 'AdvanceRepaid' },
        ]},
      { screen: 'issuer', text: {
          ko: '만기 경과 구간에는 신규 선지급만 막혔다가 상환과 함께 자동으로 풀립니다.',
          en: 'While it was overdue only new advances were blocked, and that lifted automatically on repayment.',
        }, anchor: 'p-iss-cmp',
        chips: [
          { k: { ko: '남은 여력', en: 'Headroom' }, v: { ko: '복구', en: 'restored' }, tone: 'ok' },
        ]},
    ],
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
          en: 'The position passes through three states and ends as repaid. The path stays on the record, under the state in the table.',
        }, anchor: 'p-iss-pos'},
      { screen: 'issuer', text: {
          ko: '담보 차감 0. 지연 동안 신규 선지급만 멈췄다가 상환과 함께 풀립니다 — 지연은 손실이 아니라 대기입니다.',
          en: 'No collateral drawn. The delay stopped only new advances, and that lifted on repayment — a delay is a wait, not a loss.',
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
          ko: '유휴자금을 운용 버킷에 배치했습니다. 상한 {param.idleDeployCapPct}% 이내입니다.',
          en: 'Idle funds were placed in the deployment bucket, inside the {param.idleDeployCapPct}% cap.',
        }, anchor: 'p-lp-donut',
        chips: [{ k: { ko: '운용 버킷', en: 'Deployed' },
                  v: { ko: '{pool.externalDeployed:delta}', en: '{pool.externalDeployed:delta}' } }]},
      { screen: 'lp', text: {
          ko: '그 외부 대출 시장의 가동률이 100%에 도달해 인출이 실패했습니다.',
          en: 'The external lending market it sits in hit 100% utilisation and the withdrawal failed.',
        }, anchor: 'p-lp-wd',
        chips: [{ k: { ko: '인출 가능', en: 'Withdrawable' },
                  v: { ko: '{pool.externalDeployed} → 0', en: '{pool.externalDeployed} → 0' }, tone: 'crit' }]},
      { screen: 'lp', text: {
          ko: '서킷 브레이커가 작동합니다. 운용 버킷으로의 신규 배치를 중단하고, 선지급은 핫 버킷 범위에서 계속됩니다 — 상한 {param.idleDeployCapPct}%가 실제로 지켜지는지가 여기서 확인됩니다.',
          en: 'The circuit breaker fires: no new money goes into the deployment bucket, and advances carry on within the hot bucket — this is where the {param.idleDeployCapPct}% cap proves itself.',
        }, anchor: 'p-lp-donut',
        chips: [
          { k: { ko: '핫 버킷', en: 'Hot bucket' }, v: { ko: '{pool.cashAvailable}', en: '{pool.cashAvailable}' } },
          { k: { ko: '선지급', en: 'Advances' }, v: { ko: '계속', en: 'carry on' }, tone: 'ok' },
        ]},
    ],
  },
  t7: {
    dirty: ['issuer', 'pub'],
    changed: [
      { screen: 'pub', text: {
          ko: '원장 반영만 재시도했습니다. 사용자 잔액은 한 번만 증가합니다.',
          en: 'Only the ledger write was retried. The cardholder\'s balance goes up exactly once.',
        }, anchor: 'p-pub-ev',
        chips: [
          { k: { ko: '중복 적립', en: 'Double credit' }, v: { ko: '없음', en: 'none' }, tone: 'ok' },
          { k: { ko: '', en: '' }, v: { ko: '', en: '' }, tx: 'LedgerCreditConfirmed' },
        ]},
    ],
    conclusion: [
      { screen: 'pub', text: {
          ko: '선지급 트랜잭션은 성공했으나 카드사 DB 반영이 실패했습니다.',
          en: 'The advance transaction succeeded on chain; writing it into the issuer\'s ledger failed.',
        },
        chips: [
          { k: { ko: '체인', en: 'Chain' }, v: { ko: '성공', en: 'succeeded' }, tone: 'ok' },
          { k: { ko: 'DB', en: 'Ledger' }, v: { ko: '실패', en: 'failed' }, tone: 'crit' },
        ]},
      { screen: 'pub', text: {
          ko: '선지급을 재실행하지 않습니다. tx hash로 확정 여부를 먼저 확인합니다.',
          en: 'The advance is not re-run. The tx hash is checked first to see whether it is already confirmed.',
        },
        chips: [
          { k: { ko: '재지급', en: 'Re-advance' }, v: { ko: '없음', en: 'none' }, tone: 'ok' },
        ]},
    ],
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
          ko: '장부 반영 확정 기록만 추가되고 누적 선지급액 {metrics.cumulativeAdvanced}는 그대로입니다.',
          en: 'Only a ledger-confirmation record is added; advances to date stay at {metrics.cumulativeAdvanced}.',
        }, anchor: 'p-pub-ev'},
      { screen: 'issuer', text: {
          ko: '포지션 표는 행이 늘지 않습니다. 변화가 없는 것이 정상 동작입니다.',
          en: 'The position table gains no rows. Nothing changing is the correct behaviour.',
        }, still: true},
    ],
  },
  t8: {
    dirty: ['val', 'pub'],
    changed: [
      { screen: 'pub', text: {
          ko: '중복 환불 ID 제출 — 컨트랙트가 거절했습니다. 이미 사용된 refundKey입니다.',
          en: 'A refund ID submitted twice — the contract rejected it. That refundKey is already spent.',
        }, anchor: 'p-pub-ev',
        chips: [{ k: { ko: '결과', en: 'Result' }, v: { ko: '거절', en: 'rejected' }, tone: 'crit' }]},
      { screen: 'pub', text: {
          ko: '미등록 발급사 서명 — 거절했습니다. Issuer Registry에 없습니다.',
          en: 'A signature from an unregistered issuer — rejected. It is not in the issuer registry.',
        }, anchor: 'p-pub-ev',
        chips: [{ k: { ko: '결과', en: 'Result' }, v: { ko: '거절', en: 'rejected' }, tone: 'crit' }]},
      { screen: 'pub', text: {
          ko: 'chainId·verifyingContract 불일치 서명 — 거절했습니다. 다른 체인에서 쓰인 서명의 재사용을 막습니다.',
          en: 'A signature whose chainId and verifying contract do not match — rejected. This is what stops a signature from another chain being replayed here.',
        }, anchor: 'p-pub-ev',
        chips: [
          { k: { ko: '수수료 청구', en: 'Fee charged' }, v: { ko: '0', en: '0' }, tone: 'ok' },
          { k: { ko: '', en: '' }, v: { ko: '', en: '' }, tx: 'AdvanceRejected' },
        ]},
    ],
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
          ko: '거절 {metrics.rejectedRequests}건이 기록됩니다. 거절 역시 기록으로 남아 사후 감사가 가능합니다.',
          en: '{metrics.rejectedRequests} rejections are recorded. A refusal is kept on the record too, so it can be audited afterwards.',
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
    changed: [
      { screen: 'issuer', text: {
          ko: '심사를 통과한 발급사 3곳을 등록했습니다. 신규 발급사는 램프업 적용으로 첫 {param.rampUpDays}일간 담보 대비 한도의 {param.rampUpPct}%만 개방됩니다.',
          en: 'Three issuers passed review and are registered. A new issuer runs in ramp-up: for its first {param.rampUpDays} days only {param.rampUpPct}% of its collateral-based limit opens.',
        }, anchor: 'p-iss-cmp',
        chips: [
          { k: { ko: '발급사', en: 'Issuers' }, v: { ko: '{derive.issuerCount:delta}', en: '{derive.issuerCount:delta}' }, tone: 'ok' },
          { k: { ko: '매입사', en: 'Acquirers' }, v: { ko: '{derive.acquirerCount:delta}', en: '{derive.acquirerCount:delta}' }, tone: 'ok' },
          { k: { ko: '신규 한도', en: 'New-issuer limit' }, v: { ko: '{param.rampUpPct:pct}', en: '{param.rampUpPct:pct}' } },
        ]},
      { screen: 'issuer', text: {
          ko: 'NOVA의 담보 {issuer.NOVA.collateralRemaining}은 담보 대비 한도 {param.issuerCollateralPct:pct} 기준으로 램프업을 적용하면 {issuer.NOVA.rampedCollateralLimit}입니다. 그런데 실제 유효 한도는 {issuer.NOVA.effectiveLimit}입니다 — 풀 여력이 얇아 담보가 아니라 풀 몫이 천장이기 때문입니다. 지금은 다섯 곳 모두 같은 천장에 걸려 담보 차이가 한도에 드러나지 않습니다.',
          en: 'NOVA\'s {issuer.NOVA.collateralRemaining} of collateral supports {issuer.NOVA.rampedCollateralLimit} once the {param.issuerCollateralPct:pct} collateral ratio and ramp-up are applied. Its actual effective limit is {issuer.NOVA.effectiveLimit} — the pool is thin, so the ceiling is its share of the pool, not its collateral. All five sit at that same ceiling, and their collateral differences do not show in the limits.',
        }, anchor: 'p-iss-cmp',
        chips: [
          { k: { ko: '램프업 후 담보 기준', en: 'Collateral basis, ramped' }, v: { ko: '{issuer.NOVA.rampedCollateralLimit}', en: '{issuer.NOVA.rampedCollateralLimit}' } },
          { k: { ko: '풀 몫', en: 'Pool share' }, v: { ko: '{derive.newIssuerCap}', en: '{derive.newIssuerCap}' } },
          { k: { ko: '유효 한도', en: 'Effective limit' }, v: { ko: '{issuer.NOVA.effectiveLimit}', en: '{issuer.NOVA.effectiveLimit}' } },
          { k: { ko: '제약', en: 'Binding' }, v: { ko: '풀', en: 'pool' }, tone: 'warn' },
        ]},
      { screen: 'lp', text: {
          ko: 'NOVA·MERIDIAN이 선지급을 개시해 풀의 유휴 현금이 사용됐습니다. 미상환 {pool.advancedOutstanding:delta}, 가동률 {metrics.utilizationPct:pct}로 목표 {param.lpTargetUtilizationPct:pct}를 넘었습니다. KITE는 남은 여력이 없어 등록만 된 상태로 대기합니다 — 2단계가 필요한 이유입니다.',
          en: 'NOVA and MERIDIAN start advancing and the pool\'s idle cash goes to work. Outstanding {pool.advancedOutstanding:delta}, utilisation {metrics.utilizationPct:pct} — past the {param.lpTargetUtilizationPct:pct} target. KITE is registered but waits, with no headroom left. That is what stage 2 is for.',
        }, anchor: 'p-lp-donut',
        chips: [
          { k: { ko: '미상환', en: 'Outstanding' }, v: { ko: '{pool.advancedOutstanding:delta}', en: '{pool.advancedOutstanding:delta}' }, tone: 'warn' },
          { k: { ko: '가동률', en: 'Utilisation' }, v: { ko: '{metrics.utilizationPct:pct}', en: '{metrics.utilizationPct:pct}' }, tone: 'crit' },
          { k: { ko: '목표', en: 'Target' }, v: { ko: '{param.lpTargetUtilizationPct:pct}', en: '{param.lpTargetUtilizationPct:pct}' } },
        ]},
      { screen: 'pub', text: {
          ko: '물량이 여러 매입사로 나뉘면서 최대 집중도가 {derive.acquirerConcentrationPct:pctdelta}로 떨어졌습니다. 분산 기준선 {param.acquirerExposurePct:pct} 아래로 처음 들어왔습니다.',
          en: 'Volume now spreads across several acquirers and the top concentration falls {derive.acquirerConcentrationPct:pctdelta}. It is under the {param.acquirerExposurePct:pct} spread guideline for the first time.',
        }, anchor: 'p-pub-bars',
        chips: [
          { k: { ko: '매입사 집중도', en: 'Acquirer concentration' }, v: { ko: '{derive.acquirerConcentrationPct:pctdelta}', en: '{derive.acquirerConcentrationPct:pctdelta}' }, tone: 'ok' },
          { k: { ko: '기준선', en: 'Guideline' }, v: { ko: '{param.acquirerExposurePct:pct}', en: '{param.acquirerExposurePct:pct}' } },
        ]},
    ],
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
    dirty: ['lp', 'issuer', 'pub'],
    changed: [
      { screen: 'lp', text: {
          ko: '1단계에서 미상환이 늘자 예치 한도가 함께 열렸습니다 — 평균 미상환 ÷ 목표 가동률 {param.lpTargetUtilizationPct:pct} = {metrics.lpDepositCap}. 예치금 {pool.lpDeposits:prev}을 빼면 여유 {derive.lpDepositRoom:prev}입니다.',
          en: 'Outstanding grew at stage 1 and the deposit cap opened with it — average outstanding ÷ the {param.lpTargetUtilizationPct:pct} target utilisation = {metrics.lpDepositCap}. Less the {pool.lpDeposits:prev} already deposited, that leaves {derive.lpDepositRoom:prev} of room.',
        }, anchor: 'p-lp-funds',
        chips: [
          { k: { ko: '예치 한도', en: 'Deposit cap' }, v: { ko: '{metrics.lpDepositCap}', en: '{metrics.lpDepositCap}' }, tone: 'ok' },
          { k: { ko: '현재 예치금', en: 'Deposited' }, v: { ko: '{pool.lpDeposits:prev}', en: '{pool.lpDeposits:prev}' } },
          { k: { ko: '여유', en: 'Room' }, v: { ko: '{derive.lpDepositRoom:prev}', en: '{derive.lpDepositRoom:prev}' } },
        ]},
      { screen: 'lp', text: {
          ko: 'LP 세 곳이 예치를 신청했습니다. 합계 {derive.depositRequestedTotal}이며 한도를 초과하는 금액은 수용하지 않습니다.',
          en: 'Three LPs applied, {derive.depositRequestedTotal} between them. Anything over the cap is not taken.',
        }, anchor: 'p-lp-rows'},
      { screen: 'lp', text: {
          ko: 'LP-04 {deposit.LP-04.requested} 중 {deposit.LP-04.accepted} 수용, {deposit.LP-04.rejected} 거절 — 단일 LP 집중 한도 {param.lpSingleCapPct:pct}({derive.lpSingleCap}) 초과.',
          en: 'LP-04 applied for {deposit.LP-04.requested}: {deposit.LP-04.accepted} accepted, {deposit.LP-04.rejected} refused — over the {param.lpSingleCapPct:pct} single-LP concentration cap of {derive.lpSingleCap}.',
        }, anchor: 'p-lp-rows',
        chips: [
          { k: { ko: '수용', en: 'Accepted' }, v: { ko: '{deposit.LP-04.accepted}', en: '{deposit.LP-04.accepted}' }, tone: 'ok' },
          { k: { ko: '거절', en: 'Refused' }, v: { ko: '{deposit.LP-04.rejected}', en: '{deposit.LP-04.rejected}' }, tone: 'crit' },
          { k: { ko: '사유', en: 'Reason' }, v: { ko: '집중 한도', en: 'single-LP cap' } },
        ]},
      { screen: 'lp', text: {
          ko: 'LP-05 {deposit.LP-05.requested} 중 {deposit.LP-05.accepted} 수용, {deposit.LP-05.rejected} 거절 — 단일 LP 집중 한도 {param.lpSingleCapPct:pct}({derive.lpSingleCap}) 초과.',
          en: 'LP-05 applied for {deposit.LP-05.requested}: {deposit.LP-05.accepted} accepted, {deposit.LP-05.rejected} refused — over the {param.lpSingleCapPct:pct} single-LP concentration cap of {derive.lpSingleCap}.',
        }, anchor: 'p-lp-rows',
        chips: [
          { k: { ko: '수용', en: 'Accepted' }, v: { ko: '{deposit.LP-05.accepted}', en: '{deposit.LP-05.accepted}' }, tone: 'ok' },
          { k: { ko: '거절', en: 'Refused' }, v: { ko: '{deposit.LP-05.rejected}', en: '{deposit.LP-05.rejected}' }, tone: 'crit' },
          { k: { ko: '사유', en: 'Reason' }, v: { ko: '집중 한도', en: 'single-LP cap' } },
        ]},
      { screen: 'lp', text: {
          ko: 'LP-06 {deposit.LP-06.requested} 중 {deposit.LP-06.accepted} 수용, {deposit.LP-06.rejected} 거절 — 예치 한도 소진.',
          en: 'LP-06 applied for {deposit.LP-06.requested}: {deposit.LP-06.accepted} accepted, {deposit.LP-06.rejected} refused — the deposit cap is used up.',
        }, anchor: 'p-lp-rows',
        chips: [
          { k: { ko: '수용', en: 'Accepted' }, v: { ko: '{deposit.LP-06.accepted}', en: '{deposit.LP-06.accepted}' }, tone: 'ok' },
          { k: { ko: '거절', en: 'Refused' }, v: { ko: '{deposit.LP-06.rejected}', en: '{deposit.LP-06.rejected}' }, tone: 'crit' },
          { k: { ko: '사유', en: 'Reason' }, v: { ko: '예치 한도', en: 'deposit cap' } },
        ]},
      { screen: 'lp', text: {
          ko: '거절하지 않았다면 손실 총액은 그대로인데 가동률과 개별 LP 수익률만 같은 비율로 희석됩니다.',
          en: 'Accept it all and total losses do not move — only utilisation and every LP\'s return dilute, by the same proportion.',
        }, anchor: 'p-lp-donut',
        chips: [
          { k: { ko: '가동률', en: 'Utilisation' }, v: { ko: '{metrics.utilizationPct:pct}', en: '{metrics.utilizationPct:pct}' } },
          { k: { ko: '손실 총액', en: 'Total losses' }, v: { ko: '불변', en: 'unchanged' } },
        ]},
      { screen: 'issuer', text: {
          ko: '풀이 커지면서 가동률이 {metrics.utilizationPct:pct}로 내려왔고, 발급사 유효 한도도 함께 올랐습니다. 담보를 다시 넣지 않아도 풀이 커지면 한도가 따라옵니다.',
          en: 'A larger pool brings utilisation down to {metrics.utilizationPct:pct} and lifts the issuers\' effective limits with it. Nobody posted more collateral; the pool grew and the headroom followed.',
        }, anchor: 'p-iss-cmp',
        chips: [
          { k: { ko: '가동률', en: 'Utilisation' }, v: { ko: '{metrics.utilizationPct:pct}', en: '{metrics.utilizationPct:pct}' }, tone: 'ok' },
          { k: { ko: 'HYBRID 한도', en: 'HYBRID limit' }, v: { ko: '{issuer.HYBRID.effectiveLimit:delta}', en: '{issuer.HYBRID.effectiveLimit:delta}' }, tone: 'ok' },
        ]},
      { screen: 'pub', text: {
          ko: '자본은 처리량을 사고 분산은 위험을 줄입니다. 그래서 자본은 분산이 먼저 늘어난 만큼만 받습니다.',
          en: 'Capital buys throughput; diversification reduces risk. So capital is taken only as far as diversification has already grown.',
        }, anchor: 'p-pub-bars',
        chips: [
          { k: { ko: '거절 합계', en: 'Refused in total' }, v: { ko: '{derive.depositRejectedTotal}', en: '{derive.depositRejectedTotal}' }, tone: 'crit' },
          { k: { ko: 'LP 수', en: 'LPs' }, v: { ko: '{derive.lpCount}', en: '{derive.lpCount}' }, tone: 'ok' },
        ]},
    ],
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
          ko: '손실률과 손익분기 {param.breakEvenPct:pct}를 비교해보세요. 사고가 1년치 물량에 겹쳐 난 스트레스 구간이라 위에 있습니다 — 평시처럼 단일 손실 1건이면 0.27%로 아래입니다.',
          en: 'Compare the loss rate with the {param.breakEvenPct:pct} break-even. It sits above because incidents were stacked on top of a year\'s volume in a stress run — with a single ordinary loss it is 0.27%, below the line.',
        }, anchor: 'p-pub-bars'},
    ],
  },
};
