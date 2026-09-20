/**
 * Torna — app shell.
 *
 * What this file is allowed to do: choose a timepoint, choose a screen, and
 * read values out of the snapshot. That is all.
 *
 * What it must never do:
 *   · recompute a figure the snapshot already carries. NAV, utilisation, loss
 *     rate and every limit are produced on chain and captured by B(민서). If the
 *     UI recalculates one, the two answers will drift and nobody will know
 *     which is right.
 *   · hold a colour, size or spacing literal. Everything visual is a class in
 *     styles.css, so one token change restyles every screen.
 *   · hardcode copy. Every visible string comes from shared/copy.ts, English first.
 *
 * Invariants that must survive every rewrite:
 *   · Selecting a timepoint REPLACES state — it never applies a delta on top of
 *     the previous one. That is what makes the demo safe to view in any order.
 *   · `reviewed` lives OUTSIDE the snapshot. Snapshots are fixed files and this
 *     value must survive every state replacement.
 *
 * Status: shell + public view. The other four screens are placeholders.
 * Owner: A(서진)
 */

import { useMemo, useState } from 'react';
import {
  snapshots, timepointIds, manifest, assertBundleIntegrity, issuerRegion,
} from './bundle';
import { t, type Lang } from '@shared/copy';
import type { TimepointId, Snapshot } from '@shared/types/snapshot';
import { TIMEPOINT_GROUPS, groupOf } from './timepoints';
import { NARRATIVE, CHIP_FIELDS, type ScreenKey as NScreen } from '@shared/narrative';
import { Narrative, DeltaChips, deltasFor } from './narrative';

type ScreenKey = 'user' | 'issuer' | 'lp' | 'val' | 'pub';

const SCREENS: ReadonlyArray<{ key: ScreenKey; copy: Parameters<typeof t>[0] }> = [
  { key: 'user',   copy: 'screen.user' },
  { key: 'issuer', copy: 'screen.issuer' },
  { key: 'lp',     copy: 'screen.lp' },
  { key: 'val',    copy: 'screen.verifier' },
  { key: 'pub',    copy: 'screen.public' },
];

