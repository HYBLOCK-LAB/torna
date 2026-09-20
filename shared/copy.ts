/**
 * Torna — UI copy
 *
 * Every string that appears on screen lives here. Do not hardcode copy in JSX.
 *
 * English is the product language: the layout is sized for `en`, and `ko` is a
 * stretch feature we may expose behind a toggle before submission.
 * Because both live here from day one, adding that toggle later is a 30 minute job.
 *
 * Owner: A(서진)
 */

export type Lang = 'en' | 'ko';

export interface Phrase {
  en: string;
  ko: string;
}

export const COPY = {
  // ── Shell ───────────────────────────────────────────────
  'app.title':      { en: 'Torna', ko: 'Torna' },
  'app.subtitle':   { en: 'Refund advance console',
                      ko: '환불 선지급 콘솔' },
  'app.lede':       { en: 'A shared pool advances confirmed refunds to card issuers, so spending power is restored in seconds.',
                      ko: '확정된 환불금을 공동 풀이 카드사에 선지급해 구매력을 즉시 복원합니다.' },
  'app.mockNotice': { en: 'Design mockup. Figures are demo assumptions, not real transactions.',
                      ko: '설계용 목업. 수치는 데모 가정이며 실제 거래가 아닙니다.' },

  // ── Screens ─────────────────────────────────────────────
  'screen.user':    { en: 'Cardholder app',  ko: '사용자 앱' },
  'screen.issuer':  { en: 'Issuer console',  ko: '발급사 콘솔' },
  'screen.lp':      { en: 'LP dashboard',    ko: 'LP 대시보드' },
  'screen.verifier':{ en: 'Verifier',        ko: '검증자' },
  'screen.public':  { en: 'Public view',     ko: '공개 뷰' },

  'screen.group.consumer': { en: 'What the cardholder sees', ko: '소비자가 보는 것' },
  'screen.group.backend':  { en: 'What happens behind it',   ko: '뒤에서 일어나는 일' },

  // ── Timeline navigation ─────────────────────────────────
  'nav.viewTimepoint': { en: 'View this point',   ko: '이 시점 보기' },
  'nav.loading':       { en: 'Loading…',          ko: '불러오는 중…' },
  'nav.soFar':         { en: 'Up to here',        ko: '여기까지의 경과' },
  'nav.confirm':       { en: 'Check it →',        ko: '확인하기 →' },
  'nav.reviewed':      { en: '✓ Review again',    ko: '✓ 다시 보기' },
  'nav.noChange':      { en: 'No change',         ko: '변화 없음' },
  'nav.viewing':      { en: 'Viewing now',        ko: '보는 중' },
  'nav.done':         { en: 'Viewed',             ko: '확인 완료' },
  'nav.timepoints':   { en: 'Timepoints',        ko: '시점' },
  'nav.viewed':       { en: 'viewed',            ko: '열람' },
  'nav.rewind':        { en: '↺ Rewind to this point', ko: '↺ 이 시점으로 되돌리기' },

  // ── Cardholder experience (never say "timepoint" here) ──
  'user.replay':       { en: '↺ Replay the refund experience', ko: '↺ 환불 체험 다시 보기' },
  'user.autoplay':     { en: '▶ Play the whole flow',          ko: '▶ 전체 자동 재생' },
  'user.back':         { en: '← Go back',                      ko: '← 돌아가기' },
  'user.replayNotice': { en: 'You are replaying the refund experience. The operations screens show the same early state. Going back restores everything, including what you have already reviewed.',
                         ko: '환불 체험을 다시 보는 중입니다. 지금은 운영 화면도 체험 직후 상태를 함께 보여줍니다. 돌아가면 수치와 확인 기록까지 그대로 복원됩니다.' },
  'user.sameTx':       { en: 'The same transaction is shown again — one refund is only ever credited once.',
                         ko: '같은 트랜잭션이 다시 표시됩니다 — 같은 환불 건은 한 번만 반영됩니다.' },

  // ── Timepoint labels ────────────────────────────────────
  'tp.t0':  { en: 'Cardholder refund experience',  ko: '사용자 앱 환불 체험' },
  'tp.t1':  { en: 'One year of normal operation',  ko: '1년 정상 운영' },
  'tp.t2':  { en: 'Confirmed loss → waterfall',    ko: '최종 손실 → 워터폴' },
  'tp.t3':  { en: 'Correlated loss → cap triggered', ko: '상관 손실 → 상한 발동' },
  'tp.t3b': { en: 'Recovery settlement',           ko: '회수 정산' },
  'tp.t4':  { en: 'LP withdrawal and liquidity',   ko: 'LP 출금 · 유동성' },
  'tp.t5':  { en: 'Delayed but repaid',            ko: '지연 후 정상 상환' },
  'tp.t6':  { en: 'External venue frozen',         ko: '외부 운용처 동결' },
  'tp.t7':  { en: 'Chain succeeded, ledger failed', ko: '체인 성공 · DB 실패' },
  'tp.t8':  { en: 'Invalid requests rejected',     ko: '부정 요청 거절' },
  'tp.t9':  { en: 'More issuers join',             ko: '발급사가 늘어날 때' },
  'tp.t9b': { en: 'Capital arrives',               ko: '자본이 몰려올 때' },

  // ── Categories ──────────────────────────────────────────
  'cat.experience': { en: 'Cardholder experience', ko: '사용자 체험' },
  'cat.normal': { en: 'Normal operation',        ko: '평상시 운영' },
  'cat.fund':   { en: 'Capital risk',            ko: '자금 위험' },
  'cat.ops':    { en: 'Incidents and recovery',  ko: '운영 사고·복구' },
  'cat.verify': { en: 'Verification and refusal', ko: '검증·거절' },
  'cat.grow':   { en: 'Growth and balance',      ko: '확장과 균형' },

  // ── Metrics ─────────────────────────────────────────────
  'metric.nav':          { en: 'LP net asset value', ko: 'LP 평가액' },
  'metric.outstanding':  { en: 'Outstanding',        ko: '미상환' },
  'metric.reserve':      { en: 'Protocol reserve',   ko: '프로토콜 준비금' },
  'metric.collateral':   { en: 'Issuer collateral',  ko: '발급사 담보' },
  'metric.effectiveLimit': { en: 'Effective limit',  ko: '유효 한도' },
  'metric.utilization':  { en: 'Utilization',        ko: '가동률' },
  'metric.lossRate':     { en: 'Loss rate',          ko: '손실률' },
  'metric.breakeven':    { en: 'Break-even 0.35%',   ko: '손익분기 0.35%' },
  'metric.capHeld':      { en: 'Held above cap',     ko: '상한 유예' },
  'metric.repayRate':    { en: 'Repayment rate',     ko: '정상 상환률' },

  // ── Position states ─────────────────────────────────────
  'state.Registered':       { en: 'Registered',   ko: '등록됨' },
  'state.Advanced':         { en: 'Advanced',     ko: '선지급됨' },
  'state.Repaid':           { en: 'Repaid',       ko: '정상 상환' },
  'state.Overdue':          { en: 'Overdue',      ko: '만기 경과' },
  'state.Review':           { en: 'Under review', ko: '검토 중' },
  'state.CoveredLoss':      { en: 'Covered loss', ko: '보장 손실' },
  'state.CapHeld':          { en: 'Held at cap',  ko: '상한 유예' },
  'state.RecoveryRecorded': { en: 'Recovered',    ko: '회수 정산' },

  // ── Issuer states ───────────────────────────────────────
  'issuerState.Active':       { en: 'Active',       ko: 'Active' },
  'issuerState.MarginCall':   { en: 'Margin call',  ko: 'MarginCall' },
  'issuerState.Suspended':    { en: 'Suspended',    ko: 'Suspended' },
  'issuerState.Deregistered': { en: 'Deregistered', ko: 'Deregistered' },
} as const satisfies Record<string, Phrase>;

export type CopyKey = keyof typeof COPY;

/** t('nav.viewTimepoint', lang) */
export function t(key: CopyKey, lang: Lang = 'en'): string {
  return COPY[key][lang];
}
