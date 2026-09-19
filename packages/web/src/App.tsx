/**
 * Scaffold only. Replace with the real screens.
 *
 * What it already demonstrates, and what must survive the rewrite:
 *   · selecting a timepoint REPLACES state (never a delta)
 *   · `reviewed` progress lives OUTSIDE the snapshot, so moving between
 *     timepoints never loses it
 *   · all copy comes from shared/copy.ts, English first
 */

import { useMemo, useState } from 'react';
import {
  snapshots, timepointIds, manifest, assertBundleIntegrity,
  refundLabel, acquirerLabel, issuerRegion,
} from './bundle';
import { t, type Lang } from '@shared/copy';
import type { TimepointId } from '@shared/types/snapshot';

const usd = (n: number) =>
  n.toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 });

export default function App() {
  const [lang] = useState<Lang>('en');
  const [current, setCurrent] = useState<TimepointId>('t0');

  // Progress is deliberately NOT part of the snapshot: snapshots are fixed
  // files, and this value must survive every state replacement.
  const [reviewed, setReviewed] = useState<Set<TimepointId>>(new Set());

  const integrity = useMemo(() => {
    try { assertBundleIntegrity(); return null; }
    catch (e) { return (e as Error).message; }
  }, []);

  if (integrity) {
    return (
      <main style={S.page}>
        <h1 style={S.h1}>Bundle error</h1>
        <pre style={S.pre}>{integrity}</pre>
        <p style={S.dim}>Run <code>pnpm verify:bundle shared/snapshots/sample</code> for details.</p>
      </main>
    );
  }

  const s = snapshots[current];

  return (
    <main style={S.page}>
      <header style={S.header}>
        <p style={S.eyebrow}>{t('app.title', lang)}</p>
        <h1 style={S.h1}>{t('app.subtitle', lang)}</h1>
        <p style={S.lede}>{t('app.lede', lang)}</p>
        <p style={S.dim}>
          run <code>{manifest?.runId}</code> · {reviewed.size} / {timepointIds.length} reviewed
        </p>
      </header>

      <nav style={S.nav}>
        {timepointIds.map((id) => (
          <button
            key={id}
            onClick={() => { setCurrent(id); setReviewed((r) => new Set(r).add(id)); }}
            style={{
              ...S.chip,
              ...(id === current ? S.chipOn : null),
              ...(reviewed.has(id) && id !== current ? S.chipDone : null),
            }}
          >
            <b>{id}</b> {snapshots[id].label[lang]}
          </button>
        ))}
      </nav>

      <section style={S.card}>
        <h2 style={S.h2}>{s.label[lang]}</h2>
        <div style={S.grid}>
          <Stat k={t('metric.nav', lang)} v={usd(s.pool.netAssetValue)} />
          <Stat k={t('metric.outstanding', lang)} v={usd(s.pool.advancedOutstanding)} />
          <Stat k={t('metric.reserve', lang)} v={usd(s.pool.reserve)} />
          <Stat k={t('metric.utilization', lang)} v={`${s.metrics.utilizationPct}%`} />
          <Stat k={t('metric.lossRate', lang)} v={`${s.metrics.lossRatePct}%`} />
          <Stat k={t('metric.repayRate', lang)} v={`${s.metrics.repayRatePct}%`} />
        </div>
      </section>

      <section style={S.card}>
        <h2 style={S.h2}>{t('screen.issuer', lang)}</h2>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Issuer</th>
              <th style={S.th}>Collateral</th>
              <th style={S.th}>{t('metric.effectiveLimit', lang)}</th>
              <th style={S.th}>{t('metric.outstanding', lang)}</th>
              <th style={S.th}>State</th>
            </tr>
          </thead>
          <tbody>
            {s.issuers.map((i) => (
              <tr key={i.key}>
                <td style={S.td}>{i.key} <span style={S.dim}>{issuerRegion(i.key)}</span></td>
                <td style={S.td}>{usd(i.collateralRemaining)}</td>
                <td style={S.td}>{usd(i.effectiveLimit)}</td>
                <td style={S.td}>{usd(i.outstanding)}</td>
                <td style={S.td}>{i.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={S.card}>
        <h2 style={S.h2}>Refund positions</h2>
        {/* The chain stores only hashes. refundLabel / acquirerLabel resolve them. */}
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Refund</th>
              <th style={S.th}>Acquirer</th>
              <th style={S.th}>Amount</th>
              <th style={S.th}>State</th>
            </tr>
          </thead>
          <tbody>
            {s.positions.slice(0, 8).map((p) => (
              <tr key={p.refundKey}>
                <td style={S.td}>{refundLabel(p.refundKey)}</td>
                <td style={S.td}>{acquirerLabel(p.acquirerHash)}</td>
                <td style={S.td}>{usd(p.amount)}</td>
                <td style={S.td}>{t(`state.${p.state}` as never, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p style={S.dim}>{t('app.mockNotice', lang)}</p>
    </main>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div style={S.stat}>
      <div style={S.statK}>{k}</div>
      <div style={S.statV}>{v}</div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '32px 16px 80px', fontFamily: '"IBM Plex Sans", system-ui, sans-serif', color: '#15122A' },
  header: { marginBottom: 24 },
  eyebrow: { margin: 0, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: '#6D4AFF', fontWeight: 600 },
  h1: { fontSize: 26, margin: '6px 0 6px', fontWeight: 700 },
  h2: { fontSize: 15, margin: '0 0 12px', fontWeight: 600 },
  lede: { margin: 0, color: '#4B4568', maxWidth: '64ch' },
  dim: { color: '#7D7699', fontSize: 12.5 },
  nav: { display: 'flex', gap: 6, flexWrap: 'wrap', margin: '18px 0 22px' },
  chip: { border: '1px solid #CFC8E4', background: '#F5F3FB', borderRadius: 9, padding: '7px 11px', fontSize: 12.5, cursor: 'pointer', font: 'inherit' },
  chipOn: { borderColor: '#6D4AFF', boxShadow: 'inset 0 0 0 1px #6D4AFF', background: '#fff' },
  chipDone: { background: '#E2F5EC', borderColor: 'transparent', color: '#0F8B5F' },
  card: { background: '#fff', border: '1px solid #E4E0F0', borderRadius: 14, padding: 17, marginBottom: 16 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1, background: '#E4E0F0', border: '1px solid #E4E0F0', borderRadius: 11, overflow: 'hidden' },
  stat: { background: '#fff', padding: '12px 13px' },
  statK: { fontSize: 10, letterSpacing: '.07em', textTransform: 'uppercase', color: '#7D7699', fontWeight: 600 },
  statV: { fontSize: 19, fontWeight: 600, marginTop: 2, fontFamily: '"IBM Plex Mono", monospace' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', fontSize: 10, letterSpacing: '.07em', textTransform: 'uppercase', color: '#7D7699', fontWeight: 600, padding: '0 10px 7px 0' },
  td: { padding: '9px 10px 9px 0', borderTop: '1px solid #E4E0F0', fontFamily: '"IBM Plex Mono", monospace' },
  pre: { background: '#FCE6EE', color: '#C0245E', padding: 14, borderRadius: 10, whiteSpace: 'pre-wrap' },
};
