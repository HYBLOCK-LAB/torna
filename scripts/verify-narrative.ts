/**
 * Torna — does every sentence still resolve against this bundle?
 *
 * `verify:bundle` checks that the FIGURES are right. This checks that the
 * PROSE can still find them. The two fail in different ways: a wrong figure is
 * caught by the acceptance table, while a renamed field or a renamed LP leaves
 * the numbers correct and quietly turns a sentence into ⟨pool.reserve⟩ on
 * screen — in front of judges.
 *
 * Run it whenever the bundle is replaced:
 *   pnpm verify:narrative shared/snapshots/<runId>
 *
 * Owner: A(서진)
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NARRATIVE } from '../shared/narrative';
import { PARAMS } from '../shared/params';
import { TIMEPOINT_ORDER, type Snapshot, type TimepointId } from '../shared/types/snapshot';

const dir = process.argv[2];
if (!dir) {
  console.error('사용법: pnpm verify:narrative <스냅샷 폴더>');
  process.exit(2);
}

const snaps: Partial<Record<TimepointId, Snapshot>> = {};
for (const f of readdirSync(dir).filter((x) => /^t\d+b?\.json$/.test(x))) {
  const s = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Snapshot;
  snaps[s.timepointId] = s;
}

const TOKEN = /\{([a-zA-Z0-9_.\-]+)(?::(delta|pctdelta|pct|n2|prev))?\}/g;
const errors: string[] = [];

/** The same resolution the renderer does — deliberately duplicated, so this
 *  script keeps working if the renderer is refactored. */
function resolves(path: string, s: Snapshot): boolean {
  const [head, ...rest] = path.split('.');
  if (head === 'param') return typeof (PARAMS as Record<string, unknown>)[rest[0]] === 'number';
  if (head === 'count') return true;                       // a state with no rows is zero, not missing
  if (head === 'derive' || head === 'year') return true;   // computed, never absent
  if (head === 'deposit') {
    return s.events.some((e) => e.name === 'DepositRejected' && e.target === rest[0]);
  }
  if (head === 'recovery') {
    return s.issuers.some((i) => i.key === rest[0])
      && s.events.some((e) => e.name === 'RecoveryRecorded')
      && s.events.some((e) => e.name === 'CorrelatedExposureFlagged');
  }
  if (head === 'issuer') return s.issuers.some((i) => i.key === rest[0]);
  if (head === 'lp') return s.liquidityProviders.some((l) => l.name === rest[0]);
  if (head === 'pool' || head === 'metrics') {
    const g = (s as unknown as Record<string, Record<string, unknown>>)[head];
    return typeof g?.[rest[0]] === 'number';
  }
  return false;
}

for (const id of TIMEPOINT_ORDER) {
  const n = NARRATIVE[id];
  const s = snaps[id];
  if (!n) continue;
  if (!s) { errors.push(`${id}: 스냅샷 없음`); continue; }

  const texts: Array<[string, string]> = [];
  const add = (label: string, b: { ko: string; en: string } | null | undefined) => {
    if (b) { texts.push([label, b.ko]); texts.push([label, b.en]); }
  };
  add('title', n.title); add('soFar', n.soFar); add('situation', n.situation);
  add('why', n.why); add('designPoint', n.designPoint);
  for (const group of ['changed', 'watch', 'conclusion'] as const) {
    (n[group] ?? []).forEach((w, i) => {
      add(`${group}[${i}]`, w.text);
      (w.chips ?? []).forEach((c, j) => {
        add(`${group}[${i}].chip[${j}]`, c.v);
        if (c.tx && !s.events.some((e) => e.name === c.tx)) {
          errors.push(`${id} ${group}[${i}].chip[${j}]: 이벤트 '${c.tx}'가 이 시점 로그에 없습니다`);
        }
      });
    });
  }
  if (n.follow) add('follow', n.follow.text);

  for (const [label, text] of texts) {
    for (const m of text.matchAll(TOKEN)) {
      const path = m[1];
      const target = m[2] === 'prev'
        ? snaps[TIMEPOINT_ORDER[TIMEPOINT_ORDER.indexOf(id) - 1]]
        : s;
      if (!target || !resolves(path, target)) {
        errors.push(`${id} ${label}: ⟨${path}⟩ 를 찾을 수 없습니다`);
      }
    }
  }
}

if (errors.length) {
  console.error(`문안 검증 실패 — ${errors.length}건\n`);
  for (const e of [...new Set(errors)]) console.error('  · ' + e);
  process.exit(1);
}
console.log(`문안 검증 통과 — ${TIMEPOINT_ORDER.length}개 시점의 자리표시자가 모두 해석됩니다.`);
