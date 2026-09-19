/**
 * Torna — snapshot bundle verifier
 *
 *   pnpm verify:bundle shared/snapshots/sample
 *   pnpm verify:bundle shared/snapshots/run-20260925
 *
 * Run this before asking anyone whether your output is correct.
 * If it passes, it is correct.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';

const ORDER = [
  't0', 't1', 't2', 't3', 't3b', 't4', 't5', 't6', 't7', 't8', 't9', 't9b',
] as const;

type TimepointId = (typeof ORDER)[number];

/**
 * Acceptance baselines — the canonical path (cardholder experience first).
 * Source: mockup v21, measured. Also printed in PRD.md section 7.
 * A run that does not land on these numbers has a bug in the contract or the adapter.
 */
const BASELINE: Record<TimepointId, {
  nav: number; outstanding: number; reserve: number;
  lpLoss: number; capHeld: number; external: number;
  count: number; advanced: number;
}> = {
  t0:  { nav: 10002, outstanding: 0,    reserve: 500, lpLoss: 0,    capHeld: 0,    external: 0,    count: 1,   advanced: 1000 },
  t1:  { nav: 10878, outstanding: 1000, reserve: 646, lpLoss: 0,    capHeld: 0,    external: 0,    count: 366, advanced: 366000 },
  t2:  { nav: 10725, outstanding: 0,    reserve: 0,   lpLoss: 154,  capHeld: 0,    external: 0,    count: 366, advanced: 366000 },
  t3:  { nav: 9136,  outstanding: 2000, reserve: 0,   lpLoss: 1752, capHeld: 1600, external: 0,    count: 370, advanced: 370000 },
  t3b: { nav: 9536,  outstanding: 0,    reserve: 0,   lpLoss: 1352, capHeld: 0,    external: 0,    count: 370, advanced: 370000 },
  t4:  { nav: 9546,  outstanding: 4000, reserve: 2,   lpLoss: 1352, capHeld: 0,    external: 0,    count: 374, advanced: 374000 },
  t5:  { nav: 7639,  outstanding: 1000, reserve: 2,   lpLoss: 1082, capHeld: 0,    external: 0,    count: 375, advanced: 375000 },
  t6:  { nav: 7639,  outstanding: 1000, reserve: 2,   lpLoss: 1082, capHeld: 0,    external: 3637, count: 375, advanced: 375000 },
  t7:  { nav: 7639,  outstanding: 1000, reserve: 2,   lpLoss: 1082, capHeld: 0,    external: 3637, count: 375, advanced: 375000 },
  t8:  { nav: 7639,  outstanding: 1000, reserve: 2,   lpLoss: 1082, capHeld: 0,    external: 3637, count: 375, advanced: 375000 },
  t9:  { nav: 7644,  outstanding: 3000, reserve: 3,   lpLoss: 1082, capHeld: 0,    external: 3637, count: 377, advanced: 377000 },
  t9b: { nav: 16311, outstanding: 3000, reserve: 3,   lpLoss: 1082, capHeld: 0,    external: 3637, count: 377, advanced: 377000 },
};

/** Absolute tolerance in USDC. Rounding differences are fine; real drift is not. */
const TOL = 3;

const REQUIRED_POOL = [
  'lpDeposits', 'lpFeeAccrued', 'lpLossApplied', 'netAssetValue',
  'advancedOutstanding', 'cashAvailable', 'reserve', 'reserveUsed',
  'capHeld', 'externalDeployed', 'protocolFee',
];
const REQUIRED_METRICS = [
  'cumulativeCount', 'cumulativeAdvanced', 'lossTotal', 'lossRatePct',
  'repayRatePct', 'utilizationPct', 'acquirerTopExposure',
  'acquirerExposureLimit', 'lpDepositCap',
];
const POSITION_STATES = [
  'Registered', 'Advanced', 'Repaid', 'Overdue',
  'Review', 'CoveredLoss', 'CapHeld', 'RecoveryRecorded',
];
const ISSUER_STATES = ['Active', 'MarginCall', 'Suspended', 'Deregistered'];

const errors: string[] = [];
const warnings: string[] = [];
/** 번들 안에서 실제로 쓰인 식별자 — 라벨이 이걸 전부 덮어야 한다 */
const usedRefundKeys = new Set<string>();
const usedAcquirerHashes = new Set<string>();
const usedIssuerKeys = new Set<string>();
const fail = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);