/** Whole units, grouped. Amounts are USDC — never format as currency. */
const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
const n2 = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-3)}`;

export default function App() {
  const [lang] = useState<Lang>('en');
  const [current, setCurrent] = useState<TimepointId>('t0');
  const [screen, setScreen] = useState<ScreenKey>('pub');

  // Deliberately outside the snapshot — see the header note.
  const [reviewed, setReviewed] = useState<Set<TimepointId>>(new Set(['t0']));

  const integrity = useMemo(() => {
    try { assertBundleIntegrity(); return null; }
    catch (e) { return (e as Error).message; }
  }, []);

  if (integrity) {
    return (
      <div className="wrap" style={{ paddingBlock: '48px' }}>
        <div className="panel">
          <h3>Bundle error</h3>
          <p className="hint">{integrity}</p>
          <p className="note c">
            Run <code className="mono">pnpm verify:bundle shared/snapshots/sample</code> for details.
          </p>
        </div>
      </div>
    );
  }

  const s = snapshots[current];

  return (
    <>
      <div className="mockbar">
        <div className="wrap">
          <b>{t('app.title', lang)}</b>
          <span>{t('app.mockNotice', lang)}</span>
        </div>
      </div>

      <ChainBar s={s} />

      <div className="wrap">
        <header>
          <p className="eyebrow">Torna · Monad Instant Refund Protocol</p>
          <h1>{t('app.subtitle', lang)}</h1>
          <p className="lede">{t('app.lede', lang)}</p>
        </header>

        <TimepointNav
          current={current}
          reviewed={reviewed}
          lang={lang}
          onPick={(id) => {
            setCurrent(id);                                   // replaces state
            setReviewed((r) => new Set(r).add(id));           // survives it
          }}
        />

        <nav className="tabs">
          {SCREENS.map((sc) => (
            <button
              key={sc.key}
              type="button"
              data-tab={sc.key}
              aria-selected={screen === sc.key}
              onClick={() => setScreen(sc.key)}
            >
              {t(sc.copy, lang)}
            </button>
          ))}
        </nav>
      </div>

      <main>
        <div className="wrap">
          <Briefing s={s} screen={screen} lang={lang} onGo={setScreen} />
          <div className="cols">
            {screen === 'pub'
              ? <PublicView s={s} lang={lang} />
              : <Placeholder screen={screen} lang={lang} />}
          </div>
        </div>
      </main>
    </>
  );
}

/* ── on-chain status bar ─────────────────────────────────────── */

function ChainBar({ s }: { s: Snapshot }) {
  return (
    <div className="chain">
      <div className="wrap">
        <span className="ci"><span className="ci-k">Monad Testnet</span></span>
        <span className="ci"><span className="ci-k">chain</span><b className="mono">{s.chainId}</b></span>
        <span className="ci"><span className="ci-k">block</span><b className="mono">{n0(s.blockNumber)}</b></span>
        <span className="ci"><span className="ci-k">contract</span><b className="mono">{short(s.contract)}</b></span>
        <span className="ci"><span className="dot" />Envio indexer in sync</span>
      </div>
    </div>
  );
}

/* ── timepoint navigator ─────────────────────────────────────── */

function TimepointNav({
  current, reviewed, lang, onPick,
}: {
  current: TimepointId;
  reviewed: Set<TimepointId>;
  lang: Lang;
  onPick: (id: TimepointId) => void;
}) {
  // Follow the current timepoint, so jumping from a briefing lands on the
  // right category instead of leaving the viewer on a list that no longer
  // contains what they are looking at.
  const [cat, setCat] = useState(() => groupOf(current).key);
  const openKey = TIMEPOINT_GROUPS.some((g) => g.key === cat) ? cat : groupOf(current).key;
  const open = TIMEPOINT_GROUPS.find((g) => g.key === openKey)!;

  return (
    <section className="scen">
      <div className="cats">
        {TIMEPOINT_GROUPS.map((g) => {
          const seen = g.ids.filter((id) => reviewed.has(id)).length;
          const all = seen === g.ids.length;
          return (
            <button
              key={g.key}
              type="button"
              className={`cat${all ? ' clear' : ''}`}
              data-cat={g.key}
              aria-pressed={g.key === openKey}
              onClick={() => setCat(g.key)}
            >
              <b>{t(g.copy, lang)}</b>
              <span>
                {g.ids.length}
                {seen > 0 && !all && ` · ${seen} ${t('nav.viewed', lang)}`}
              </span>
            </button>
          );
        })}
      </div>

      <div className="sclist">
        {open.ids.map((id) => {
          const snap = snapshots[id];
          const isCurrent = id === current;
          // Dim once viewed — same rule as the mockup. It only stays readable
          // because the category filter keeps this list to 1-4 cards.
          const done = reviewed.has(id) && !isCurrent;
          return (
            <button
              key={id}
              type="button"
              className={`sbtn${done ? ' done' : ''}`}
              aria-pressed={isCurrent}
              onClick={() => onPick(id)}
            >
              <span className="sn">{id.replace('t', '')}</span>
              <span className="st">
                <b>{snap.label[lang]}</b>
                <span>{isCurrent ? t('nav.viewing', lang) : done ? t('nav.done', lang) : id}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ── briefing ───────────────────────────────────────────────── */

/**
 * "What changed here, and where to look." Every figure in it is resolved from
 * the snapshot, so it cannot drift from the tables below it.
 *
 * It is sticky and the only element on the page with a shadow, so it stays the
 * one thing that reads as an instruction rather than a reading.
 */
function Briefing({
  s, screen, lang, onGo,
}: { s: Snapshot; screen: ScreenKey; lang: Lang; onGo: (k: ScreenKey) => void }) {
  const n = NARRATIVE[s.timepointId];
  if (!n) return null;

  const byScreen = new Map<NScreen, typeof n.watch>();
  for (const w of n.watch) {
    byScreen.set(w.screen, [...(byScreen.get(w.screen) ?? []), w]);
  }

  return (
    <div className="pnote">
      <div className="pn-h">
        <b>{<Narrative text={n.title} s={s} lang={lang} />} · {s.timepointId}</b>
      </div>

      {n.soFar && (
        <p className="bf-so">
          <b>{t('nav.soFar', lang)}</b> <Narrative text={n.soFar} s={s} lang={lang} />
        </p>
      )}

      <div className="bf-grid">
        <div>
          <p className="bk">Situation</p>
          <p><Narrative text={n.situation} s={s} lang={lang} /></p>
        </div>
        <div>
          <p className="bk">Why it matters</p>
          <p><Narrative text={n.why} s={s} lang={lang} /></p>
        </div>
      </div>

      {n.designPoint && (
        <p className="note">
          <b>Design point</b> — <Narrative text={n.designPoint} s={s} lang={lang} />
        </p>
      )}

      <p className="pn-k">{t('nav.confirm', lang)}</p>
      <div className="blocks">
        {SCREENS.map((sc) => {
          const lines = byScreen.get(sc.key as NScreen);
          if (!lines) return null;
          const deltas = deltasFor(CHIP_FIELDS[sc.key as NScreen] ?? [], s);
          const here = sc.key === screen;
          return (
            <div key={sc.key} className={`rb${here ? '' : ''}`}>
              <div className="rb-h">
                <span className="wt">{t(sc.copy, lang)}</span>
                <button type="button" className="wgo" onClick={() => onGo(sc.key)}>
                  {here ? t('nav.reviewed', lang) : t('nav.confirm', lang)}
                </button>
              </div>
              <DeltaChips deltas={deltas} label={(path) => path.split('.').pop() ?? path} />
              <ul className="rbl">
                {lines.map((w, i) => (
                  <li key={i}><Narrative text={w.text} s={s} lang={lang} /></li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── public view ─────────────────────────────────────────────── */

function PublicView({ s, lang }: { s: Snapshot; lang: Lang }) {
  const p = s.pool;
  const m = s.metrics;
  const collateral = s.issuers.reduce((a, i) => a + i.collateralRemaining, 0);
  const tvl = p.lpDeposits + p.lpFeeAccrued - p.lpLossApplied + p.reserve + collateral;

  /* Ordered by how locked the money is — light to dark. Same rule as the
     loss waterfall, so the ramp means one thing across the whole product. */
  const split = [
    { v: p.cashAvailable,    cls: 'seg-1', pale: true,  label: 'Cash' },
    { v: p.advancedOutstanding, cls: 'seg-3', pale: false, label: 'Advanced' },
    { v: p.externalDeployed, cls: 'seg-2', pale: true,  label: 'External' },
  ].filter((x) => x.v > 0.5);
  const splitTotal = split.reduce((a, x) => a + x.v, 0) || 1;

  /* margin + reserve + LP senior = every dollar of confirmed loss. The
     snapshot carries the two tails, so the margin share is the remainder. */
  const marginHit = Math.max(0, m.lossTotal - p.reserveUsed - p.lpLossApplied);
  const absorb = [
    { n: 1, label: 'Issuer margin',     v: marginHit,       cls: 'seg-1' },
    { n: 2, label: 'Protocol reserve',  v: p.reserveUsed,   cls: 'seg-2' },
    { n: 3, label: 'LP senior',         v: p.lpLossApplied, cls: 'seg-3' },
    { n: 4, label: 'Held above cap',    v: p.capHeld,       cls: 'seg-4' },
  ];
  const absorbMax = Math.max(1, ...absorb.map((a) => a.v));

  return (
    <section className="stack" data-pane="pub">
      <div className="pband"><b>{t('screen.public', lang)}</b><span>{s.label[lang]}</span></div>

      <div className="panel">
        <div className="pubhead">
          <div>
            <h3>Torna</h3>
            <p className="hint">Shared pool for card refund advances · public status</p>
          </div>
          <div className="pubmeta">
            <span><b>Monad Testnet</b></span>
            <span className="mono">{short(s.contract)}</span>
            <span>as of block <b className="mono">{n0(s.blockNumber)}</b></span>
          </div>
        </div>

        <p className="sec-k">Pool <span>USDC</span></p>
        <div className="tiles">
          <Tile k="Total value locked" v={n0(tvl)} u="USDC" tone="hi" />
          <Tile k={t('metric.outstanding', lang)} v={n0(p.advancedOutstanding)} u="USDC" />
          <Tile k={t('metric.utilization', lang)} v={`${n2(m.utilizationPct)}%`} />
          <Tile k="Cash available" v={n0(p.cashAvailable)} u="USDC" />
          <Tile k={t('metric.reserve', lang)} v={n0(p.reserve)} u="USDC" />
        </div>

        <p className="sec-k">Where the capital sits <span>share of LP net asset value</span></p>
        <div className="stackbar">
          {split.map((x) => (
            <div
              key={x.label}
              className={`${x.cls}${x.pale ? ' pale' : ''}`}
              style={{ width: `${(x.v / splitTotal) * 100}%` }}
            >
              {x.label} {n0(x.v)}
            </div>
          ))}
        </div>
        {p.externalFrozen && (
          <p className="hint">
            The external venue is <span className="pill w">frozen</span>. The idle-deployment cap is
            50%, so the pool keeps operating with every deployed dollar locked.
          </p>
        )}

        <p className="sec-k">Performance <span>cumulative</span></p>
        <div className="tiles">
          <Tile k="Advanced to date" v={n0(m.cumulativeAdvanced)} u="USDC" tone="hi" />
          <Tile k="Refunds" v={n0(m.cumulativeCount)} />
          <Tile k={t('metric.repayRate', lang)} v={`${n2(m.repayRatePct)}%`} />
          <Tile
            k={t('metric.lossRate', lang)}
            v={`${n2(m.lossRatePct)}%`}
            u={t('metric.breakeven', lang)}
            tone={m.lossRatePct > 0.35 ? 'crit' : undefined}
          />
          <Tile k="Rejected" v={n0(m.rejectedRequests)} tone={m.rejectedRequests ? 'warn' : undefined} />
        </div>
      </div>

      <div className="panel">
        <h3>Risk and loss</h3>
        <p className="hint">
          Losses are not hidden. Which capital absorbed how much is public.
        </p>
        <p className="sec-k">
          Absorption order <span>{n0(m.lossTotal)} USDC confirmed</span>
        </p>
        <div className="fall">
          {absorb.map((a) => (
            <div key={a.n} className={`frow${a.v > 0 ? ' hit' : ''}`}>
              <span className="fidx">{a.n}</span>
              <span className="fbar">
                <i className={a.cls} style={{ width: `${(a.v / absorbMax) * 100}%` }} />
                <span>{a.label}</span>
              </span>
              <span className="num">{n0(a.v)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3>Member issuers</h3>
        <p className="hint">
          Membership is public. Per-issuer outstanding is not.
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Issuer</th>
                <th>Region</th>
                <th className="num">Collateral</th>
                <th className="num">{t('metric.effectiveLimit', lang)}</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {s.issuers.map((i) => (
                <tr key={i.key}>
                  <td><b>{i.name}</b></td>
                  <td className="mono">{issuerRegion(i.key)}</td>
                  <td className="num">{n0(i.collateralRemaining)}</td>
                  <td className="num">{n0(i.effectiveLimit)}</td>
                  <td>
                    <span className={`pill ${i.state === 'Active' ? 'o' : i.state === 'MarginCall' ? 'w' : 'c'}`}>
                      {t(`issuerState.${i.state}` as Parameters<typeof t>[0], lang)}
                    </span>
                    {i.rampUp && <span className="hint"> ramp-up</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>On-chain events</h3>
        <p className="hint">
          Indexer data never triggers a payout on its own. Balances move on a
          confirmed transaction receipt.
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Block</th><th>Event</th><th>Target</th>
                <th className="num">Amount</th><th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {s.events.slice(0, 12).map((e, i) => (
                <tr key={`${e.txHash}-${i}`}>
                  <td className="mono">{n0(e.blockNumber)}</td>
                  <td className="mono">{e.name}</td>
                  <td className="mono">{short(e.target)}</td>
                  <td className="num">{e.amount ? n0(e.amount) : '—'}</td>
                  <td className="mono"><span className="hashlink">{short(e.txHash)}</span></td>
                </tr>
              ))}
              {s.events.length === 0 && (
                <tr><td className="empty-row" colSpan={5}>No events at this timepoint.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="note">
          Yields shown are realised history and do not guarantee future returns.
          Liquidity provision is open to institutions.
        </p>
      </div>

      <p className="hint mono">
        run {manifest?.runId} · snapshot {s.timepointId} · captured {s.capturedAt}
      </p>
    </section>
  );
}

function Tile({ k, v, u, tone }: { k: string; v: string; u?: string; tone?: 'hi' | 'ok' | 'warn' | 'crit' }) {
  return (
    <div className={`tile${tone ? ` ${tone}` : ''}`}>
      <div className="k">{k}</div>
      <div className="v">{v}{u && <small>{u}</small>}</div>
    </div>
  );
}

function Placeholder({ screen, lang }: { screen: ScreenKey; lang: Lang }) {
  const copy = SCREENS.find((x) => x.key === screen)!.copy;
  return (
    <section className="stack" data-pane={screen}>
      <div className="pband"><b>{t(copy, lang)}</b><span>not built yet</span></div>
      <div className="panel">
        <h3>{t(copy, lang)}</h3>
        <p className="hint">
          This screen is next. The shell, the design tokens and the snapshot
          loader are already working — see the public view.
        </p>
      </div>
    </section>
  );
}
