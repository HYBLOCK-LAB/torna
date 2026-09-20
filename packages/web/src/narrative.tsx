/**
 * Torna — narrative renderer.
 *
 * Turns `{pool.reserve:delta}` into "500 → 646" by reading the snapshot, so a
 * sentence and the table beside it can never disagree. When B(민서)'s real
 * bundle replaces the sample, every sentence updates itself.
 *
 * A placeholder that cannot be resolved renders as `⟨path⟩` in the warning
 * colour rather than crashing or, worse, silently vanishing. A missing figure
 * has to be visible — that is how you find out the bundle changed shape.
 *
 * Owner: A(서진)
 */

import { Fragment, type ReactNode } from 'react';
import type { Snapshot, TimepointId, Bilingual, PositionState } from '@shared/types/snapshot';
import { TIMEPOINT_ORDER } from '@shared/types/snapshot';
import { PARAMS } from '@shared/params';
import type { Lang } from '@shared/copy';
import { snapshots } from './bundle';

/* ── value lookup ───────────────────────────────────────────── */

/** The previous timepoint, for deltas. t0 has none. */
export function previousOf(id: TimepointId): Snapshot | null {
  const i = TIMEPOINT_ORDER.indexOf(id);
  return i > 0 ? snapshots[TIMEPOINT_ORDER[i - 1]] ?? null : null;
}

/**
 * Resolve a dotted path against one snapshot.
 *   pool.reserve                     → 646.4
 *   metrics.cumulativeCount          → 366
 *   issuer.AURA.collateralRemaining  → 0
 *   lp.LP-03.deposit                 → 2000
 *   count.CapHeld                    → number of positions in that state
 *   param.singleEventCapPct          → 20
 */
export function valueAt(path: string, s: Snapshot): number | null {
  const [head, ...rest] = path.split('.');

  if (head === 'param') {
    const v = (PARAMS as Record<string, number>)[rest[0]];
    return typeof v === 'number' ? v : null;
  }
  if (head === 'count') {
    const state = rest[0] as PositionState;
    return s.positions.filter((p) => p.state === state).length;
  }
  if (head === 'issuer') {
    const iss = s.issuers.find((i) => i.key === rest[0]);
    const v = iss ? (iss as unknown as Record<string, unknown>)[rest[1]] : undefined;
    return typeof v === 'number' ? v : null;
  }
  if (head === 'lp') {
    const lp = s.liquidityProviders.find((l) => l.name === rest[0]);
    const v = lp ? (lp as unknown as Record<string, unknown>)[rest[1]] : undefined;
    return typeof v === 'number' ? v : null;
  }
  if (head === 'pool' || head === 'metrics') {
    const group = (s as unknown as Record<string, Record<string, unknown>>)[head];
    const v = group?.[rest[0]];
    return typeof v === 'number' ? v : null;
  }
  return null;
}

const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
const n2 = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const fmt = (v: number, mode?: string) =>
  mode === 'pct' ? `${n2(v)}%` : Math.abs(v) < 100 && !Number.isInteger(v) ? n2(v) : n0(v);

/* ── text rendering ─────────────────────────────────────────── */

const TOKEN = /\{([a-zA-Z0-9_.\-]+)(?::(delta|pct|n2))?\}/g;

/**
 * `en` is still being written. Until it lands, show `ko` rather than a blank
 * line — a demo with holes in it reads worse than a demo in the wrong language.
 */
function pick(b: Bilingual | null, lang: Lang): string {
  if (!b) return '';
  return (lang === 'en' ? b.en || b.ko : b.ko || b.en) ?? '';
}

export function Narrative({
  text, s, lang,
}: { text: Bilingual | null; s: Snapshot; lang: Lang }) {
  const raw = pick(text, lang);
  if (!raw) return null;

  const prev = previousOf(s.timepointId);
  const out: ReactNode[] = [];
  let last = 0;

  for (const m of raw.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(raw.slice(last, at));
    last = at + m[0].length;

    const [, path, mode] = m;
    const now = valueAt(path, s);

    if (now === null) {
      // Loud on purpose: a silently dropped figure is how a demo starts lying.
      out.push(<b key={at} className="narr-miss">⟨{path}⟩</b>);
      continue;
    }
    if (mode === 'delta') {
      const before = prev ? valueAt(path, prev) : null;
      out.push(
        before === null || Math.abs(before - now) < 0.005
          ? <Fragment key={at}>{fmt(now)}</Fragment>
          : <Fragment key={at}>{fmt(before)} <span className="ar">→</span> {fmt(now)}</Fragment>,
      );
      continue;
    }
    out.push(<Fragment key={at}>{fmt(now, mode)}</Fragment>);
  }
  if (last < raw.length) out.push(raw.slice(last));
  return <>{out}</>;
}

/* ── delta chips ────────────────────────────────────────────── */

export interface Delta { path: string; before: number; after: number }

/** Only fields that actually moved. A quiet timepoint gets a quiet row. */
export function deltasFor(paths: string[], s: Snapshot): Delta[] {
  const prev = previousOf(s.timepointId);
  if (!prev) return [];
  const out: Delta[] = [];
  for (const path of paths) {
    const a = valueAt(path, prev);
    const b = valueAt(path, s);
    if (a === null || b === null || Math.abs(a - b) < 0.005) continue;
    out.push({ path, before: a, after: b });
  }
  return out;
}

export function DeltaChips({ deltas, label }: { deltas: Delta[]; label: (p: string) => string }) {
  if (!deltas.length) return null;
  return (
    <span className="deltas">
      {deltas.map((d) => (
        <span key={d.path} className={`chip ${d.after > d.before ? 'up' : d.after < d.before ? 'dn' : ''}`}>
          {label(d.path)} <b>{fmt(d.before)}</b>
          <span className="ar">→</span>
          <b>{fmt(d.after)}</b>
        </span>
      ))}
    </span>
  );
}