function near(actual: unknown, expected: number, label: string, tol = TOL) {
  if (typeof actual !== 'number' || Number.isNaN(actual)) {
    fail(`${label}: 숫자가 아닙니다 (${String(actual)})`);
    return;
  }
  if (Math.abs(actual - expected) > tol) {
    fail(`${label}: 기준값 ${expected}, 실제 ${actual} (허용 오차 ±${tol})`);
  }
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('사용법: pnpm verify:bundle <스냅샷 폴더>');
    process.exit(2);
  }
  const root = resolve(process.cwd(), dir);
  if (!existsSync(root)) {
    console.error(`폴더가 없습니다: ${root}`);
    process.exit(2);
  }

  console.log(`\n번들 검증 — ${root}\n`);
  const folderName = basename(root);

  // manifest
  const manifestPath = join(root, 'manifest.json');
  let manifestRunId: string | null = null;
  if (!existsSync(manifestPath)) {
    fail('manifest.json 이 없습니다');
  } else {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifestRunId = m.runId ?? null;
    if (!manifestRunId) fail('manifest.json 에 runId 가 없습니다');
    if (!Array.isArray(m.timepoints) || m.timepoints.length !== ORDER.length) {
      fail(`manifest.timepoints 가 ${ORDER.length}개가 아닙니다`);
    }
  }

  // stray files
  const present = readdirSync(root).filter((f) => f.endsWith('.json') && f !== 'manifest.json');
  const expectedFiles = ORDER.map((t) => `${t}.json`);
  present.filter((f) => !expectedFiles.includes(f))
    .forEach((f) => warn(`알 수 없는 파일: ${f}`));

  let runId: string | null = manifestRunId;

  for (const [i, id] of ORDER.entries()) {
    const p = join(root, `${id}.json`);
    if (!existsSync(p)) { fail(`${id}.json 이 없습니다`); continue; }

    let s: any;
    try { s = JSON.parse(readFileSync(p, 'utf8')); }
    catch (e) { fail(`${id}.json 을 읽을 수 없습니다: ${(e as Error).message}`); continue; }

    if (s.schemaVersion !== 1) fail(`${id}: schemaVersion 이 1이 아닙니다`);
    if (s.timepointId !== id) fail(`${id}: timepointId 가 "${s.timepointId}" 입니다`);
    if (s.seq !== i) fail(`${id}: seq 가 ${s.seq} 입니다 (기대 ${i})`);
    if (s.amountUnit !== 'USDC') fail(`${id}: amountUnit 이 "USDC" 가 아닙니다`);
    if (!s.label?.en || !s.label?.ko) fail(`${id}: label.en / label.ko 가 필요합니다`);
    if (typeof s.blockNumber !== 'number') fail(`${id}: blockNumber 가 없습니다`);

    // runId 일관성 — 가장 흔한 사고 지점
    if (!s.runId) fail(`${id}: runId 가 없습니다`);
    else if (runId === null) runId = s.runId;
    else if (s.runId !== runId) {
      fail(`${id}: runId 가 다릅니다 ("${s.runId}" ≠ "${runId}"). 한 회차로 다시 실행하세요`);
    }

    // 필수 필드
    if (!s.pool) fail(`${id}: pool 이 없습니다`);
    else REQUIRED_POOL.forEach((k) => {
      if (typeof s.pool[k] !== 'number') fail(`${id}: pool.${k} 가 없거나 숫자가 아닙니다`);
    });

    if (!s.metrics) fail(`${id}: metrics 가 없습니다`);
    else REQUIRED_METRICS.forEach((k) => {
      if (typeof s.metrics[k] !== 'number') fail(`${id}: metrics.${k} 가 없거나 숫자가 아닙니다`);
    });

    for (const arr of ['issuers', 'liquidityProviders', 'positions', 'events'] as const) {
      if (!Array.isArray(s[arr])) fail(`${id}: ${arr} 가 배열이 아닙니다`);
    }

    // 상태값 철자 · 식별자
    (s.positions ?? []).forEach((pos: any, j: number) => {
      if (!POSITION_STATES.includes(pos.state)) {
        fail(`${id}: positions[${j}].state "${pos.state}" 는 정의된 값이 아닙니다`);
      }
      for (const f of ['refundKey', 'acquirerHash', 'txHash']) {
        if (!pos[f] || !String(pos[f]).startsWith('0x')) {
          fail(`${id}: positions[${j}].${f} 가 0x 로 시작하지 않습니다`);
        }
      }
      if ('refundId' in pos || 'acquirer' in pos) {
        fail(`${id}: positions[${j}] 에 refundId/acquirer 가 있습니다. 체인에는 해시만 있습니다 — 읽는 값은 라벨 매핑에서 가져옵니다`);
      }
      usedRefundKeys.add(pos.refundKey);
      usedAcquirerHashes.add(pos.acquirerHash);
    });
    (s.issuers ?? []).forEach((iss: any, j: number) => {
      if (!ISSUER_STATES.includes(iss.state)) {
        fail(`${id}: issuers[${j}].state "${iss.state}" 는 정의된 값이 아닙니다`);
      }
      if (!iss.acquirerHash || !String(iss.acquirerHash).startsWith('0x')) {
        fail(`${id}: issuers[${j}].acquirerHash 가 0x 로 시작하지 않습니다`);
      }
      usedIssuerKeys.add(iss.key);
      usedAcquirerHashes.add(iss.acquirerHash);
      if (iss.collateralRemaining < 0.5 && iss.state !== 'Suspended' && iss.state !== 'Deregistered') {
        fail(`${id}: ${iss.key} 의 담보가 0인데 상태가 ${iss.state} 입니다. Suspended 여야 합니다`);
      }
    });

    // 회계 항등식
    if (s.pool) {
      const nav = s.pool.lpDeposits + s.pool.lpFeeAccrued - s.pool.lpLossApplied;
      near(s.pool.netAssetValue, nav, `${id}: netAssetValue ≠ 예치금 + 수수료 − 손실`, 1);
      const cash = s.pool.netAssetValue - s.pool.advancedOutstanding - s.pool.externalDeployed;
      near(s.pool.cashAvailable, cash, `${id}: cashAvailable ≠ 평가액 − 선지급 − 외부운용`, 1);
    }

    // 기준값 대조
    const b = BASELINE[id];
    near(s.pool?.netAssetValue,       b.nav,         `${id}: LP 평가액`);
    near(s.pool?.advancedOutstanding, b.outstanding, `${id}: 미상환`);
    near(s.pool?.reserve,             b.reserve,     `${id}: 준비금`);
    near(s.pool?.lpLossApplied,       b.lpLoss,      `${id}: LP 누적손실`);
    near(s.pool?.capHeld,             b.capHeld,     `${id}: 상한 유예`);
    near(s.pool?.externalDeployed,    b.external,    `${id}: 외부 운용`);
    near(s.metrics?.cumulativeCount,    b.count,    `${id}: 누적 건수`, 0);
    near(s.metrics?.cumulativeAdvanced, b.advanced, `${id}: 누적 선지급`, 10);
  }

  // runId = 폴더 이름 = 라벨 파일 이름
  if (runId && runId !== folderName) {
    fail(`runId "${runId}" 와 폴더 이름 "${folderName}" 이 다릅니다. 셋(runId · 폴더 · 라벨 파일)의 이름은 같아야 합니다`);
  }

  // 라벨 매핑 — 체인에는 해시만 있으므로 읽는 값은 전부 여기서 나온다
  const labelPath = join(dirname(dirname(root)), 'labels', `${runId ?? folderName}.json`);
  if (!existsSync(labelPath)) {
    fail(`라벨 매핑이 없습니다: ${labelPath}\n     C(민재)가 DB에서 덤프해야 합니다. 없으면 포지션 표에 해시만 뜹니다`);
  } else {
    const L = JSON.parse(readFileSync(labelPath, 'utf8'));
    if (L.runId !== runId) fail(`라벨의 runId "${L.runId}" 가 번들의 "${runId}" 와 다릅니다`);
    for (const sec of ['refunds', 'acquirers', 'issuers']) {
      if (!L[sec] || typeof L[sec] !== 'object') fail(`라벨에 ${sec} 가 없습니다`);
    }
    const missR = [...usedRefundKeys].filter((k) => !L.refunds?.[k]);
    const missA = [...usedAcquirerHashes].filter((k) => !L.acquirers?.[k]);
    const missI = [...usedIssuerKeys].filter((k) => !L.issuers?.[k]);
    if (missR.length) fail(`라벨에 없는 refundKey ${missR.length}개 — 예: ${missR[0]}`);
    if (missA.length) fail(`라벨에 없는 acquirerHash ${missA.length}개 — 예: ${missA[0]}`);
    if (missI.length) fail(`라벨에 없는 발급사 ${missI.length}개 — 예: ${missI[0]}`);
    if (!missR.length && !missA.length && !missI.length) {
      console.log(`라벨 매핑 — 환불 ${usedRefundKeys.size} · 매입사 ${usedAcquirerHashes.size} · 발급사 ${usedIssuerKeys.size} 전부 덮임`);
    }
  }

  // 결과
  console.log(`시점 ${ORDER.length}개 · runId "${runId ?? '(없음)'}"`);
  if (warnings.length) {
    console.log(`\n경고 ${warnings.length}건`);
    warnings.forEach((w) => console.log(`  · ${w}`));
  }
  if (errors.length) {
    console.log(`\n실패 ${errors.length}건\n`);
    errors.forEach((e) => console.log(`  ✗ ${e}`));
    console.log('\n막히면 PRD.md 17장 「자주 꼬이는 지점」을 보세요.\n');
    process.exit(1);
  }
  console.log('\n  ✓ 통과. 이 번들은 프론트에 넣어도 됩니다.\n');
}

main();
