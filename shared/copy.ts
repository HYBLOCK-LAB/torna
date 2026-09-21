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

import { PARAMS } from './params';

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
  'nav.reading':       { en: 'Reading',            ko: '읽는 중' },
  'nav.viewHint':      { en: 'Open this point and what changed — and where to check it — continues here.',
                         ko: '이 시점을 열면 무엇이 바뀌었고 어디서 확인하는지가 여기에 이어집니다.' },
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
  'user.backNote':     { en: 'This is the cardholder app, and it replays on its own. The operating screens are still where you left them, at {id}.',
                         ko: '사용자 앱 화면입니다. 체험은 이 화면에서 다시 돌려볼 수 있고, 운영 화면은 {id}까지 진행한 상태 그대로 있습니다.' },
  'user.backToOps':    { en: '← Back · the screens as they stand at {id}',
                         ko: '← 돌아가기 · {id}까지 진행한 화면' },
  'user.replayOffer':  { en: 'This screen is the cardholder app as it stands after {id}. You can replay the refund run from the beginning and come straight back to {id}.',
                         ko: '이 화면은 {id}까지 진행된 상태의 사용자 앱입니다. 환불 체험을 처음부터 다시 보고 {id}으로 그대로 돌아올 수 있습니다.' },
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

  'err.bundle':      { en: 'Bundle error',   ko: '번들 오류' },
  'err.bundleHelp':  { en: 'Run pnpm verify:bundle shared/snapshots/sample for details.',
                       ko: 'pnpm verify:bundle shared/snapshots/sample 로 원인을 확인하세요.' },
  'bf.designPoint':  { en: 'Design point',   ko: '설계 포인트' },
  'bf.situation':    { en: 'Situation',      ko: '상황' },
  'bf.why':          { en: 'Why it matters', ko: '왜 중요한가' },
  'bf.notBuilt':     { en: 'Not built yet.', ko: '아직 만들지 않았습니다.' },

  'bf.close':        { en: 'Close ✕',        ko: '닫기 ✕' },
  'bf.allDone':      { en: 'All reviewed',   ko: '확인 완료' },
  'bf.changed':      { en: 'What changed',   ko: '바뀐 것' },
  'bf.watch':        { en: 'What to look at', ko: '봐야 할 것' },
  'bf.results':      { en: 'Results · check them screen by screen',
                       ko: '실행 결과 · 화면별로 확인하세요' },
  'bf.folded':       { en: 'Results · {n} screens reviewed',
                       ko: '실행 결과 · {n}개 화면 확인 완료' },
  'bf.onThisScreen': { en: 'At {id}, on this screen', ko: '{id} · 이 화면에서' },

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

  // ════════════════════════════════════════════════════════════
  // Screen text, ported from the mockup.
  //
  // Everything here is fixed: it reads the same at t0 and at t9b. Text that
  // changes with the timepoint lives in shared/narrative.ts instead.
  //
  // Some values carry {param.*} placeholders — the same resolver that runs on
  // narrative strings runs on these, so the rule table and the frozen
  // parameters in params.ts can never drift apart.
  //
  // English is the product language and the layout is sized for it.
  // ════════════════════════════════════════════════════════════

  // ── Panel titles ────────────────────────────────────────────
  'panel.pipeline':     { en: 'Processing stages',        ko: '처리 단계' },
  'panel.issuerCompare':{ en: 'Issuers compared',         ko: '발급사 비교' },
  'panel.issuerPicked': { en: 'Selected issuer',          ko: '선택한 발급사' },
  'panel.positions':    { en: 'Refund positions',         ko: '환불 포지션' },
  'panel.yearSummary':  { en: 'One year, summarised',     ko: '누적 운영 요약' },
  'panel.contractFunds':{ en: 'Funds held by the contract', ko: '컨트랙트 보유 자금' },
  'panel.lpComposition':{ en: 'LP deposit composition',   ko: 'LP 예치금 구성' },
  'panel.withdrawable': { en: 'Available to withdraw',    ko: '출금 가능액' },
  'panel.absorption':   { en: 'Loss absorption order',    ko: '손실 흡수 순서' },
  'panel.lpHoldings':   { en: 'LP holdings',              ko: 'LP 지분' },
  'panel.verifier':     { en: 'Verifier console',         ko: '검증자 콘솔' },
  'panel.exclusions':   { en: 'Excluded from coverage',   ko: '보장 제외 사유' },
  'panel.riskLoss':     { en: 'Risk and loss',            ko: '위험과 손실' },
  'panel.rules':        { en: 'Operating rules',          ko: '운영 규칙' },
  'panel.members':      { en: 'Member issuers',           ko: '참여 기관' },
  'panel.events':       { en: 'On-chain events',          ko: '온체인 이벤트' },
  'panel.cardholder':   { en: 'HYBRID Travel Card — customer app', ko: 'HYBRID Travel Card — 고객 화면' },
  'panel.justHappened': { en: 'What just happened',       ko: '방금 일어난 일' },

  'panel.poolWhole':    { en: 'pool-wide',                ko: '풀 전체' },
  'panel.assumed':      { en: 'assumed',                  ko: '가정값' },

  // ── Panel descriptions ──────────────────────────────────────
  'hint.pipeline':      { en: 'From the moment a refund message arrives to the moment the balance shows in the app. The demo measures its speed over this stretch.',
                          ko: '환불 메시지를 받은 때부터 사용자 앱에 잔액이 뜰 때까지의 구간입니다. 데모의 속도 측정도 여기서 시작합니다.' },
  'hint.issuerCompare': { en: 'Effective limit = min(collateral ÷ {param.issuerCollateralPct}%, pool capacity × max(concentration cap {param.issuerConcentrationPct}%, 1 ÷ issuer count)). With few issuers the equal share binds; with many, the concentration cap does.',
                          ko: '유효 한도 = min(담보 ÷ {param.issuerCollateralPct}%, 풀 가능액 × max(집중 한도 {param.issuerConcentrationPct}%, 1 ÷ 발급사 수)). 기관이 적을 땐 균등분배 몫이, 많아지면 집중 한도가 상한이 됩니다.' },
  'hint.issuerPicked':  { en: 'The figures and the gauge below are for the selected issuer only.',
                          ko: '아래 숫자와 게이지는 선택한 발급사 하나만 보여줍니다.' },
  'hint.yearSummary':   { en: 'One year of operation before this demo. It was not run refund by refund — it is calculated from an assumed {param.idleDeployCapPct}% utilisation on a {param.avgTermDays}-day cycle.',
                          ko: '이 데모 이전 1년간의 운영 결과입니다. 실제로 건별로 돌린 것이 아니라 가동률 {param.idleDeployCapPct}%·평균 {param.avgTermDays}일 회전을 가정해 계산한 요약입니다.' },
  'hint.contractFunds': { en: 'Three kinds of money with three different owners sit in one contract. The buckets below break down LP net asset value.',
                          ko: '소유권이 다른 세 종류의 돈이 한 컨트랙트에 있습니다. 아래 버킷은 LP 평가액을 분해한 것입니다.' },
  'hint.lpComposition': { en: 'Deployment cap {param.idleDeployCapPct}% — the pool has to keep operating even with every deployed dollar locked.',
                          ko: '운용 상한 {param.idleDeployCapPct}% — 운용분이 전부 묶여도 정상 운영이 가능해야 한다는 원칙에서 나온 값입니다.' },
  'hint.withdrawable':  { en: 'Normally a withdrawal pays out at once. If a loss is under review, only that potential exposure is locked.',
                          ko: '평시에는 즉시 출금합니다. 손실 심사가 진행 중인 건이 있으면 그 잠재 부담분만 묶입니다.' },
  'hint.absorption':    { en: 'Not a fixed split per refund, but a question of which capital is hit first. The reserve starts from a {param.reserveSeed} launch seed.',
                          ko: '건별 고정 분담이 아니라 어느 자본이 먼저 맞는지의 문제입니다. 준비금은 출범 시드 {param.reserveSeed}에서 시작합니다.' },
  'hint.verifier':      { en: 'A power held separately from the issuer. Time passing does not, on its own, confirm a loss.',
                          ko: '발급사와 분리된 권한입니다. 시간이 지났다는 사실만으로는 손실이 확정되지 않습니다.' },
  'hint.exclusions':    { en: 'If any of these applies, the pool pays nothing and the issuer carries it in full.',
                          ko: '아래에 해당하면 풀이 부담하지 않고 발급사가 전액 책임집니다.' },
  'hint.riskLoss':      { en: 'Losses are not hidden. Which capital absorbed how much is published too.',
                          ko: '손실은 감추지 않고, 어느 자본이 얼마나 부담했는지까지 공개합니다.' },
  'hint.rules':         { en: 'Fixed in the contract. Changing one goes through an on-chain proposal.',
                          ko: '컨트랙트에 고정된 값입니다. 변경은 온체인 제안을 거칩니다.' },
  'hint.members':       { en: 'Membership is public. Per-issuer outstanding is not.',
                          ko: '참여 발급사는 공개하되, 기관별 미상환 금액은 공개하지 않습니다.' },
  'hint.events':        { en: 'Indexer data never triggers a payout on its own. Balances move on a confirmed transaction receipt.',
                          ko: '인덱서 데이터만으로 지급을 실행하지 않습니다. 잔액 반영의 기준은 확정된 트랜잭션 receipt입니다.' },
  'hint.publicLede':    { en: 'Shared pool for card refund advances · public status',
                          ko: '카드 환불 선지급 공동 풀 · 공개 현황' },
  'hint.cardholder':    { en: 'A card app from a fictional issuer. No wallet, no USDC, no gas appears anywhere, and the currency shown is always USD.',
                          ko: '가상 발급사의 카드 앱입니다. 지갑·USDC·가스비는 어디에도 나타나지 않고, 표시 통화는 항상 USD입니다.' },
  'hint.justHappened':  { en: 'Only changes visible on the cardholder screen are recorded here.',
                          ko: '사용자 화면에서 일어난 변화만 기록합니다.' },
  'note.pastReturns':   { en: 'Returns shown are realised history and do not guarantee future performance. Liquidity provision is open to institutions.',
                          ko: '표시된 수익률은 과거 실현 수치이며 미래 수익을 보장하지 않습니다. 유동성 공급 참여는 기관을 대상으로 합니다.' },

  // ── Section labels ──────────────────────────────────────────
  'sec.pool':           { en: 'Pool',                     ko: '풀 현황' },
  'sec.performance':    { en: 'Performance',              ko: '운영 실적' },
  'sec.cumulative':     { en: 'cumulative',               ko: '누적' },
  'sec.capitalSits':    { en: 'Where the capital sits',   ko: '자본이 지금 어디에 있는가' },
  'sec.ofNav':          { en: 'share of LP net asset value', ko: 'LP 평가액 기준' },
  'sec.navTrend':       { en: 'LP net asset value over time', ko: 'LP 평가액 추이' },
  'sec.roomToJoin':     { en: 'Room to join',             ko: '참여와 여력' },
  'sec.roomToJoinSub':  { en: 'what anyone considering joining checks first',
                          ko: '들어오려는 쪽이 자기 자리를 먼저 확인합니다' },
  'sec.lossSplit':      { en: 'How the confirmed loss was carried', ko: '확정 손실의 부담 구조' },
  'sec.marginUsage':    { en: 'Margin usage',             ko: '마진 사용률' },
  'sec.view':           { en: 'View',                     ko: '보기' },

  // ── Table headers ───────────────────────────────────────────
  'th.issuer':          { en: 'Issuer',            ko: '발급사' },
  'th.regionAcquirer':  { en: 'Region · acquirer', ko: '지역·매입사' },
  'th.region':          { en: 'Region',            ko: '지역' },
  'th.collateral':      { en: 'Collateral',        ko: '예치금' },
  'th.effectiveLimit':  { en: 'Effective limit',   ko: '유효 한도' },
  'th.outstanding':     { en: 'Outstanding',       ko: '미상환' },
  'th.marginUsage':     { en: 'Margin usage',      ko: '마진 사용률' },
  'th.state':           { en: 'State',             ko: '상태' },
  'th.refundId':        { en: 'Refund',            ko: '환불 ID' },
  'th.acquirer':        { en: 'Acquirer',          ko: '매입사' },
  'th.principal':       { en: 'Principal',         ko: '원금' },
  'th.fee':             { en: 'Fee',               ko: '수수료' },
  'th.lossShare':       { en: 'Share if lost',     ko: '손실 시 부담분' },
  'th.tx':              { en: 'Tx',                ko: '트랜잭션' },
  'th.fund':            { en: 'Fund',              ko: '자금' },
  'th.amount':          { en: 'Amount',            ko: '금액' },
  'th.ownedBy':         { en: 'Owned by',          ko: '소유' },
  'th.purpose':         { en: 'Purpose',           ko: '용도' },
  'th.lp':              { en: 'LP',                ko: 'LP' },
  'th.deposit':         { en: 'Deposited',         ko: '예치' },
  'th.share':           { en: 'Share',             ko: '지분' },
  'th.feeAccrued':      { en: 'Fees accrued',      ko: '누적 수수료' },
  'th.lossApplied':     { en: 'Loss applied',      ko: '손실 반영' },
  'th.nav':             { en: 'Net value',         ko: '평가액' },
  'th.elapsed':         { en: 'Elapsed',           ko: '경과' },
  'th.evidence':        { en: 'Evidence',          ko: '증빙' },
  'th.ruling':          { en: 'Ruling',            ko: '판정' },
  'th.parameter':       { en: 'Parameter',         ko: '파라미터' },
  'th.value':           { en: 'Value',             ko: '값' },
  'th.meaning':         { en: 'What it does',      ko: '의미' },
  'th.registered':      { en: 'Registered',        ko: '등록' },
  'th.block':           { en: 'Block',             ko: '블록' },
  'th.event':           { en: 'Event',             ko: '이벤트' },
  'th.target':          { en: 'Target',            ko: '대상' },

  // ── Tiles ───────────────────────────────────────────────────
  'tile.tvl':           { en: 'Total value locked',  ko: '풀 규모 (TVL)' },
  'tile.outstanding':   { en: 'Outstanding',         ko: '미상환 잔액' },
  'tile.utilization':   { en: 'Utilisation',         ko: '가동률' },
  'tile.instantOut':    { en: 'Withdrawable now',    ko: '즉시 출금 가능' },
  'tile.ofNav':         { en: 'of net asset value',  ko: '평가액 대비' },
  'tile.avgTerm':       { en: 'Average advance term', ko: '평균 선지급 만기' },
  'tile.days':          { en: 'days',                ko: '일' },
  'tile.advancedTotal': { en: 'Advanced to date',    ko: '누적 선지급' },
  'tile.refundCount':   { en: 'Refunds',             ko: '누적 건수' },
  'tile.repayRate':     { en: 'Repayment rate',      ko: '정상 상환률' },
  'tile.rejected':      { en: 'Requests rejected',   ko: '요청 거절' },
  'tile.settleToSpend': { en: 'Refund confirmed → balance restored', ko: '환불 확정 → 잔액 반영' },
  'tile.lastOne':       { en: 'most recent',         ko: '최근 1건' },
  'tile.lossConfirmed': { en: 'Confirmed loss',      ko: '확정 손실' },
  'tile.lossRate':      { en: 'Loss rate',           ko: '손실률' },
  'tile.breakeven':     { en: 'break-even 0.35%',    ko: '손익분기 0.35%' },
  'tile.capHeld':       { en: 'Held above cap',      ko: '상한 유예' },
  'tile.reserveLeft':   { en: 'Reserve balance',     ko: '준비금 잔액' },
  'tile.lpRealised':    { en: 'LP realised return',  ko: 'LP 실현 수익률' },
  'tile.annualPast':    { en: 'annualised · past',   ko: '연환산·과거' },
  'tile.reviewToLoss':  { en: 'Review opened → loss confirmed', ko: '검토 착수 → 손실 확정' },
  'tile.memberIssuers': { en: 'Member issuers',      ko: '참여 발급사' },
  'tile.memberLps':     { en: 'Liquidity providers', ko: '참여 LP' },
  'tile.acquirerConc':  { en: 'Acquirer concentration', ko: '매입사 집중도' },
  'tile.spreadOnly':    { en: 'spread, not a limit', ko: '분산 지표' },
  'tile.topAcquirer':   { en: 'Largest acquirer exposure', ko: '최대 매입사 노출' },
  'tile.againstLimit':  { en: 'against the limit',   ko: '한도 대비' },
  'tile.capacityLeft':  { en: 'Advance capacity left', ko: '남은 선지급 캐파' },
  'tile.newIssuerCap':  { en: 'Ceiling for a new issuer', ko: '신규 발급사 한도 상한' },
  'tile.lpRoom':        { en: 'LP deposit room',     ko: 'LP 예치 여유' },
  'tile.count':         { en: 'Refunds handled',     ko: '처리 건수' },
  'tile.feeTotal':      { en: 'Fees accrued',        ko: '누적 수수료' },
  'tile.lpShareOfFee':  { en: 'To LPs',              ko: 'LP 배분' },
  'tile.lpAnnual':      { en: 'LP annualised',       ko: 'LP 연환산' },
  'tile.reserveAccrued':{ en: 'To reserve',          ko: '준비금 적립' },
  'tile.marginNeeded':  { en: 'Margin required {param.issuerCollateralPct}%', ko: '필요 마진 {param.issuerCollateralPct}%' },
  'tile.headroom':      { en: 'Headroom left',       ko: '남은 여력' },
  'tile.places':        { en: '',                    ko: '곳' },
  'tile.items':         { en: '',                    ko: '건' },

  // ── Pipeline stages ─────────────────────────────────────────
  'pipe.1': { en: 'Refund message received', ko: '환불 메시지 수신' },
  'pipe.2': { en: 'Signature and duplicate checks', ko: '서명·중복 검증' },
  'pipe.3': { en: 'Advance on chain',        ko: '온체인 선지급' },
  'pipe.4': { en: 'Ledger updated',          ko: '원장 반영' },
  'pipe.5': { en: 'Shown in the app',        ko: '앱 표시' },
  'pipe.step': { en: 'Step {n}',              ko: '{n}단계' },

  'pub.deployFrozen':   { en: 'The deployed portion is frozen right now. The cap is {param.idleDeployCapPct}%, so the pool keeps operating even with all of it locked.',
                          ko: '외부 운용분은 현재 동결 상태입니다. 유휴 운용 상한이 {param.idleDeployCapPct}%이므로 전부 묶여도 정상 운영이 가능합니다.' },
  'pub.lossSplitEmpty': { en: 'No loss has been confirmed yet. Run a capital-risk timepoint and this is where it lands, in this order.',
                          ko: '아직 확정된 손실이 없습니다. 자금 위험 시나리오를 실행하면 손실이 이 순서로 여기에 쌓입니다.' },
  'pub.evEmpty':        { en: 'No events at this timepoint.', ko: '이 시점에는 기록된 이벤트가 없습니다.' },
  'val.empty':          { en: 'Nothing is awaiting a ruling. Run the delay or loss timepoint and the case arrives here.',
                          ko: '판정 대기 건이 없습니다. 지연 또는 손실 시나리오를 실행하면 이 화면으로 넘어옵니다.' },
  'val.note':           { en: 'The ruling sits with the verifiers, not the issuer. A loss is a ruling, never the passing of a date — that separation is what keeps an issuer from writing off its own exposure.',
                          ko: '판정 권한은 발급사와 분리되어 있습니다. 손실은 날짜가 지나서가 아니라 판정으로 확정되며, 그 분리가 발급사의 자기 면책을 막습니다.' },

  // ── Contract funds ──────────────────────────────────────────
  'fund.lpDeposits':      { en: 'LP deposits',       ko: 'LP 예치금' },
  'fund.lpDeposits.who':  { en: 'LP shares',         ko: 'LP 지분' },
  'fund.lpDeposits.use':  { en: 'Funds advances — broken into the buckets below', ko: '선지급 재원 — 아래 버킷으로 분해' },
  'fund.reserve':         { en: 'Protocol reserve',  ko: '프로토콜 준비금' },
  'fund.reserve.who':     { en: 'Nobody\'s',         ko: '누구의 것도 아님' },
  'fund.reserve.use':     { en: 'Absorbs loss only · never funds an advance', ko: '손실 흡수 전용 · 선지급에 쓰지 않음' },
  'fund.margin':          { en: 'Issuer margin',     ko: '발급사 마진' },
  'fund.margin.who':      { en: 'Issuers',           ko: '발급사' },
  'fund.margin.use':      { en: 'Remaining collateral · first to absorb a loss', ko: '잔여 담보 · 1순위 손실 흡수' },

  // ── Liquidity buckets (donut) ───────────────────────────────
  'bucket.hot':       { en: 'Hot · ready to advance', ko: '핫 버킷 · 즉시 선지급' },
  'bucket.deployed':  { en: 'Deployed · base yield',  ko: '운용 버킷 · 기본수익' },
  'bucket.frozen':    { en: 'Deployed · frozen',      ko: '운용 버킷 · 동결됨' },
  'bucket.advanced':  { en: 'Advanced · principal out', ko: '선지급 잔액 · 나가 있는 원금' },
  'bucket.navTotal':  { en: 'LP net asset value (the base)', ko: 'LP 평가액 (기준 총액)' },
  'bucket.deployCap': { en: 'Deployment cap {param.idleDeployCapPct}%', ko: '운용 상한 {param.idleDeployCapPct}%' },

  // ── Withdrawal buckets ──────────────────────────────────────
  'wd.instant':       { en: 'Payable now',      ko: '즉시 출금 가능' },
  'wd.instant.sub':   { en: 'held as cash in the contract', ko: '컨트랙트에 현금으로 있는 몫' },
  'wd.queued':        { en: 'Waiting on liquidity', ko: '유동성 대기' },
  'wd.locked':        { en: 'Locked under review', ko: '심사 중 제한' },
  'wd.total':         { en: 'Total',            ko: '합계' },
  'wd.totalSub':      { en: '= LP net asset value (deposits + fees − losses)', ko: '= LP 평가액 (예치금 + 누적 수수료 − 손실)' },

  // ── Absorption layers ───────────────────────────────────────
  'fall.margin':      { en: 'Issuer margin',     ko: '발급사 마진' },
  'fall.margin.sub':  { en: 'blocks moral hazard', ko: '도덕적 해이 차단' },
  'fall.reserve':     { en: 'Protocol reserve',  ko: '프로토콜 준비금' },
  'fall.reserve.sub': { en: 'absorbs scattered losses', ko: '산발적 손실 흡수' },
  'fall.lp':          { en: 'LP senior',         ko: 'LP 시니어' },
  'fall.lp.sub':      { en: 'carries only what is left', ko: '남은 손실만 부담' },
  'fall.cap':         { en: 'Held above cap',    ko: '상한 유예' },
  'fall.cap.sub':     { en: 'above the single-event cap', ko: '단일 사건 상한 초과분' },

  // ── Issuer gauge legend ─────────────────────────────────────
  'gauge.used':   { en: 'Margin in use',        ko: '사용 중 마진' },
  'gauge.left':   { en: 'Collateral remaining', ko: '남은 담보' },
  'gauge.room':   { en: 'Room for more advances', ko: '추가 선지급 여력' },

  // ── Operating rules table ───────────────────────────────────
  'rule.collateral':        { en: 'Issuer collateral ratio', ko: '발급사 담보율' },
  'rule.collateral.v':      { en: '{param.issuerCollateralPct}%', ko: '{param.issuerCollateralPct}%' },
  'rule.collateral.m':      { en: 'Against total outstanding · one of the two constraints that set the effective limit',
                              ko: '미상환 총액 대비 · 유효 한도를 정하는 두 제약 중 하나' },
  'rule.lossShare':         { en: 'Issuer loss share', ko: '발급사 손실 부담률' },
  'rule.lossShare.v':       { en: '{param.issuerLossSharePct}%', ko: '{param.issuerLossSharePct}%' },
  'rule.lossShare.m':       { en: 'First in line on any loss · sets what is paid, not what is allowed',
                              ko: '손실 발생 시 1순위 부담 · 한도가 아니라 부담을 정하는 값' },
  'rule.fee':               { en: 'Fee per advance', ko: '건당 수수료' },
  'rule.fee.v':             { en: '{param.feeRatePct}%', ko: '{param.feeRatePct}%' },
  'rule.fee.m':             { en: 'Cost of funds + risk premium + protocol margin',
                              ko: '자금 사용료 + 위험 인수료 + 프로토콜 마진' },
  'rule.cap':               { en: 'Single-event loss cap', ko: '단일 사건 손실 상한' },
  'rule.cap.v':             { en: '{param.singleEventCapPct}% of LP deposits', ko: 'LP 예치금의 {param.singleEventCapPct}%' },
  'rule.cap.m':             { en: 'Stops one event from taking down the whole pool',
                              ko: '한 사건이 풀 전체를 무너뜨리지 못하게 하는 장치' },
  'rule.deploy':            { en: 'Idle deployment cap', ko: '유휴자금 운용 상한' },
  'rule.deploy.v':          { en: '{param.idleDeployCapPct}%', ko: '{param.idleDeployCapPct}%' },
  'rule.deploy.m':          { en: 'The pool must keep operating with every deployed dollar locked',
                              ko: '운용분이 전부 묶여도 정상 운영이 가능해야 한다는 원칙' },
  'rule.issuerAcq':         { en: 'Acquirer concentration per issuer', ko: '발급사별 매입사 집중 한도' },
  'rule.issuerAcq.v':       { en: '{param.acquirerExposurePct}%', ko: '{param.acquirerExposurePct}%' },
  'rule.issuerAcq.m':       { en: 'An onboarding test · the input behind the {param.issuerCollateralPct}% collateral ratio (50% × 20% × 1.5)',
                              ko: '온보딩 심사 기준 · 담보율 {param.issuerCollateralPct}%의 입력값 (50% × 20% × 1.5)' },
  'rule.poolAcq':           { en: 'Pool exposure per acquirer', ko: '풀 매입사 노출 한도' },
  'rule.poolAcq.v':         { en: 'capacity × {param.acquirerExposurePct}%', ko: '풀 가능액 × {param.acquirerExposurePct}%' },
  'rule.poolAcq.m':         { en: 'Ceiling on outstanding exposed to one acquirer · enforced on every new advance',
                              ko: '한 매입사에 걸릴 수 있는 미상환 금액의 상한 · 신규 선지급 시 강제' },
  'rule.issuerConc':        { en: 'Issuer concentration cap', ko: '발급사 집중 한도' },
  'rule.issuerConc.v':      { en: '{param.issuerConcentrationPct}%', ko: '{param.issuerConcentrationPct}%' },
  'rule.issuerConc.m':      { en: 'Any one issuer\'s largest share · with few issuers, 1 ÷ issuer count binds first',
                              ko: '한 발급사의 최대 몫 · 기관 수가 적을 땐 1÷발급사 수가 우선한다' },
  'rule.lpCap':             { en: 'LP deposit cap', ko: 'LP 예치 한도' },
  'rule.lpCap.v':           { en: 'average outstanding ÷ {param.lpTargetUtilizationPct}%', ko: '평균 미상환 ÷ {param.lpTargetUtilizationPct}%' },
  'rule.lpCap.m':           { en: 'Total deposits allowed, set by the target utilisation',
                              ko: '목표 가동률이 정하는 총 예치 상한' },
  'rule.lpSingle':          { en: 'Single-LP concentration cap', ko: '단일 LP 집중 한도' },
  'rule.lpSingle.v':        { en: '{param.lpSingleCapPct}%', ko: '{param.lpSingleCapPct}%' },
  'rule.lpSingle.m':        { en: 'Keeps one LP\'s exit from shaking the pool',
                              ko: '한 LP의 이탈이 풀을 흔들지 못하게 하는 한도' },

  // ── Coverage exclusions ─────────────────────────────────────
  'excl.1':     { en: 'False or duplicate refund request', ko: '허위 또는 중복 환불 요청' },
  'excl.1.sub': { en: 'a reused refund id, a signature from an unregistered issuer', ko: '동일 환불 ID 재제출, 미등록 발급사 서명' },

  // ── Cardholder app ──────────────────────────────────────────
  // The consumer surface. No wallet, no USDC, no gas — ever. Currency is USD.
  'app.modeOff':      { en: 'Ordinary card',        ko: '기존 카드' },
  'app.modeOn':       { en: 'Instant refund on',    ko: '즉시 환불 적용' },
  'app.switchLabel':  { en: 'Demo comparison switch', ko: '데모 비교 스위치' },
  'app.switchNote':   { en: 'In the real product this is set once when the card is issued, and the cardholder never touches it again. Here it replays the same situation twice so the difference is visible.',
                        ko: '실제 제품에서는 카드 발급 시 한 번 설정되며, 사용자는 이후 아무 조작도 하지 않습니다. 여기서는 같은 상황을 두 번 재생해 차이를 보기 위한 장치입니다.' },
  'app.replay':       { en: '↺ Replay the refund',  ko: '↺ 환불 체험 다시 보기' },
  'app.backToDemo':   { en: '↩ Back to the demo',   ko: '↩ 데모로 돌아가기' },

  'app.myTrip':       { en: 'My trip · Rome',       ko: '내 여행 · 로마' },
  'app.romaCap':      { en: 'ROME · Sep 14–17',     ko: 'ROMA · 9월 14–17일' },
  'app.romaCapOff':   { en: 'ROME · cancelled',     ko: 'ROMA · 취소됨' },
  'app.hotelRome':    { en: 'Grandview Hotel Roma', ko: 'Grandview Hotel Roma' },
  'app.hotelRomeMeta':{ en: 'Confirmed · 3 nights · free cancellation', ko: '예약 확정 · 3박 · 무료 취소 가능' },
  'app.hotelRomeGone':{ en: 'Cancelled · refund in progress', ko: '취소 완료 · 환불 처리 중' },
  'app.cancelBooking':{ en: 'Cancel booking',       ko: '예약 취소' },
  'app.waitingApply': { en: 'Waiting to post',      ko: '반영 대기' },
  'app.fineOff':      { en: 'The same card they already had. No wallet, no USDC.',
                        ko: '쓰던 카드 그대로입니다. 지갑도 USDC도 나오지 않습니다.' },
  'app.fineOn':       { en: 'Same card, same booking. The issuer has instant refund switched on.',
                        ko: '카드도 예약도 앞과 동일합니다. 발급사가 즉시 환불을 적용한 상태입니다.' },

  'app.refundConfirmed':    { en: 'Refund of USD 1,000 confirmed', ko: '환불 USD 1,000 확정' },
  'app.refundConfirmedSub': { en: 'will post to the card in 3–5 business days', ko: '카드 반영 예정 · 영업일 3~5일' },
  'app.bookNext':     { en: 'Book the next stay',   ko: '다음 숙소 예약하기' },

  'app.checking':     { en: 'Confirming the refund', ko: '환불 확인 중' },
  'app.checkingSub':  { en: 'Nobody asked for this. It starts the moment the refund confirmation arrives.',
                        ko: '사용자가 요청한 것이 아니라, 환불 확정 메시지를 받은 즉시 자동으로 진행됩니다.' },
  'app.restored':     { en: 'The refund is in your balance', ko: '환불금이 반영되었습니다' },
  'app.restoredSub':  { en: 'Spendable right now · days waited: 0', ko: '지금 바로 사용할 수 있습니다 · 기다린 날짜 0일' },

  'app.payTitle':     { en: 'Payment',              ko: '결제' },
  'app.comoCap':      { en: 'COMO · Sep 14–17',     ko: 'COMO · 9월 14–17일' },
  'app.hotelComo':    { en: 'Lakeside Suites Como', ko: 'Lakeside Suites Como' },
  'app.hotelComoMeta':{ en: '3 nights · instant confirmation', ko: '3박 · 즉시 확정' },
  'app.awaitingPay':  { en: 'Awaiting payment',     ko: '결제 대기' },
  'app.payAmount':    { en: 'Amount',               ko: '결제 금액' },
  'app.available':    { en: 'Available balance',    ko: '사용 가능 잔액' },
  'app.afterPay':     { en: 'Balance after payment', ko: '결제 후 잔액' },
  'app.shortBy':      { en: 'Short by',             ko: '부족한 금액' },
  'app.payBtn':       { en: 'Pay USD 800',          ko: 'USD 800 결제하기' },
  'app.back':         { en: 'Back',                 ko: '뒤로' },
  'app.ok':           { en: 'OK',                   ko: '확인' },
  'app.paymentMethod':{ en: 'Prepaid · •••• 4417',  ko: '프리페이드 · •••• 4417' },

  'app.failTitle':    { en: 'Payment failed',       ko: '결제하지 못했습니다' },
  'app.failSub':      { en: 'The USD 1,000 refund is confirmed but has not reached the card yet.',
                        ko: '환불 USD 1,000은 확정됐지만 아직 카드에 반영되지 않았습니다.' },
  'app.availableIn':  { en: 'Refund spendable',     ko: '환불금 사용 가능' },
  'app.inDays':       { en: 'in 3–5 business days', ko: '영업일 3~5일 뒤' },

  'app.successTitle': { en: 'Payment complete',     ko: '결제 완료' },
  'app.remaining':    { en: 'Remaining balance',    ko: '남은 잔액' },
  'app.noTopUp':      { en: 'Top-up needed',        ko: '추가 충전' },
  'app.none':         { en: 'none',                 ko: '없음' },
  'app.daysWaited':   { en: 'Days waited',          ko: '기다린 날짜' },
  'app.zeroDays':     { en: '0 days',               ko: '0일' },
  'app.continue':     { en: 'Continue',             ko: '계속' },

  'app.todaySpend':   { en: 'Today',                ko: '오늘의 결제' },
  'app.foodCap':      { en: 'Meals · transit',      ko: '식사 · 교통' },
  'app.merchant':     { en: 'An ordinary merchant', ko: '일반 가맹점' },
  'app.merchantMeta': { en: 'Plain card-network payment', ko: '카드 네트워크 일반 결제' },
  'app.payDaily':     { en: 'Pay USD 80',           ko: 'USD 80 결제하기' },
  'app.fineDaily':    { en: 'Spending power restored from a refund is not tied to the travel platform it came from. It is not points, and not a coupon.',
                        ko: '환불에서 복원된 구매력은 같은 여행 플랫폼에 묶이지 않습니다. 포인트도 쿠폰도 아니기 때문입니다.' },

  'app.tripGoesOn':   { en: 'The trip carries on',  ko: '여행이 계속됩니다' },
  'app.tripGoesOnSub':{ en: 'A new stay and everyday spending, with no top-up', ko: '추가 충전 없이 새 숙소와 일상 결제를 마쳤습니다' },
  'app.fineDone':     { en: 'The only buttons pressed were Cancel booking and Pay. There was never a screen for claiming the refund.',
                        ko: '사용자가 누른 것은 「예약 취소」와 「결제」뿐입니다. 환불금을 따로 요청하는 화면은 없었습니다.' },

  'app.recent':       { en: 'Recent activity',      ko: '최근 내역' },
  'app.feedRefund':   { en: 'Refund posted',        ko: '환불 반영' },
  'app.feedHotel':    { en: 'Lakeside Suites Como', ko: 'Lakeside Suites Como' },
  'app.feedDaily':    { en: 'An ordinary merchant', ko: '일반 가맹점' },
  'app.justNow':      { en: 'just now',             ko: '방금' },

  'app.storyOff':     { en: 'What an ordinary card does', ko: '기존 카드에서 일어나는 일' },
  'app.storyOffSub':  { en: 'Even after the refund is confirmed, the money is unusable for days.',
                        ko: '환불이 확정된 뒤에도 그 돈은 며칠 동안 쓸 수 없습니다.' },
  'app.storyOn':      { en: 'What Torna does',      ko: 'Torna가 하는 일' },
  'app.storyOnSub':   { en: 'The same situation, with the advance switched on.',
                        ko: '같은 상황에서 선지급이 켜져 있을 때입니다.' },

  // ── Intro, tab groups, next-step banner ─────────────────────
  'intro.title':  { en: 'Instant refund restore — demo', ko: '환불 즉시 복원 데모' },
  'intro.lede':   { en: 'A shared Monad pool advances a confirmed refund to the card issuer, so the spending power that would sit locked until settlement is restored at once.',
                    ko: '확정된 환불금이 정산되기를 기다리는 동안 묶이는 구매력을, Monad 공동 풀이 카드 운영사에 선지급해 즉시 복원합니다.' },
  'intro.1':      { en: 'Start on **Ordinary card**: cancel the hotel, then try to book a new one. **It fails for want of balance** — that is the problem we solve.',
                    ko: '먼저 **「기존 카드」** 상태로 호텔을 취소하고 새 숙소를 결제해보세요. **잔액이 부족해 실패**합니다 — 이것이 우리가 푸는 문제입니다.' },
  'intro.2':      { en: 'Flip the switch to **Instant refund on** and the same situation replays from the start.',
                    ko: '스위치를 **「즉시 환불 적용」**으로 바꾸면 같은 상황이 처음부터 다시 재생됩니다.' },
  'intro.3':      { en: 'This time the balance is restored **with nothing pressed**, and the payment goes through.',
                    ko: '이번에는 취소하는 순간 **아무 조작 없이** 잔액이 복원되고 결제가 통과합니다.' },
  'intro.4':      { en: 'After that you move to the **issuer, LP and verifier screens**, where you can **run** delay, loss and freeze yourself and follow what changes.',
                    ko: '체험이 끝나면 **발급사·LP·검증자 화면**으로 넘어갑니다. 거기서 지연·손실·동결 같은 예외 상황을 **직접 실행해보고** 무엇이 바뀌는지 따라갈 수 있습니다.' },
  'intro.start':  { en: 'Start',                    ko: '시작하기' },

  'tabs.consumer':{ en: 'What the cardholder sees', ko: '소비자가 보는 것' },
  'tabs.backend': { en: 'What happens behind it',   ko: '뒤에서 일어나는 일' },

  'app.autoplay': { en: '▶ Play it all',            ko: '▶ 전체 자동 재생' },
  'app.replayAll':{ en: '↺ Replay the refund',      ko: '↺ 환불 체험 다시 보기' },
  'app.justHappenedTitle': { en: 'What just happened', ko: '방금 일어난 일' },
  'app.whereNow': { en: 'Where you are',            ko: '지금 어디까지 왔나' },

  'app.noteFail': { en: 'This screen **is the problem we solve**. The budget is there, but money already paid is locked and the payment is blocked.',
                    ko: '지금 이 화면이 **우리가 푸는 문제**입니다. 총예산은 있는데 이미 낸 돈이 묶여 결제가 막혔습니다.' },
  'app.noteOn':   { en: 'The cardholder never has to know what happened behind this screen. No wallet, no USDC, no gas.',
                    ko: '사용자는 이 화면 뒤에서 무슨 일이 있었는지 알 필요가 없습니다. 지갑도, USDC도, 가스비도 등장하지 않습니다.' },
  'app.noteOff':  { en: 'The cardholder does not open a new card. It is the one they already had.',
                    ko: '사용자는 새 카드를 만들지 않습니다. 쓰던 카드 그대로입니다.' },

  // ── Story lanes ─────────────────────────────────────────────
  'lane.off.1':   { en: 'Cancel the hotel booking',  ko: '호텔 예약을 취소합니다' },
  'lane.off.1s':  { en: 'Grandview Hotel · USD 1,000', ko: 'Grandview Hotel · USD 1,000' },
  'lane.off.2':   { en: 'Refund confirmed — posts in 3–5 business days', ko: '환불은 확정 — 반영은 영업일 3~5일' },
  'lane.off.2s':  { en: 'balance still 300',         ko: '잔액은 300 그대로' },
  'lane.off.3':   { en: 'Try to pay for a new stay', ko: '새 숙소를 결제해봅니다' },
  'lane.off.3s':  { en: 'USD 800 needed, only 300 there', ko: 'USD 800이 필요한데 300뿐' },
  'lane.off.4':   { en: 'Payment fails',             ko: '결제 실패' },
  'lane.off.4s':  { en: 'the budget exists, but money already paid is locked', ko: '총예산은 있는데 이미 낸 돈이 묶였습니다' },

  'lane.on.1':    { en: 'Cancel the hotel booking',  ko: '호텔 예약을 취소합니다' },
  'lane.on.1s':   { en: 'identical up to here',      ko: '여기까지는 완전히 동일합니다' },
  'lane.on.2':    { en: 'The refund message is relayed automatically', ko: '환불 메시지가 자동으로 전달됩니다' },
  'lane.on.2s':   { en: 'nothing pressed · 1–2 seconds', ko: '사용자 조작 없음 · 1~2초' },
  'lane.on.3':    { en: 'The balance is restored',   ko: '잔액이 복원됩니다' },
  'lane.on.3s':   { en: '300 → 1,300 · no button pressed', ko: '300 → 1,300 · 누른 버튼 없음' },
  'lane.on.4':    { en: 'Pay for the new stay',      ko: '새 숙소를 결제합니다' },
  'lane.on.4s':   { en: 'USD 800, with no top-up',   ko: '추가 충전 없이 USD 800' },
  'lane.on.5':    { en: 'Payment succeeds',          ko: '결제 성공' },
  'lane.on.5s':   { en: 'days waited: 0',            ko: '기다린 날짜 0일' },
  'lane.on.6':    { en: 'Everyday spending with what is left', ko: '남은 돈으로 일상 결제' },
  'lane.on.6s':   { en: 'meals and transit, USD 80', ko: '식사·교통 USD 80' },
  'lane.on.7':    { en: 'T+5 settlement arrives → the pool is repaid', ko: 'T+5 정산금 도착 → 풀 상환' },
  'lane.on.7s':   { en: 'the cardholder never notices this step', ko: '사용자는 이 단계를 인지하지 않습니다' },

  // ── Next-step banner ────────────────────────────────────────
  'next.off.home':      { en: 'Try cancelling the hotel booking', ko: '호텔 예약을 취소해보세요' },
  'next.off.home.s':    { en: 'You are on Ordinary card. Press Cancel booking on Grandview Hotel.', ko: '지금은 「기존 카드」 상태입니다. Grandview Hotel의 [예약 취소]를 누릅니다' },
  'next.off.cancelled': { en: 'Try booking a new stay', ko: '새 숙소를 예약해보세요' },
  'next.off.cancelled.s': { en: 'The refund is confirmed, the balance is not', ko: '환불은 확정됐는데 잔액은 그대로입니다' },
  'next.off.pay':       { en: 'Try paying USD 800',   ko: 'USD 800을 결제해보세요' },
  'next.off.pay.s':     { en: 'Just watch what happens', ko: '무슨 일이 생기는지 그대로 보시면 됩니다' },
  'next.off.fail':      { en: 'Flip the switch above to Instant refund on', ko: '위 스위치를 「즉시 환불 적용」으로 바꿔보세요' },
  'next.off.fail.s':    { en: 'The same situation replays from the start', ko: '같은 상황이 처음부터 다시 재생됩니다' },
  'next.on.home':       { en: 'Cancel the same booking again', ko: '같은 예약을 다시 취소해보세요' },
  'next.on.home.s':     { en: 'This time nothing is pressed after the cancellation', ko: '이번에는 취소 이후 아무것도 누르지 않습니다' },
  'next.on.processing': { en: 'Working on it',        ko: '처리 중입니다' },
  'next.on.processing.s': { en: 'The issuer console shows the same stretch, stage by stage', ko: '발급사 콘솔 탭에서 같은 구간이 단계별로 보입니다' },
  'next.on.restored':   { en: 'Book the new stay',    ko: '새 숙소를 예약하세요' },
  'next.on.restored.s': { en: 'The balance is already restored', ko: '잔액은 이미 복원되어 있습니다' },
  'next.on.pay':        { en: 'Pay USD 800',          ko: 'USD 800을 결제하세요' },
  'next.on.pay.s':      { en: 'It goes through with no top-up', ko: '추가 충전 없이 통과합니다' },
  'next.on.success':    { en: 'Try an everyday payment too', ko: '일상 결제도 해보세요' },
  'next.on.success.s':  { en: 'Refund spending power is not tied to the platform it came from', ko: '환불 구매력이 같은 플랫폼에 묶이지 않습니다' },
  'next.on.daily':      { en: 'Pay USD 80',           ko: 'USD 80을 결제하세요' },
  'next.on.daily.s':    { en: 'It works at an ordinary merchant too', ko: '일반 가맹점에서도 그대로 쓰입니다' },
  'next.on.done':       { en: 'Now look at the operating screens', ko: '이제 운영 화면을 확인해보세요' },
  'next.on.done.s':     { en: 'The issuer, LP and verifier screens show what just happened', ko: '발급사·LP·검증자 화면에서 방금 무슨 일이 있었는지 보입니다' },
  'next.done':          { en: 'Done',                 ko: '완료' },
  'next.openTab':       { en: 'Open {tab} →',         ko: '{tab} 열기 →' },

  // ── User-app log lines ──────────────────────────────────────
  'ulog.cancelOff':  { en: 'The booking was cancelled. The refund is confirmed, but it cannot be spent until the settlement arrives.',
                       ko: '사용자가 호텔 예약을 취소했습니다. 환불은 확정됐지만 정산금이 도착해야 쓸 수 있습니다.' },
  'ulog.cancelOn':   { en: 'The same cancellation. The issuer\'s refund confirmation is relayed to the protocol — the cardholder pressed nothing.',
                       ko: '같은 취소입니다. 발급사가 보낸 환불 확정 메시지가 프로토콜로 전달됩니다 — 사용자는 아무것도 누르지 않았습니다.' },
  'ulog.restored':   { en: 'The shared pool advanced 1,000 USDC to the issuer, and the issuer restored the balance exactly once.',
                       ko: '공동 풀이 발급사에 1,000 USDC를 선지급했고, 발급사가 사용자 잔액을 한 번만 복원했습니다.' },
  'ulog.failed':     { en: 'The new booking was declined for want of balance. The budget exists, but money already paid is locked.',
                       ko: '새 숙소 결제 시도 — 잔액 부족으로 실패했습니다. 총예산은 있지만 이미 낸 돈이 묶여 있습니다.' },
  'ulog.paid':       { en: 'The restored spending power paid for the new stay. No top-up, no waiting.',
                       ko: '복원된 구매력으로 새 숙소를 결제했습니다. 추가 충전도, 기다림도 없었습니다.' },
  'ulog.daily':      { en: 'Refund spending power was not tied to the platform, and worked at an ordinary merchant.',
                       ko: '환불 구매력이 같은 플랫폼에 묶이지 않고 일반 가맹점에서도 쓰였습니다.' },

  'ulog.k.balance':  { en: 'Balance',        ko: '잔액' },
  'ulog.k.refund':   { en: 'Refund confirmed', ko: '환불 확정' },
  'ulog.k.usable':   { en: 'Spendable',      ko: '사용 가능' },
  'ulog.k.trigger':  { en: 'Triggered by',   ko: '촉발 사건' },
  'ulog.k.input':    { en: 'Cardholder action', ko: '사용자 조작' },
  'ulog.k.poolCash': { en: 'Pool cash',      ko: '풀 가용' },
  'ulog.k.fee':      { en: 'Fee',            ko: '수수료' },
  'ulog.k.needed':   { en: 'Needed',         ko: '필요' },
  'ulog.k.short':    { en: 'Short by',       ko: '부족' },
  'ulog.k.waited':   { en: 'Days waited',    ko: '기다린 날짜' },
  'ulog.v.none':     { en: 'none',           ko: '없음' },
  'ulog.v.inDays':   { en: 'in 3–5 business days', ko: '영업일 3~5일 뒤' },

  'app.feedCancel':    { en: 'Grandview Hotel booking cancelled', ko: 'Grandview Hotel 예약 취소' },
  'app.feedCancelSub': { en: 'refund of USD 1,000 confirmed', ko: '환불 USD 1,000 확정' },
  'app.feedRefundSub': { en: 'confirmed refund, spendable now', ko: '확정 환불분 즉시 사용 가능' },
  'app.feedHotelSub':  { en: 'new stay booked',   ko: '새 숙소 예약 완료' },
  'app.feedDailySub':  { en: 'ordinary merchant', ko: '일반 가맹점 결제' },

  // ── Scenario control strip ──────────────────────────────────
  'scen.label':     { en: 'Timepoints',             ko: '시나리오' },
  'scen.caption':   { en: 'This is a stress test. One of the nine is normal operation; the rest are incidents and exceptions. The running totals are not a record of everyday performance — they are here to show the safeguards firing.',
                      ko: '스트레스 테스트입니다. 9개 중 정상 운영은 1개고 나머지는 사고·예외입니다. 누적된 숫자는 평시 운영 실적이 아니라 안전장치가 작동하는지 보기 위한 것입니다.' },
  'scen.progress':  { en: '{n} / {total} reviewed', ko: '{n} / {total} 확인 완료' },
  'scen.chip':      { en: 'S{n}',                   ko: 'S{n}' },
  'scen.chipRun':   { en: 'Run',                    ko: '체험' },
  'scen.num':       { en: 'Scenario {n}',           ko: '시나리오 {n}' },
  'scen.numFollow': { en: 'Scenario {n} · follow-up', ko: '시나리오 {n} · 후속' },
  'scen.followNext':{ en: 'Follow in order · {id} →', ko: '순서대로 따라가기 · {id} →' },
  'scen.allDone':   { en: 'You have seen them all', ko: '모두 확인했습니다' },
  'scen.reset':     { en: '↺ Reset everything',     ko: '↺ 전체 리셋' },

  // ── Brief: nudge, no-change, hand-off ───────────────────────
  'bf.nudgeTitle':  { en: 'Worth seeing {id} first', ko: '{id}을 먼저 보는 편이 낫습니다' },
  'bf.nudgeGo':     { en: 'Open {id} first →',      ko: '{id} 먼저 보기 →' },
  'bf.nudgeAnyway': { en: 'Open it anyway',         ko: '그래도 열기' },
  'bf.noChangeTitle': { en: 'No change — and that is the result',
                        ko: '변화 없음 — 그것이 결과입니다' },
  'bf.doneAll':     { en: '✓ You have reviewed every screen for {id}',
                      ko: '✓ {id}의 모든 화면을 확인했습니다' },
  'bf.nextPoint':   { en: 'Next · {id} {title} →',  ko: '다음 · {id} {title} →' },
  'bf.seeEverything': { en: 'See it all on the public view →', ko: '공개 뷰에서 전체 보기 →' },
  'bf.rewindNote':  { en: 'Returns to the state just before {id}.',
                      ko: '{id} 직전 상태로 돌아갑니다.' },
  'bf.rewindNoteAlso': { en: 'Returns to the state just before {id} — the {n} later timepoints you opened are cleared too.',
                         ko: '{id} 직전 상태로 돌아갑니다 — 이후에 연 {n}개 시점의 확인 기록도 함께 지워집니다.' },

  // ── Batch 2: the cardholder story's closing beat and the replay ──
  'ulog.repaid':   { en: 'At T+5 the real settlement arrived and the issuer repaid the 1,000 principal. No fee charged twice, no balance credited twice.',
                     ko: 'T+5 실제 환불금이 도착해 발급사가 원금 1,000을 상환했습니다. 수수료 중복 청구도, 사용자 중복 적립도 없습니다.' },
  'ulog.k.advanced': { en: 'Advance outstanding', ko: '선지급 잔액' },
  'app.doneTitle': { en: 'The run is over · now look behind it',
                     ko: '체험이 끝났습니다 · 이제 뒤를 볼 차례입니다' },
  'app.doneSub':   { en: 'The issuer console shows how that 1,000 was recorded, and from there you can run the delay, loss and freeze scenarios yourself',
                     ko: '발급사 콘솔에서 방금 그 1,000이 어떻게 기록됐는지 보고, 거기서 지연·손실·동결 시나리오를 직접 실행해볼 수 있습니다' },
  'app.doneBadge': { en: 'Check',                  ko: '확인' },

  'replay.inProgress': { en: 'Replaying the refund experience.', ko: '환불 체험을 다시 보는 중입니다.' },
  'replay.noteUser':   { en: 'The operating screens are showing the state right after the run. Going back restores {id} exactly — figures and review ticks included.',
                         ko: '지금은 운영 화면도 체험 직후 상태를 함께 보여줍니다. 돌아가면 {id}까지 진행한 화면이 수치와 확인 기록까지 그대로 복원됩니다.' },
  'replay.noteScen':   { en: 'This screen is the state right after the run. To carry on with the timepoints you have to go back.',
                         ko: '이 화면은 체험 직후 상태입니다. 시나리오를 이어서 보려면 돌아가야 합니다.' },
  'replay.back':       { en: '← Back · {id}',      ko: '← 돌아가기 · {id}까지 진행한 화면' },
  'replay.paused':     { en: 'Continues after you go back', ko: '돌아간 뒤 이어집니다' },
  'replay.sameTx':     { en: 'Replayed, so the same transaction is shown — one refund is only ever advanced once.',
                         ko: '다시 보기이므로 앞서와 같은 트랜잭션이 표시됩니다 — 같은 환불 건은 한 번만 반영됩니다.' },

  // ── Batch 3: verifier exclusions ─────────────────────────────
  'excl.2':     { en: 'Not repaid after the settlement was received', ko: '정산금 수취 후 미상환' },
  'excl.2.sub': { en: 'the issuer was paid and did not pass it on',   ko: '발급사가 받고도 풀에 상환하지 않은 경우' },
  'excl.3':     { en: 'A plain delay',                 ko: '단순 지연' },
  'excl.3.sub': { en: 'past due but the settlement is still expected', ko: '만기는 지났으나 정산금이 도착할 예정인 경우' },
  'excl.verdict.out':  { en: 'Excluded',   ko: '제외' },
  'excl.verdict.notLoss': { en: 'Not a loss', ko: '손실 아님' },

  // ── Batch 3: issuer console ──────────────────────────────────
  'tile.regionAcq':    { en: 'Region · acquirer',   ko: '지역·매입사' },
  'iss.boundPool':     { en: 'pool',                ko: '풀' },
  'iss.boundPoolNote': { en: 'the pool share is the ceiling here, not collateral',
                         ko: '여기서는 담보가 아니라 풀 몫이 천장입니다' },
  'iss.stateActive':   { en: 'New advances allowed · the share applied right now is {pct}% ({n} issuers)',
                         ko: '신규 선지급 가능 · 지금 적용되는 몫은 {pct}% (발급사 {n}곳)' },
  'iss.stateMargin':   { en: 'New advances blocked · open positions stand, and it returns automatically once they are repaid',
                         ko: '신규 선지급 차단 · 기존 포지션은 유지되고 상환되면 자동 복귀' },
  'iss.stateSuspended':{ en: 'Collateral exhausted · registration is suspended until it is topped up',
                         ko: '담보 소진 · 담보를 다시 넣을 때까지 등록이 정지됩니다' },
  'iss.emptyPositions':{ en: 'No positions yet. Cancel the booking in the cardholder app.',
                         ko: '포지션이 없습니다. 사용자 앱에서 예약을 취소해보세요.' },
  'iss.since':         { en: 'since',               ko: '시작' },

  // ── Batch 3: LP notes ────────────────────────────────────────
  'wd.locked.none':   { en: 'Nothing is under review', ko: '심사 중인 건이 없습니다' },
  'lp.yearNoteLoss':  { en: 'Loss rate {loss}% against a 0.35% break-even, and LP net result {net}. Incidents were stacked on top of a single year\'s volume here, so the pool sits above the line — at the year\'s LP income of {fee} that is about {months} months to recover. What makes the same incident smaller next time is spread, not time — scenario 9 shows it.',
                        ko: '손실률 {loss}%, 손익분기는 0.35%이고 LP 순손익은 {net}입니다. 사고가 1년치 물량 위에 겹쳐 난 구간이라 위에 있으며, 연 수수료 {fee} 기준 약 {months}개월이면 회복됩니다. 같은 사고가 다시 나도 작게 끝나게 만드는 것은 시간이 아니라 분산입니다 — 시나리오 9에서 확인할 수 있습니다.' },
  'lp.yearNoteClean': { en: 'No loss yet. Run a capital-risk timepoint and this income is what it comes out of.',
                        ko: '아직 손실이 없습니다. 자금 위험 시나리오를 실행하면 이 수익에서 얼마가 깎이는지 바로 비교됩니다.' },
  'lp.wdNoteLocked':  { en: '{amount} is locked behind {n} position(s) still awaiting a ruling. A normal repayment or a recovery releases all of it. An individual LP multiplies this by their share.',
                        ko: '심사·유예 {n}건의 LP 잠재 부담분 {amount}이 묶였습니다. 정상 상환이나 회수로 끝나면 전액 해제됩니다. 개별 LP는 여기에 지분율을 곱한 금액입니다.' },
  'lp.wdNoteFree':    { en: 'No fixed notice period. Liquidity stays open in normal operation and is blocked only at the exact moment it has to be. An individual LP multiplies this by their share.',
                        ko: '고정 통보기간은 두지 않습니다 — 평시 유동성을 지키면서 필요한 순간에만 정확히 막습니다. 개별 LP는 여기에 지분율을 곱한 금액입니다.' },

  // ── Batch 3: public view ─────────────────────────────────────
  'pub.concNote':     { en: 'Concentration is a spread indicator, not a limit. What is enforced is the acquirer exposure cap, an amount.',
                        ko: '집중도는 분산 상태를 보는 지표이며 한도가 아닙니다. 강제되는 값은 금액 기준의 매입사 노출 한도입니다.' },
  'pub.concEmpty':    { en: 'Nothing is outstanding right now.', ko: '현재 미상환 포지션이 없습니다.' },

  // ── Batch 4: trend, tags, chain bar, footer ──────────────────
  'sec.navTrendSub':  { en: 'across the whole demo',  ko: '데모 전 구간' },
  'chain.lastEvent':  { en: 'Last event',             ko: '최근 이벤트' },
  'chain.oneLedger':  { en: 'All five screens read this one ledger', ko: '다섯 화면이 이 원장을 봅니다' },
  'foot.fiction':     { en: 'HYBRID Travel Card (North America · Europe, acquirer α) and AURA Travel Card (Asia, acquirer β) are invented companies. So are the hotels, the merchants and every figure on these screens.',
                        ko: 'HYBRID Travel Card(북미·유럽 · 매입사 α)와 AURA Travel Card(아시아 · 매입사 β)는 가상의 회사입니다. 호텔과 가맹점, 이 화면의 모든 수치도 마찬가지입니다.' },
} as const satisfies Record<string, Phrase>;

export type CopyKey = keyof typeof COPY;

/** t('nav.viewTimepoint', lang) */
export function t(key: CopyKey, lang: Lang = 'en'): string {
  return COPY[key][lang];
}

/**
 * Same as t(), but resolves {param.*} against shared/params.ts.
 *
 * Use it for any string that quotes a protocol parameter — the rule table, the
 * limit formulas, the deployment cap. Writing "20%" into the copy would create
 * a second place where that number lives, and the two would drift.
 */
export function tp(key: CopyKey, lang: Lang = 'en'): string {
  return t(key, lang).replace(/\{param\.(\w+)\}/g, (whole, name: string) => {
    const v = (PARAMS as Record<string, number>)[name];
    return typeof v === 'number' ? String(v) : whole;
  });
}
