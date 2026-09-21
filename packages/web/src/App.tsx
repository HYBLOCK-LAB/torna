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
  snapshots, timepointIds, manifest, assertBundleIntegrity,
  issuerRegion, refundLabel, acquirerLabel, acquirerId,
} from './bundle';
import { t, tp, type CopyKey, type Lang } from '@shared/copy';
import { PARAMS } from '@shared/params';
import type {
  TimepointId, Snapshot,
  IssuerState as IssuerStateT, PositionState as PositionStateT,
} from '@shared/types/snapshot';
import {
  TIMEPOINT_GROUPS, NAV_TIMEPOINTS, groupOf, navIndexOf, scenLabel, previousTimepoint, isFollowUp,
} from './timepoints';
import { NARRATIVE, CHIP_FIELDS, type ScreenKey as NScreen } from '@shared/narrative';
import { Narrative, DeltaChips, deltasFor } from './narrative';
import { Donut, Gauge, Legend, Trail, type Slice } from './charts';
import { CardholderApp, NextStep, type AppStatus } from './cardholder';
import {
  totalValueLocked, reserveAccrued, marginAbsorbed,
  withdrawalSplit, issuerMargin, acquirerConcentrationPct, lpDepositRoom, limitBoundByPool,
  yearOne, lpNetResult, newIssuerCap,
} from './derive';

type ScreenKey = 'user' | 'issuer' | 'lp' | 'val' | 'pub';

const SCREENS: ReadonlyArray<{ key: ScreenKey; copy: CopyKey }> = [
  { key: 'user',   copy: 'screen.user' },
  { key: 'issuer', copy: 'screen.issuer' },
  { key: 'lp',     copy: 'screen.lp' },
  { key: 'val',    copy: 'screen.verifier' },
  { key: 'pub',    copy: 'screen.public' },
];

/**
 * The tab bar is split in two, as in the mockup. The consumer screen and the
 * operating screens are different claims — one says "this is what a cardholder
 * lives through", the other "and here is the machinery". Putting all five in
 * one row reads as five equal dashboards and loses that.
 */
const TAB_GROUPS: ReadonlyArray<{ label: CopyKey; keys: ScreenKey[] }> = [
  { label: 'tabs.consumer', keys: ['user'] },
  { label: 'tabs.backend',  keys: ['issuer', 'lp', 'val', 'pub'] },
];

/** Whole units, grouped. Amounts are USDC — never format as currency. */
const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
const n2 = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-3)}`;

export default function App() {
  const [lang] = useState<Lang>('en');
  // t0: the state the cardholder run itself produced. Every scenario, t1
  // included, is then met as a card you open — never one already applied.
  const [current, setCurrent] = useState<TimepointId>('t0');
  // The demo opens on the cardholder screen: the problem has to land before
  // any dashboard does.
  const [screen, setScreen] = useState<ScreenKey>('user');

  // Deliberately outside the snapshot — see the header note.
  const [reviewed, setReviewed] = useState<Set<TimepointId>>(new Set());
  /** Which screens have been visited AT THIS TIMEPOINT. Resets on a move. */
  const [seen, setSeen] = useState<Set<ScreenKey>>(new Set());
  /**
   * Timepoints whose every watched screen has been opened. This — not the set
   * of cards clicked — is what the progress counter reports: clicking a card
   * changes the figures, it does not mean anybody looked at them.
   */
  const [done, setDone] = useState<Set<TimepointId>>(new Set());
  const [briefOpen, setBriefOpen] = useState(true);
  const [intro, setIntro] = useState(true);
  const [appStatus, setAppStatus] = useState<AppStatus>({ mode: 'off', step: 'home', finished: false, pipe: 0, settleSeconds: null, repaid: false });
  /** Screens with something new to see since the cardholder run finished. */
  const [dirty, setDirty] = useState<Set<ScreenKey>>(new Set());
  /**
   * The operating screen to return to from the cardholder tab. Coming back to
   * the phone mid-demo is normal — the phone replays itself — so the only
   * thing the viewer can lose is their place in the scenarios. This holds it.
   */
  const [lastOps, setLastOps] = useState<ScreenKey>('issuer');

  /**
   * A timepoint whose briefing is open but whose state has NOT been applied.
   * The mockup's most important beat: read what is about to happen and why,
   * THEN press the button and watch the figures move. Applying on the card
   * click spoils the reveal — the numbers change while the viewer is still
   * reading the setup.
   */
  const [pending, setPending] = useState<TimepointId | null>(null);

  /** Bumped on a reset so the cardholder app remounts at its own start. */
  const [runKey, setRunKey] = useState(0);

  /** Card click. Opens the briefing; it does not touch the snapshot. */
  const openBrief = (id: TimepointId) => {
    if (id === current) {
      // Already applied — t1 in particular, which the cardholder run itself
      // produced. Opening its card is the viewer having seen it, so tick it;
      // otherwise "follow in order" keeps offering the point they are on.
      setPending(null);
      setReviewed((r) => new Set(r).add(id));
    } else {
      setPending(id);
    }
    setBriefOpen(true);
  };

  const [noteOpen, setNoteOpen] = useState(true);

  const goTimepoint = (id: TimepointId) => {
    setPending(null);
    setCurrent(id);                                 // replaces state
    setReviewed((r) => new Set(r).add(id));         // survives it
    setSeen(new Set());
    setBriefOpen(true);
    setNoteOpen(true);
    // Light the unread dot on every screen this timepoint moved, minus the one
    // already open. This is how a viewer knows where to look next.
    const moved = NARRATIVE[id]?.dirty ?? [];
    setDirty(new Set(moved.filter((k) => k !== screen) as ScreenKey[]));
  };

  /**
   * Rewind drops everything opened after this timepoint, so "go back and try
   * another branch" actually goes back. Re-selecting the same timepoint would
   * only reopen the card — a control that appears to do nothing.
   */
  /**
   * Undo a timepoint. The state goes back to the one BEFORE it — rewinding
   * scenario 3 leaves the pool as it stood after scenario 2 — and the briefing
   * stays open on the timepoint just undone, gated, so the viewer can run it
   * again immediately. Landing ON the timepoint instead would undo nothing:
   * the figures would be identical and the control would look broken.
   */
  const rewind = (id: TimepointId) => {
    // Undoing a follow-up leaves its parent standing, so the parent's own
    // review tick survives; undoing a scenario clears that scenario too.
    const cut = navIndexOf(id) + (isFollowUp(id) ? 1 : 0);
    setReviewed((r) => new Set([...r].filter((x) => navIndexOf(x) < cut)));
    setDone((d) => new Set([...d].filter((x) => navIndexOf(x) < cut)));
    setSeen(new Set());
    setDirty(new Set());
    setCurrent(previousTimepoint(id));
    setPending(id);              // the brief reopens on "View this point"
    setBriefOpen(true);
    setNoteOpen(true);
  };

  const resetAll = () => {
    setReviewed(new Set()); setDone(new Set()); setSeen(new Set()); setDirty(new Set());
    setPending(null); setLastOps('issuer');
    setAppStatus({ mode: 'off', step: 'home', finished: false, pipe: 0, settleSeconds: null, repaid: false });
    setRunKey((k) => k + 1);
    setCurrent('t0'); setScreen('user'); setBriefOpen(true); setNoteOpen(true);
  };
  /**
   * Switch screen and, when the briefing named a panel, scroll to it and flash
   * it. A judge sent to a six-panel screen without this has to hunt for the
   * figure they were just promised.
   */
  const goScreen = (k: ScreenKey, anchor?: string) => {
    setScreen(k);
    if (k !== 'user') setLastOps(k);
    setSeen((v) => {
      const next = new Set(v).add(k);
      const watched = new Set((NARRATIVE[current]?.watch ?? [])
        .filter((w) => !w.still)
        .map((w) => w.screen as ScreenKey));
      // t0 is not a scenario, so it never counts towards the progress figure.
      if (NAV_TIMEPOINTS.includes(current) && [...watched].every((x) => next.has(x))) {
        setDone((d) => new Set(d).add(current));
      }
      return next;
    });
    setDirty((d) => { const n = new Set(d); n.delete(k); return n; });
    setNoteOpen(true);
    if (!anchor) return;
    window.setTimeout(() => {
      const el = document.getElementById(anchor);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('spot');
      window.setTimeout(() => el.classList.remove('spot'), 1400);
    }, 60);
  };

  const integrity = useMemo(() => {
    try { assertBundleIntegrity(); return null; }
    catch (e) { return (e as Error).message; }
  }, []);

  if (integrity) {
    return (
      <div className="wrap" style={{ paddingBlock: '48px' }}>
        <div className="panel">
          <h3>{t('err.bundle', lang)}</h3>
          <p className="hint">{integrity}</p>
          <p className="note c">{t('err.bundleHelp', lang)}</p>
        </div>
      </div>
    );
  }

  const s = snapshots[current];
  const onUser = screen === 'user';

  /* ARRANGEMENT. One point per timepoint the viewer has actually opened, in
     order, reading a figure each of those snapshots already carries. Nothing is
     interpolated and unopened timepoints are absent — a line through a scene
     nobody watched would claim a story the demo never told. */
  const trail = NAV_TIMEPOINTS
    .filter((id) => reviewed.has(id) && snapshots[id])
    // Axis ticks are scenario numbers, not file keys: 1, 2, 3 — same rule as
    // everywhere else on screen.
    .map((id) => ({ id: id.replace(/^t/, ''), value: totalValueLocked(snapshots[id]) }));

  return (
    <>
      {intro && (
        <Intro
          lang={lang}
          onStart={() => {
            // Start means start. A reload that left a warm dev server, a
            // restored tab, or a second run in the same session must not open
            // on somebody else's review ticks — the demo always begins clean,
            // on the phone.
            resetAll();
            setIntro(false);
          }}
        />
      )}

      <div className="mockbar">
        <div className="wrap">
          <b>{t('app.title', lang)}</b>
          <span>{t('app.mockNotice', lang)}</span>
        </div>
      </div>

      <ChainBar s={s} lang={lang} />

      <div className="wrap">
        <header>
          <p className="eyebrow">Torna · Monad Instant Refund Protocol</p>
          <h1>{t('app.subtitle', lang)}</h1>
          <p className="lede">{t('app.lede', lang)}</p>
        </header>

        {onUser ? (
          <NextStep
            status={appStatus} lang={lang}
            onOpenConsole={() => goScreen('issuer')}
          />
        ) : (
        <section className="scen">
          <ScenHead
            reviewed={reviewed} done={done} lang={lang}
            onGo={openBrief} onReset={resetAll}
          />
          <TimepointNav
            current={pending ?? current}
            applied={pending === null}
            reviewed={reviewed}
            lang={lang}
            onPick={openBrief}
          />
          {briefOpen && (pending !== null || current !== 't0') && (
            <ScenarioBrief
              s={snapshots[pending ?? current]}
              applied={pending === null}
              seen={seen} reviewed={reviewed} lang={lang}
              onGo={goScreen}
              onApply={() => goTimepoint(pending ?? current)}
              onApplyFollow={goTimepoint}
              onClose={() => setBriefOpen(false)}
              onRewind={() => rewind(current)}
              onPick={openBrief}
            />
          )}
        </section>
        )}

        <nav className="tabs" role="tablist">
          {TAB_GROUPS.map((g) => (
            <span className="tg" key={g.label}>
              <span className="tg-k">{t(g.label, lang)}</span>
              {g.keys.map((k) => {
                const sc = SCREENS.find((x) => x.key === k)!;
                return (
                  <button
                    key={k} type="button" role="tab" data-tab={k}
                    aria-selected={screen === k}
                    onClick={() => goScreen(k)}
                  >
                    {t(sc.copy, lang)}
                    {dirty.has(k) && <i className="nd" />}
                  </button>
                );
              })}
            </span>
          ))}
        </nav>
      </div>

      <main>
        <div className="wrap">
          {noteOpen && !onUser && (
            <ScreenNote s={s} screen={screen} lang={lang} onClose={() => setNoteOpen(false)} />
          )}
          <div className="cols">
            {screen === 'user' ? (
              <>
                {current !== 't0' && (
                  <div className="bf-nudge" style={{ margin: '0 0 13px' }}>
                    <p>{t('user.backNote', lang).replaceAll('{id}', scenLabel(current, lang))}</p>
                    <button type="button" className="wgo" onClick={() => goScreen(lastOps)}>
                      {t('user.backToOps', lang).replaceAll('{id}', scenLabel(current, lang))}
                    </button>
                  </div>
                )}
                <CardholderApp
                  key={runKey}
                  lang={lang}
                  onStatus={setAppStatus}
                  onFinished={() => setDirty(new Set(['issuer', 'lp', 'val', 'pub']))}
                />
              </>
            )
              : screen === 'pub' ? <PublicView s={s} lang={lang} settleSeconds={appStatus.settleSeconds} trail={trail} />
              : screen === 'lp' ? <LpView s={s} lang={lang} />
              : screen === 'issuer' ? <IssuerView s={s} lang={lang} pipe={appStatus.pipe} />
              : screen === 'val' ? <VerifierView s={s} lang={lang} />
              : <Placeholder screen={screen} lang={lang} />}
          </div>
        </div>
      </main>

      <div className="wrap logwrap">
        <footer>{t('foot.fiction', lang)}</footer>
      </div>
    </>
  );
}

/**
 * The opening card. Four sentences that tell the viewer what to press and in
 * what order — without it, a judge lands on a card app and does not know the
 * first screen is meant to fail.
 */
function Intro({ lang, onStart }: { lang: Lang; onStart: () => void }) {
  const steps: CopyKey[] = ['intro.1', 'intro.2', 'intro.3', 'intro.4'];
  return (
    <div className="intro">
      <div className="intro-card" role="dialog" aria-modal="true">
        <h2>{t('intro.title', lang)}</h2>
        <p>{t('intro.lede', lang)}</p>
        <ol>
          {steps.map((k) => <li key={k}><Rich text={t(k, lang)} /></li>)}
        </ol>
        <button type="button" className="btn big wide" onClick={onStart}>
          {t('intro.start', lang)}
        </button>
      </div>
    </div>
  );
}

/** **bold** in copy. The only markup a copy string may carry. */
function Rich({ text }: { text: string }) {
  return <>{text.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</>;
}

/* ── on-chain status bar ─────────────────────────────────────── */

function ChainBar({ s, lang }: { s: Snapshot; lang: Lang }) {
  return (
    <div className="chain">
      <div className="wrap">
        <span className="ci"><span className="ci-k">Monad Testnet</span></span>
        <span className="ci"><span className="ci-k">chain</span><b className="mono">{s.chainId}</b></span>
        <span className="ci"><span className="ci-k">block</span><b className="mono">{n0(s.blockNumber)}</b></span>
        <span className="ci"><span className="ci-k">contract</span><b className="mono">{short(s.contract)}</b></span>
        <span className="ci">
          <span className="ci-k">{t('chain.lastEvent', lang)}</span>
          <b className="mono">{s.events[0]?.name ?? '—'}</b>
        </span>
        <span className="ci"><span className="dot" />Envio indexer in sync</span>
        <span className="ci"><span>{t('chain.oneLedger', lang)}</span></span>
      </div>
    </div>
  );
}

/* ── timepoint navigator ─────────────────────────────────────── */

function TimepointNav({
  current, applied, reviewed, lang, onPick,
}: {
  current: TimepointId;
  /** False while the focused timepoint is only being read, not applied. */
  applied: boolean;
  reviewed: Set<TimepointId>;
  lang: Lang;
  onPick: (id: TimepointId) => void;
}) {
  // Follow the current timepoint, so jumping from a briefing lands on the
  // right category instead of leaving the viewer on a list that no longer
  // contains what they are looking at.
  const [cat, setCat] = useState(() => groupOf(current).key);
  // Following the focused timepoint is what makes "next scenario →" work: that
  // button jumps across category boundaries, and without this the list below
  // stays on the old category and the card it just opened is nowhere in it.
  const [lastFocus, setLastFocus] = useState(current);
  if (current !== lastFocus) {
    setLastFocus(current);
    setCat(groupOf(current).key);
  }
  const openKey = TIMEPOINT_GROUPS.some((g) => g.key === cat) ? cat : groupOf(current).key;
  const open = TIMEPOINT_GROUPS.find((g) => g.key === openKey)!;

  return (
    <>
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
                <span>
                  {isCurrent
                    ? t(applied ? 'nav.viewing' : 'nav.reading', lang)
                    : done ? t('nav.done', lang) : scenLabel(id, lang)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ── scenario control strip header ───────────────────────────── */

/**
 * The bar above the timepoint picker. Four jobs, all of them about not losing
 * the viewer: say what this list is, say how far through it they are, offer the
 * next unseen timepoint, and let them start over.
 *
 * The caption matters more than it looks. Without it a judge reads the running
 * loss figures as ordinary performance, when in fact eight of the nine
 * timepoints are deliberate incidents.
 */
function ScenHead({
  reviewed, done, lang, onGo, onReset,
}: {
  reviewed: Set<TimepointId>;
  done: Set<TimepointId>;
  lang: Lang;
  onGo: (id: TimepointId) => void;
  onReset: () => void;
}) {
  const next = NAV_TIMEPOINTS.find((id) => !reviewed.has(id));
  return (
    <div className="sc-head">
      <span className="sc-k">{t('scen.label', lang)}</span>
      <p className="sc-cap">{t('scen.caption', lang)}</p>
      <span className="sc-prog">
        {t('scen.progress', lang)
          .replace('{n}', String(done.size))
          .replace('{total}', String(NAV_TIMEPOINTS.length))}
      </span>
      <button
        type="button" className="sc-follow"
        disabled={!next}
        onClick={() => next && onGo(next)}
      >
        {next ? t('scen.followNext', lang).replace('{id}', scenLabel(next, lang)) : t('scen.allDone', lang)}
      </button>
      <button type="button" className="bf-rew" onClick={onReset}>{t('scen.reset', lang)}</button>
    </div>
  );
}

/* ── scenario brief ──────────────────────────────────────────── */

/**
 * The card inside the control strip: what this timepoint is, why it matters,
 * and which screens changed.
 *
 * It carries no "what to look at" lines — those belong on the screen they talk
 * about (ScreenNote). Putting both here was what made this card long enough
 * that nobody read it.
 *
 * Once every screen has been visited the result block folds away and a hand-off
 * to the next timepoint takes its place, so a timepoint never ends in a dead end.
 */
function ScenarioBrief({
  s, applied, seen, reviewed, lang, onGo, onApply, onApplyFollow, onClose, onRewind, onPick,
}: {
  s: Snapshot;
  /** False while this timepoint is being read but has not been applied. */
  applied: boolean;
  seen: Set<ScreenKey>;
  reviewed: Set<TimepointId>;
  lang: Lang;
  onGo: (k: ScreenKey, anchor?: string) => void;
  onApply: () => void;
  /** Applies a follow-up straight away: it continues this timepoint, so it is
      not a card to be read first. */
  onApplyFollow: (id: TimepointId) => void;
  onClose: () => void;
  onRewind: () => void;
  onPick: (id: TimepointId) => void;
}) {
  const n = NARRATIVE[s.timepointId];
  const [unfolded, setUnfolded] = useState(false);
  const [nudged, setNudged] = useState(false);
  if (!n) return null;

  const group = groupOf(s.timepointId);
  /* Only screens with something to look AT. A screen whose correct outcome is
     that nothing moved has nothing to check, so it never asks to be opened and
     never holds the timepoint short of complete — it just says so below. */
  /* The ORDER is the order the watch lines are written in, not the tab order:
     each timepoint tells its story through a particular sequence of screens
     ("LP dashboard → issuer console"), and sorting by tab breaks the sentence. */
  const order = (k: ScreenKey) => n.watch.findIndex((w) => w.screen === k && !w.still);
  const screens = SCREENS.filter((sc) => order(sc.key) >= 0)
    .sort((a, b) => order(a.key) - order(b.key));
  // A timepoint whose every screen is a "nothing moved" screen is complete the
  // moment it is applied — there is nothing to go and look at.
  const allSeen = screens.length === 0 || screens.every((sc) => seen.has(sc.key));

  // Screens whose correct outcome is that nothing moved.
  const stillOrder = (k: ScreenKey) => n.watch.findIndex((w) => w.screen === k && w.still);
  const stillScreens = SCREENS.filter((sc) => stillOrder(sc.key) >= 0)
    .sort((a, b) => stillOrder(a.key) - stillOrder(b.key));

  const idx = navIndexOf(s.timepointId);
  const nextPoint = idx >= 0 ? NAV_TIMEPOINTS[idx + 1] : undefined;
  const laterSeen = NAV_TIMEPOINTS.slice(idx + 1).filter((id) => reviewed.has(id)).length;
  const follow = n.follow && !reviewed.has(n.follow.next) ? n.follow : null;

  /* Opening a timepoint whose setup you have not seen. Not a block — a nudge,
     with the door left open, because a judge who wants to jump should be able to. */
  if (n.nudge && !reviewed.has(n.nudge.need) && !nudged) {
    return (
      <div className="brief">
        <div className="bf-nudge">
          <p>
            <b>{t('bf.nudgeTitle', lang).replace('{id}', scenLabel(n.nudge.need, lang))}</b>{' '}
            <Narrative text={n.nudge.text} s={s} lang={lang} />
          </p>
          <button type="button" className="wgo" onClick={() => onPick(n.nudge!.need)}>
            {t('bf.nudgeGo', lang).replace('{id}', scenLabel(n.nudge.need, lang))}
          </button>
          <button type="button" className="bf-rew" onClick={() => setNudged(true)}>
            {t('bf.nudgeAnyway', lang)}
          </button>
        </div>
      </div>
    );
  }

  const results = (
    <div className="blocks">
      {screens.map((sc) => {
        const deltas = deltasFor(CHIP_FIELDS[sc.key as NScreen] ?? [], s);
        const done = seen.has(sc.key);
        const anchor = n.watch.find((w) => w.screen === sc.key && w.anchor)?.anchor;
        return (
          <div key={sc.key} className={`rb${done ? ' ok' : ''}`}>
            <div className="rb-h">
              <span className="wt">{t(sc.copy, lang)}</span>
              <button type="button" className="wgo" onClick={() => onGo(sc.key, anchor)}>
                {done ? t('nav.reviewed', lang) : t('nav.confirm', lang)}
              </button>
            </div>
            <DeltaChips deltas={deltas} label={(path) => fieldLabel(path, lang)} />
          </div>
        );
      })}

      {stillScreens.length > 0 && (
        <div className="rb stat">
          <div className="rb-h">
            <span className="wt">{t('bf.noChangeTitle', lang)}</span>
            <span className="rb-nochange">
              {stillScreens.map((sc) => t(sc.copy, lang)).join(' · ')}
            </span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="brief">
      <div className="bf-top">
        <span className="pill n">{t(group.copy, lang)}</span>
        <h4>{scenLabel(s.timepointId, lang)} · <Narrative text={n.title} s={s} lang={lang} /></h4>
        {applied && allSeen && <span className="pill o">{t('bf.allDone', lang)}</span>}
        <button type="button" className="bf-x" onClick={onClose}>{t('bf.close', lang)}</button>
      </div>

      {n.soFar && (
        <p className="bf-so">
          <b>{t('nav.soFar', lang)}</b> <Narrative text={n.soFar} s={s} lang={lang} />
        </p>
      )}

      <div className="bf-grid">
        <div>
          <p className="bk">{t('bf.situation', lang)}</p>
          <p><Narrative text={n.situation} s={s} lang={lang} /></p>
        </div>
        <div>
          <p className="bk">{t('bf.why', lang)}</p>
          <p><Narrative text={n.why} s={s} lang={lang} /></p>
        </div>
      </div>

      {n.designPoint && (
        <p className="note">
          <b>{t('bf.designPoint', lang)}</b> — <Narrative text={n.designPoint} s={s} lang={lang} />
        </p>
      )}

      {!applied ? (
        <div className="bf-run">
          <button type="button" className="btn big" onClick={onApply}>
            {t('nav.viewTimepoint', lang)}
          </button>
          <p>{t('nav.viewHint', lang)}</p>
        </div>
      ) : allSeen ? (
        <>
          <button type="button" className="fold" onClick={() => setUnfolded((v) => !v)}>
            {t('bf.folded', lang).replace('{n}', String(screens.length))} {unfolded ? '▴' : '▾'}
          </button>
          {unfolded && results}
          <div className="bf-done">
            <p>{t('bf.doneAll', lang).replace('{id}', scenLabel(s.timepointId, lang))}</p>
            {/* No "next scenario" while a follow-up is outstanding: this
                incident is not closed, and the button for it sits just below,
                in the stage block. Two of the same button is one too many. */}
            {follow ? null : nextPoint ? (
              <button type="button" className="wgo" onClick={() => onPick(nextPoint)}>
                {t('bf.nextPoint', lang)
                  .replace('{id}', scenLabel(nextPoint, lang))
                  .replace('{title}', NARRATIVE[nextPoint].title[lang] || NARRATIVE[nextPoint].title.ko)}
              </button>
            ) : (
              <button type="button" className="wgo" onClick={() => onGo('pub')}>
                {t('bf.seeEverything', lang)}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="bk">{t('bf.results', lang)}</p>
          {results}
        </>
      )}

      {applied && follow && (
        <div className="bf-stage">
          <p><Narrative text={follow.text} s={s} lang={lang} /></p>
          <button type="button" className="btn" onClick={() => onApplyFollow(follow.next)}>
            {follow.btn[lang] || follow.btn.ko}
          </button>
        </div>
      )}

      {applied && (
      <div className="bf-more">
        <button type="button" className="bf-rew" onClick={onRewind}>
          {t('nav.rewind', lang)}
        </button>
        <span className="hint">
          {laterSeen > 0
            ? t('bf.rewindNoteAlso', lang)
                .replace('{id}', scenLabel(s.timepointId, lang)).replace('{n}', String(laterSeen))
            : t('bf.rewindNote', lang).replace('{id}', scenLabel(s.timepointId, lang))}
        </span>
      </div>
      )}
    </div>
  );
}

/* ── per-screen note ─────────────────────────────────────────── */

/**
 * The sticky card on a screen: what moved here, and what to look at. Short by
 * construction — it only ever carries one screen's worth.
 *
 * It is the only element on the page with a shadow, so it reads as an
 * instruction rather than as one more panel.
 */
function ScreenNote({
  s, screen, lang, onClose,
}: { s: Snapshot; screen: ScreenKey; lang: Lang; onClose: () => void }) {
  const n = NARRATIVE[s.timepointId];
  if (!n) return null;

  const lines = n.watch.filter((w) => w.screen === (screen as NScreen));
  const deltas = deltasFor(CHIP_FIELDS[screen as NScreen] ?? [], s);
  if (lines.length === 0 && deltas.length === 0) return null;

  return (
    <div className="pnote">
      <div className="pn-h">
        <b>{t('bf.onThisScreen', lang).replace('{id}', scenLabel(s.timepointId, lang))}</b>
        <button type="button" className="pn-x" onClick={onClose}>{t('bf.close', lang)}</button>
      </div>

      {deltas.length > 0 && (
        <>
          <p className="pn-k">{t('bf.changed', lang)}</p>
          <DeltaChips deltas={deltas} label={(path) => fieldLabel(path, lang)} />
        </>
      )}

      {lines.length > 0 && (
        <>
          <p className="pn-k">{t('bf.watch', lang)}</p>
          <ul className="rbl">
            {lines.map((w, i) => (
              <li key={i}><Narrative text={w.text} s={s} lang={lang} /></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * A snapshot path shown on a chip. Reuses the metric names already translated
 * in copy.ts, and falls back to the last path segment for anything not named.
 */
const FIELD_LABEL: Record<string, CopyKey> = {
  'pool.netAssetValue':       'metric.nav',
  'pool.advancedOutstanding': 'metric.outstanding',
  'pool.reserve':             'metric.reserve',
  'pool.cashAvailable':       'wd.instant',
  'pool.lpLossApplied':       'fall.lp',
  'pool.capHeld':             'metric.capHeld',
  'metrics.cumulativeCount':  'tile.refundCount',
  'metrics.lossTotal':        'tile.lossConfirmed',
  'metrics.lossRatePct':      'metric.lossRate',
  'metrics.rejectedRequests': 'tile.rejected',
};

function fieldLabel(path: string, lang: Lang): string {
  const key = FIELD_LABEL[path];
  return key ? t(key, lang) : (path.split('.').pop() ?? path);
}

/* ── public view ─────────────────────────────────────────────── */

function PublicView({ s, lang, settleSeconds, trail }: { s: Snapshot; lang: Lang; settleSeconds: number | null; trail: Array<{ id: string; value: number }> }) {
  const p = s.pool;
  const m = s.metrics;
  const tvl = totalValueLocked(s);

  /* Ordered by how locked the money is — light to dark. Same rule as the loss
     waterfall, so the ramp means one thing across the whole product. */
  const split = [
    { v: p.cashAvailable,       cls: 'seg-1', pale: true,  k: 'wd.instant' as const },
    { v: p.advancedOutstanding, cls: 'seg-3', pale: false, k: 'bucket.advanced' as const },
    { v: p.externalDeployed,    cls: 'seg-2', pale: true,  k: 'bucket.deployed' as const },
  ].filter((x) => x.v > 0.5);
  const splitTotal = split.reduce((a, x) => a + x.v, 0) || 1;

  const absorb = [
    { n: 1, k: 'fall.margin',  sub: 'fall.margin.sub',  v: marginAbsorbed(s), cls: 'seg-1' },
    { n: 2, k: 'fall.reserve', sub: 'fall.reserve.sub', v: p.reserveUsed,   cls: 'seg-2' },
    { n: 3, k: 'fall.lp',      sub: 'fall.lp.sub',      v: p.lpLossApplied, cls: 'seg-3' },
    { n: 4, k: 'fall.cap',     sub: 'fall.cap.sub',     v: p.capHeld,       cls: 'seg-4' },
  ] as const;
  const absorbMax = Math.max(1, ...absorb.map((a) => a.v));

  const RULES = [
    'collateral', 'lossShare', 'fee', 'cap', 'deploy',
    'issuerAcq', 'poolAcq', 'issuerConc', 'lpCap', 'lpSingle',
  ] as const;

  return (
    <section className="stack" data-pane="pub">
      <div className="pband"><b>{t('screen.public', lang)}</b><span>{s.label[lang]}</span></div>

      <div className="panel">
        <div className="pubhead">
          <div>
            <h3>{t('app.title', lang)}</h3>
            <p className="hint">{t('hint.publicLede', lang)}</p>
          </div>
          <div className="pubmeta">
            <span><b>Monad Testnet</b></span>
            <span className="mono">{short(s.contract)}</span>
            <span className="mono">block {n0(s.blockNumber)}</span>
          </div>
        </div>

        <p className="sec-k">{t('sec.pool', lang)}<span>USDC</span></p>
        <div className="tiles">
          <Tile k={t('tile.tvl', lang)} v={n0(tvl)} u="USDC" tone="hi" />
          <Tile k={t('tile.outstanding', lang)} v={n0(p.advancedOutstanding)} u="USDC" />
          <Tile k={t('tile.utilization', lang)} v={`${n2(m.utilizationPct)}%`} />
          <Tile
            k={t('tile.instantOut', lang)}
            v={`${n0(p.netAssetValue > 0 ? (p.cashAvailable / p.netAssetValue) * 100 : 0)}%`}
            u={t('tile.ofNav', lang)}
          />
          <Tile k={t('tile.reserveLeft', lang)} v={n0(p.reserve)} u="USDC" />
          <Tile k={t('tile.avgTerm', lang)} v={String(PARAMS.avgTermDays)} u={t('tile.days', lang)} />
          {/* The one figure an LP looks for. Not a projection: the year the
              pool actually ran, before the incidents were stacked on it. */}
          <Tile
            k={t('tile.lpRealised', lang)}
            v={`${n2(yearOne(snapshots.t0, snapshots.t1).annualPct)}%`}
            u={t('tile.annualPast', lang)}
          />
        </div>

        <p className="sec-k">{t('sec.capitalSits', lang)}<span>{t('sec.ofNav', lang)}</span></p>
        <div className="stackbar">
          {split.map((x) => (
            <div
              key={x.k}
              className={`${x.cls}${x.pale ? ' pale' : ''}`}
              style={{ width: `${(x.v / splitTotal) * 100}%` }}
            >
              {t(x.k, lang)} {n0(x.v)}
            </div>
          ))}
        </div>
        <p className="hint">
          {p.externalFrozen ? tp('pub.deployFrozen', lang) : tp('hint.lpComposition', lang)}
        </p>

        {trail.length >= 2 && (
          <div className="trailwrap">
            <p className="sec-k">{t('sec.navTrend', lang)}<span>{t('sec.navTrendSub', lang)}</span></p>
            <Trail points={trail} format={n0} />
          </div>
        )}

        <p className="sec-k">{t('sec.performance', lang)}<span>{t('sec.cumulative', lang)}</span></p>
        <div className="tiles">
          <Tile k={t('tile.advancedTotal', lang)} v={n0(m.cumulativeAdvanced)} u="USDC" tone="hi" />
          <Tile k={t('tile.refundCount', lang)} v={n0(m.cumulativeCount)} />
          <Tile k={t('tile.repayRate', lang)} v={`${n2(m.repayRatePct)}%`} />
          <Tile
            k={t('tile.lossRate', lang)} v={`${n2(m.lossRatePct)}%`}
            u={t('tile.breakeven', lang)} tone={m.lossRatePct > 0.35 ? 'crit' : undefined}
          />
          <Tile
            k={t('tile.rejected', lang)} v={n0(m.rejectedRequests)}
            tone={m.rejectedRequests ? 'warn' : undefined}
          />
          {/* The latency the cardholder run just produced, carried through to
              the public dashboard. It is the demo's headline number. */}
          <Tile
            k={t('tile.settleToSpend', lang)}
            v={settleSeconds !== null ? `${settleSeconds}s` : '—'}
            u={t('tile.lastOne', lang)}
          />
        </div>

        <p className="sec-k">{t('sec.roomToJoin', lang)}<span>{t('sec.roomToJoinSub', lang)}</span></p>
        <div className="tiles">
          <Tile k={t('tile.memberIssuers', lang)} v={n0(s.issuers.length)} />
          <Tile k={t('tile.memberLps', lang)} v={n0(s.liquidityProviders.length)} />
          <Tile
            k={t('tile.topAcquirer', lang)}
            v={`${n0(m.acquirerTopExposure)} / ${n0(m.acquirerExposureLimit)}`}
            u={t('tile.againstLimit', lang)}
            tone={m.acquirerTopExposure > m.acquirerExposureLimit ? 'crit' : undefined}
          />
          <Tile k={t('tile.acquirerConc', lang)} v={`${n2(acquirerConcentrationPct(s))}%`}
                u={t('tile.spreadOnly', lang)} />
          <Tile k={t('tile.capacityLeft', lang)} v={n0(p.cashAvailable)} u="USDC" />
          <Tile k={t('tile.newIssuerCap', lang)} v={n0(newIssuerCap(s))} u="USDC" />
          <Tile
            k={t('tile.lpRoom', lang)}
            v={n0(lpDepositRoom(s))} u="USDC"
            tone={m.lpDepositCap - p.lpDeposits < 1 ? 'warn' : undefined}
          />
        </div>
      </div>

      <div className="panel" id="p-pub-bars">
        <h3>{t('panel.riskLoss', lang)}</h3>
        <p className="hint">{t('hint.riskLoss', lang)}</p>
        <div className="tiles">
          <Tile k={t('tile.lossConfirmed', lang)} v={n0(m.lossTotal)} u="USDC"
                tone={m.lossTotal > 0 ? 'crit' : undefined} />
          <Tile k={t('tile.capHeld', lang)} v={n0(p.capHeld)} u="USDC"
                tone={p.capHeld > 0 ? 'warn' : undefined} />
          <Tile
            k={t('tile.reviewToLoss', lang)}
            v={`${s.positions.filter((x) => x.state === 'CoveredLoss' || x.state === 'RecoveryRecorded').length}`
               + ` / ${s.positions.filter((x) => ['Review', 'CapHeld', 'CoveredLoss', 'RecoveryRecorded']
                 .includes(x.state)).length}`}
          />
          <Tile k={t('tile.acquirerConc', lang)}
                v={`${n2(acquirerConcentrationPct(s))}%`}
                u={t('tile.spreadOnly', lang)} />
        </div>

        <p className="note">
          {p.advancedOutstanding > 0 ? t('pub.concNote', lang) : t('pub.concEmpty', lang)}
        </p>

        <p className="sec-k">{t('sec.lossSplit', lang)}<span>{n0(m.lossTotal)} USDC</span></p>
        {m.lossTotal <= 0 ? (
          <p className="note">{t('pub.lossSplitEmpty', lang)}</p>
        ) : (
        <div className="fall">
          {absorb.map((a) => (
            <div key={a.n} className={`frow${a.v > 0 ? ' hit' : ''}`}>
              <span className="fidx">{a.n}</span>
              <span className="fbar">
                <i className={a.cls} style={{ width: `${(a.v / absorbMax) * 100}%` }} />
                <span>{t(a.k, lang)} <em>{t(a.sub, lang)}</em></span>
              </span>
              <span className="num">{n0(a.v)}</span>
            </div>
          ))}
        </div>
        )}
      </div>

      <div className="panel">
        <h3>{t('panel.rules', lang)}</h3>
        <p className="hint">{t('hint.rules', lang)}</p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>{t('th.parameter', lang)}</th>
                <th>{t('th.value', lang)}</th>
                <th>{t('th.meaning', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {RULES.map((r) => (
                <tr key={r}>
                  <td><b>{t(`rule.${r}` as CopyKey, lang)}</b></td>
                  <td className="mono">{tp(`rule.${r}.v` as CopyKey, lang)}</td>
                  <td className="wrap-cell">{tp(`rule.${r}.m` as CopyKey, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>{t('panel.members', lang)}</h3>
        <p className="hint">{t('hint.members', lang)}</p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>{t('th.issuer', lang)}</th>
                <th>{t('th.region', lang)}</th>
                <th>{t('th.registered', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {/* Three columns on purpose. Membership is public; per-issuer
                  collateral, limits and state are not — that boundary is what
                  this panel exists to demonstrate. */}
              {s.issuers.map((i) => (
                <tr key={i.key}>
                  <td><b>{i.name}</b></td>
                  <td className="mono">{issuerRegion(i.key)}</td>
                  <td><span className="pill n">{t('state.Registered', lang)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" id="p-pub-ev">
        <h3>{t('panel.events', lang)}</h3>
        <p className="hint">{t('hint.events', lang)}</p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>{t('th.block', lang)}</th><th>{t('th.event', lang)}</th>
                <th>{t('th.target', lang)}</th>
                <th className="num">{t('th.amount', lang)}</th><th>{t('th.tx', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {s.events.slice(0, 12).map((e, i) => (
                <tr key={`${e.txHash}-${i}`}>
                  <td className="mono">
                    {n0(e.blockNumber)}
                    {e.timepointSeq !== undefined && (
                      <ScenChip seq={e.timepointSeq} lang={lang} />
                    )}
                  </td>
                  <td className="mono">{e.name}</td>
                  <td className="mono">{short(e.target)}</td>
                  <td className="num">{e.amount ? n0(e.amount) : '—'}</td>
                  <td className="mono"><span className="hashlink">{short(e.txHash)}</span></td>
                </tr>
              ))}
              {s.events.length === 0 && (
                <tr><td className="empty-row" colSpan={5}>{t('pub.evEmpty', lang)}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="note">{t('note.pastReturns', lang)}</p>
      </div>

      <p className="hint mono">
        run {manifest?.runId} · {s.timepointId} · {s.capturedAt}
      </p>
    </section>
  );
}

/* ── verifier ────────────────────────────────────────────────── */

/**
 * The smallest screen, and the one that carries the argument: a loss is not a
 * date passing, it is a ruling. Everything here is read from position state.
 */
function VerifierView({ s, lang }: { s: Snapshot; lang: Lang }) {
  const pending = s.positions
    .filter((p) => p.state === 'Review' || p.state === 'CoveredLoss' || p.state === 'CapHeld')
    .slice()
    .sort((a, b) => b.createdAtTimepoint - a.createdAtTimepoint);

  return (
    <section className="stack" data-pane="val">
      <div className="pband"><b>{t('screen.verifier', lang)}</b><span>{s.label[lang]}</span></div>

      <div className="panel" id="p-val-rows">
        <h3>{t('panel.verifier', lang)}</h3>
        <p className="hint">{t('hint.verifier', lang)}</p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>{t('th.refundId', lang)}</th>
                <th>{t('th.issuer', lang)}</th>
                <th className="num">{t('th.principal', lang)}</th>
                <th>{t('th.elapsed', lang)}</th>
                <th>{t('th.evidence', lang)}</th>
                <th>{t('th.ruling', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.refundKey}>
                  <td className="mono">
                    {refundLabel(p.refundKey)}
                    <ScenChip seq={p.createdAtTimepoint} lang={lang} />
                  </td>
                  <td>{p.issuer}</td>
                  <td className="num">{n0(p.amount)}</td>
                  <td className="mono">T+7</td>
                  <td className="wrap-cell">{p.evidence ?? '—'}</td>
                  <td><PositionState state={p.state} lang={lang} /></td>
                </tr>
              ))}
              {pending.length === 0 && (
                <tr><td className="empty-row" colSpan={6}>{t('val.empty', lang)}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="note">{t('val.note', lang)}</p>
      </div>

      <div className="panel">
        <h3>{t('panel.exclusions', lang)}</h3>
        <p className="hint">{t('hint.exclusions', lang)}</p>
        <ul className="feed" style={{ padding: 0 }}>
          {([
            ['excl.1', 'excl.1.sub', 'excl.verdict.out'],
            ['excl.2', 'excl.2.sub', 'excl.verdict.out'],
            // The one that carries the argument: a delay is not a loss.
            ['excl.3', 'excl.3.sub', 'excl.verdict.notLoss'],
          ] as const).map(([k, sub, verdict]) => (
            <li key={k}>
              <div className="t"><b>{t(k, lang)}</b><span>{t(sub, lang)}</span></div>
              <div className="v">
                <span className={`pill ${verdict === 'excl.verdict.out' ? 'c' : 'w'}`}>
                  {t(verdict, lang)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ── LP dashboard ────────────────────────────────────────────── */

/**
 * The screen that answers "whose money is this, and can I get it back".
 *
 * Everything here reads the snapshot. The one thing computed locally is the
 * withdrawal split — and that is a decomposition for display, not a financial
 * value: net asset value, reserve and each position's pool coverage all come
 * from the chain, and this only arranges them into three buckets.
 */
function LpView({ s, lang }: { s: Snapshot; lang: Lang }) {
  const p = s.pool;
  /* The year before the demo: t1 minus the cardholder run in t0. */
  const year = yearOne(snapshots.t0, snapshots.t1);
  const lpNet = lpNetResult(s);
  /* How long the current income takes to earn back what the incidents cost.
     Measured against the year's LP income, which is the only annual figure
     the bundle carries. */
  const months = year.lpShare > 0 ? (Math.max(0, -lpNet) / year.lpShare) * 12 : 0;
  const yearLoaded = s.seq >= snapshots.t1.seq;
  const collateral = s.issuers.reduce((a, i) => a + i.collateralRemaining, 0);
  const { instant, queued, locked, reviewCoverage } = withdrawalSplit(s);

  const buckets: Slice[] = [
    { value: p.cashAvailable, color: 'var(--seq-1)', label: t('wd.instant', lang) },
    {
      value: p.externalDeployed,
      color: p.externalFrozen ? 'var(--warn)' : 'var(--seq-2)',
      label: t(p.externalFrozen ? 'bucket.frozen' : 'bucket.deployed', lang),
    },
    { value: p.advancedOutstanding, color: 'var(--seq-3)', label: t('bucket.advanced', lang) },
  ];

  const wd = [
    { k: 'wd.instant', sub: t('wd.instant.sub', lang), v: instant, cls: 'seg-1' },
    { k: 'wd.queued',  sub: `${t('bucket.advanced', lang)} ${n0(p.advancedOutstanding)}`, v: queued, cls: 'seg-2' },
    // With nothing under review the arithmetic would read "0 − 500", which
    // looks like a figure rather than the absence of one.
    { k: 'wd.locked',
      sub: reviewCoverage > 0
        ? `${n0(reviewCoverage)} − ${n0(p.reserve)}`
        : t('wd.locked.none', lang),
      v: locked, cls: 'seg-3' },
  ] as const;

  const absorb = [
    { n: 1, k: 'fall.margin',  sub: 'fall.margin.sub',  v: marginAbsorbed(s), cls: 'seg-1' },
    { n: 2, k: 'fall.reserve', sub: 'fall.reserve.sub', v: p.reserveUsed,   cls: 'seg-2' },
    { n: 3, k: 'fall.lp',      sub: 'fall.lp.sub',      v: p.lpLossApplied, cls: 'seg-3' },
    { n: 4, k: 'fall.cap',     sub: 'fall.cap.sub',     v: p.capHeld,       cls: 'seg-4' },
  ] as const;
  const absorbMax = Math.max(1, ...absorb.map((a) => a.v));



  return (
    <section className="stack" data-pane="lp">
      <div className="pband"><b>{t('screen.lp', lang)}</b><span>{s.label[lang]}</span></div>

      {/* Fixed history, not live state: the year before the demo began. Bound
          to the current snapshot it contradicted its own heading — "one year,
          assumed" over figures that moved with every timepoint.

          It appears only once that year has been loaded, at scenario 1. Before
          then the pool below is still at its opening balance, and a panel
          announcing 365 refunds over a pool that has handled one would be the
          screen contradicting itself. */}
      {yearLoaded && (
      <div className="panel" id="p-lp-year">
        <h3>{t('panel.yearSummary', lang)} <span className="pill w">{t('panel.assumed', lang)}</span></h3>
        <p className="hint">{tp('hint.yearSummary', lang)}</p>
        <div className="tiles">
          <Tile k={t('tile.count', lang)} v={n0(year.count)} />
          <Tile k={t('tile.feeTotal', lang)} v={n0(year.feeTotal)} u="USDC" />
          <Tile k={t('tile.lpShareOfFee', lang)} v={n0(year.lpShare)} u="USDC" tone="hi" />
          <Tile k={t('tile.reserveAccrued', lang)} v={n0(year.reserveShare)} u="USDC" />
          <Tile k={t('tile.lpAnnual', lang)} v={`${n2(year.annualPct)}%`} />
        </div>
        <p className="note c">
          {p.lpLossApplied > 0
            ? t('lp.yearNoteLoss', lang)
                .replace('{loss}', n2(s.metrics.lossRatePct))
                .replace('{net}', n0(lpNet))
                .replace('{fee}', n0(year.lpShare))
                .replace('{months}', n2(months))
            : t('lp.yearNoteClean', lang)}
        </p>
      </div>
      )}

      <div className="panel" id="p-lp-funds">
        <h3>{t('panel.contractFunds', lang)}</h3>
        <p className="hint">{t('hint.contractFunds', lang)}</p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>{t('th.fund', lang)}</th>
                <th className="num">{t('th.amount', lang)}</th>
                <th>{t('th.ownedBy', lang)}</th>
                <th>{t('th.purpose', lang)}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><b>{t('fund.lpDeposits', lang)}</b></td>
                <td className="num">{n0(p.lpDeposits)}</td>
                <td>{t('fund.lpDeposits.who', lang)}</td>
                <td className="wrap-cell">{t('fund.lpDeposits.use', lang)}</td>
              </tr>
              <tr>
                <td><b>{t('fund.reserve', lang)}</b></td>
                <td className="num">{n0(p.reserve)}</td>
                <td>{t('fund.reserve.who', lang)}</td>
                <td className="wrap-cell">{t('fund.reserve.use', lang)}</td>
              </tr>
              <tr>
                <td><b>{t('fund.margin', lang)}</b></td>
                <td className="num">{n0(collateral)}</td>
                <td>{t('fund.margin.who', lang)}</td>
                <td className="wrap-cell">{t('fund.margin.use', lang)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid2">
        <div className="panel" id="p-lp-donut">
          <h3>{t('panel.lpComposition', lang)}</h3>
          <p className="hint">{tp('hint.lpComposition', lang)}</p>
          <div className="chartrow">
            <Donut
              slices={buckets}
              centreLabel={t('tile.utilization', lang)}
              centreValue={`${Math.round(s.metrics.utilizationPct)}%`}
            />
            <Legend
              rows={[
                ...buckets.map((b) => ({ color: b.color, label: b.label, value: n0(b.value) })),
                { label: t('bucket.navTotal', lang), value: n0(p.netAssetValue) },
                { label: tp('bucket.deployCap', lang), value: n0(p.netAssetValue * PARAMS.idleDeployCapPct / 100) },
              ]}
            />
          </div>
        </div>

        <div className="panel" id="p-lp-wd">
          <h3>
            {t('panel.withdrawable', lang)}{' '}
            <span className="hint">({t('panel.poolWhole', lang)})</span>
          </h3>
          <p className="hint">{t('hint.withdrawable', lang)}</p>
          <div className="bars">
            {wd.map((w) => (
              <div key={w.k}>
                <div className="bar-row">
                  <span>{t(w.k, lang)}</span>
                  <span className="track">
                    <i className={w.cls} style={{ width: `${(w.v / Math.max(1, p.netAssetValue)) * 100}%` }} />
                  </span>
                  <span className="num">{n0(w.v)}</span>
                </div>
                <div className="bar-row">
                  <span /><span className="hint mono">{w.sub}</span><span />
                </div>
              </div>
            ))}
            <div className="bar-row" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
              <span><b>{t('wd.total', lang)}</b></span>
              <span className="hint">{t('wd.totalSub', lang)}</span>
              <span className="num"><b>{n0(p.netAssetValue)}</b></span>
            </div>
          </div>
          <p className="note">
            {locked > 0
              ? t('lp.wdNoteLocked', lang)
                  .replace('{amount}', n0(locked))
                  .replace('{n}', String(s.positions.filter((x) =>
                    x.state === 'Review' || x.state === 'CapHeld').length))
              : t('lp.wdNoteFree', lang)}
          </p>
        </div>
      </div>

      <div className="panel" id="p-lp-fall">
        <h3>{t('panel.absorption', lang)}</h3>
        <p className="hint">{tp('hint.absorption', lang)}</p>
        <div className="fall">
          {absorb.map((a) => (
            <div key={a.n} className={`frow${a.v > 0 ? ' hit' : ''}`}>
              <span className="fidx">{a.n}</span>
              <span className="fbar">
                <i className={a.cls} style={{ width: `${(a.v / absorbMax) * 100}%` }} />
                <span>{t(a.k, lang)} <em>{t(a.sub, lang)}</em></span>
              </span>
              <span className="num">{n0(a.v)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel" id="p-lp-rows">
        <h3>{t('panel.lpHoldings', lang)}</h3>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>{t('th.lp', lang)}</th>
                <th className="num">{t('th.deposit', lang)}</th>
                <th className="num">{t('th.share', lang)}</th>
                <th className="num">{t('th.feeAccrued', lang)}</th>
                <th className="num">{t('th.lossApplied', lang)}</th>
                <th className="num">{t('th.nav', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {s.liquidityProviders.map((lp) => {
                const share = lp.sharePct / 100;
                return (
                  <tr key={lp.name}>
                    <td className="mono">{lp.name}</td>
                    <td className="num">{n0(lp.deposit)}</td>
                    <td className="num">{n2(lp.sharePct)}%</td>
                    <td className="num pos">+{n0(p.lpFeeAccrued * share)}</td>
                    <td className="num neg">
                      {p.lpLossApplied ? `−${n0(p.lpLossApplied * share)}` : '—'}
                    </td>
                    <td className="num"><b>{n0(p.netAssetValue * share)}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ── issuer console ──────────────────────────────────────────── */

function IssuerView({ s, lang, pipe }: { s: Snapshot; lang: Lang; pipe: number }) {
  /* The timepoint chooses the issuer, the viewer can override. Arriving at
     "AURA's collateral drops 600 → 200" on a console showing HYBRID is the
     kind of miss that makes a judge distrust every other number on screen. */
  const focus = NARRATIVE[s.timepointId]?.issuer;
  const [picked, setPicked] = useState<string>(focus ?? s.issuers[0]?.key ?? '');
  const [lastFocus, setLastFocus] = useState(s.timepointId);
  if (s.timepointId !== lastFocus) {
    setLastFocus(s.timepointId);
    if (focus && s.issuers.some((i) => i.key === focus)) setPicked(focus);
  }
  const iss = s.issuers.find((i) => i.key === picked) ?? s.issuers[0];

  const PIPE = ['pipe.1', 'pipe.2', 'pipe.3', 'pipe.4', 'pipe.5'] as const;

  if (!iss) return <Placeholder screen="issuer" lang={lang} />;

  const { required, usagePct, headroom, free } = issuerMargin(iss);
  /* Newest scenario first. A position table read top-down should start with
     what just happened — the year's old rows are context, not the news. */
  const positions = s.positions
    .filter((p) => p.issuer === iss.key)
    .slice()
    .sort((a, b) => b.createdAtTimepoint - a.createdAtTimepoint);

  return (
    <section className="stack" data-pane="issuer">
      <div className="pband"><b>{t('screen.issuer', lang)}</b><span>{s.label[lang]}</span></div>

      <div className="panel">
        <h3>{t('panel.pipeline', lang)}</h3>
        <p className="hint">{t('hint.pipeline', lang)}</p>
        <div className="pipe">
          {PIPE.map((k, i) => (
            <div key={k} className={`pstep${pipe > i ? ' done' : pipe === i ? ' act' : ''}`}>
              <div className="pk">{t('pipe.step', lang).replace('{n}', String(i + 1))}</div>
              <div className="pv">{pipe > i ? '✓ ' : ''}{t(k, lang)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel" id="p-iss-cmp">
        <h3>{t('panel.issuerCompare', lang)}</h3>
        <p className="hint">{tp('hint.issuerCompare', lang)}</p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>{t('th.issuer', lang)}</th>
                <th>{t('th.region', lang)}</th>
                <th className="num">{t('th.collateral', lang)}</th>
                <th className="num">{t('th.effectiveLimit', lang)}</th>
                <th className="num">{t('th.outstanding', lang)}</th>
                <th className="num">{t('th.marginUsage', lang)}</th>
                <th>{t('th.state', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {s.issuers.map((i) => {
                const m = issuerMargin(i);
                const pooled = limitBoundByPool(i);
                return (
                  <tr key={i.key}>
                    <td><b>{i.key}</b></td>
                    <td className="mono">{issuerRegion(i.key)}</td>
                    <td className="num">
                      {n0(i.collateralRemaining)}
                      {i.collateralRemaining < i.collateralInitial && (
                        <span className="sub"> / {n0(i.collateralInitial)}</span>
                      )}
                    </td>
                    <td className="num">
                      {n0(i.effectiveLimit)}
                      {pooled && <span className="scchip" title={t('iss.boundPoolNote', lang)}>
                        {t('iss.boundPool', lang)}</span>}
                    </td>
                    <td className="num">{n0(i.outstanding)}</td>
                    <td className={`num${m.usagePct > 85 ? ' neg' : m.usagePct > 60 ? ' warnnum' : ''}`}>
                      {i.outstanding > 0 ? `${n0(m.usagePct)}%` : '—'}
                    </td>
                    <td><IssuerState state={i.state} rampUp={i.rampUp} lang={lang} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>{t('panel.issuerPicked', lang)}</h3>
        <p className="hint">{t('hint.issuerPicked', lang)}</p>
        <div className="scen-head">
          <label className="sec-k" htmlFor="iss-sel">{t('sec.view', lang)}</label>
          <select id="iss-sel" value={picked} onChange={(e) => setPicked(e.target.value)}>
            {s.issuers.map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}
          </select>
        </div>

        <div className="tiles">
          <Tile k={t('tile.regionAcq', lang)} text
                v={issuerRegion(iss.key)} u={acquirerId(iss.acquirerHash)} />
          <Tile k={t('th.outstanding', lang)} v={n0(iss.outstanding)} u="USDC" tone="hi" />
          <Tile k={tp('tile.marginNeeded', lang)} v={n0(required)} u="USDC" />
          <Tile k={t('th.collateral', lang)} v={n0(iss.collateralRemaining)} u="USDC"
                tone={iss.collateralRemaining < 0.5 ? 'crit' : undefined} />
          <Tile k={t('th.effectiveLimit', lang)} v={n0(iss.effectiveLimit)} u="USDC" />
          <Tile k={t('tile.headroom', lang)} v={n0(headroom)} u="USDC"
                tone={headroom > 0 ? undefined : 'crit'} />
        </div>

        <p className="sec-k">{t('sec.marginUsage', lang)}</p>
        <div className="chartrow">
          <Gauge pct={usagePct} label={t('sec.marginUsage', lang)} />
          <Legend
            rows={[
              { color: 'var(--violet)',     label: t('gauge.used', lang), value: n0(required) },
              { color: 'var(--surface-3)',  label: t('gauge.left', lang), value: n0(free) },
              { color: 'var(--ok)',         label: t('gauge.room', lang), value: n0(headroom) },
            ]}
          />
        </div>
        {/* What the state actually means for this issuer, right now. Without it
            MarginCall reads as a shutdown rather than a pause on new advances. */}
        <p className="note">
          {iss.state === 'Suspended' ? t('iss.stateSuspended', lang)
            : iss.state === 'MarginCall' ? t('iss.stateMargin', lang)
            : t('iss.stateActive', lang)
                .replace('{pct}', n0(Math.max(PARAMS.issuerConcentrationPct, 100 / s.issuers.length)))
                .replace('{n}', String(s.issuers.length))}
        </p>
      </div>

      <div className="panel" id="p-iss-pos">
        <h3>{t('panel.positions', lang)}</h3>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>{t('th.refundId', lang)}</th>
                <th>{t('th.acquirer', lang)}</th>
                <th className="num">{t('th.principal', lang)}</th>
                <th className="num">{t('th.fee', lang)}</th>
                <th className="num">{t('th.lossShare', lang)}</th>
                <th>{t('th.state', lang)}</th>
                <th>{t('th.tx', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.refundKey}>
                  <td className="mono">
                    {refundLabel(p.refundKey)}
                    <ScenChip seq={p.createdAtTimepoint} lang={lang} />
                  </td>
                  <td className="mono">{acquirerLabel(p.acquirerHash)}</td>
                  <td className="num">{n0(p.amount)}</td>
                  <td className="num">{n2(p.fee)}</td>
                  <td className="num">{n0(p.issuerMargin)}</td>
                  <td><PositionState state={p.state} lang={lang} /></td>
                  <td className="mono"><span className="hashlink">{short(p.txHash)}</span></td>
                </tr>
              ))}
              {positions.length === 0 && (
                <tr><td className="empty-row" colSpan={7}>{t('iss.emptyPositions', lang)}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ── shared bits ─────────────────────────────────────────────── */

function IssuerState({ state, rampUp, lang }: { state: IssuerStateT; rampUp: boolean; lang: Lang }) {
  const tone = state === 'Active' ? 'o' : state === 'MarginCall' ? 'w' : 'c';
  return (
    <>
      <span className={`pill ${tone}`}>{t(`issuerState.${state}` as CopyKey, lang)}</span>
      {rampUp && <span className="hint"> ramp-up</span>}
    </>
  );
}

function PositionState({ state, lang }: { state: PositionStateT; lang: Lang }) {
  const tone = state === 'Repaid' ? 'o'
    : state === 'Review' || state === 'Overdue' || state === 'CapHeld' ? 'w'
    : state === 'CoveredLoss' ? 'c' : 'n';
  return <span className={`pill ${tone}`}>{t(`state.${state}` as CopyKey, lang)}</span>;
}

/**
 * Which scenario a row came from. Seq 0 is not a scenario — it is the
 * cardholder run the viewer just did, and saying "S0" would invent one.
 */
function ScenChip({ seq, lang }: { seq: number; lang: Lang }) {
  return (
    <span className="scchip">
      {seq === 0 ? t('scen.chipRun', lang) : t('scen.chip', lang).replace('{n}', String(seq))}
    </span>
  );
}

function Tile({ k, v, u, tone, text }: {
  k: string; v: string; u?: string;
  tone?: 'hi' | 'ok' | 'warn' | 'crit';
  /** The value is words, not a figure: sentence type, normal size, wraps. */
  text?: boolean;
}) {
  return (
    <div className={`tile${tone ? ` ${tone}` : ''}${text ? ' txt' : ''}`}>
      <div className="k">{k}</div>
      <div className="v">{v}{u && <small>{u}</small>}</div>
    </div>
  );
}

function Placeholder({ screen, lang }: { screen: ScreenKey; lang: Lang }) {
  const copy = SCREENS.find((x) => x.key === screen)!.copy;
  return (
    <section className="stack" data-pane={screen}>
      <div className="pband"><b>{t(copy, lang)}</b><span>—</span></div>
      <div className="panel">
        <h3>{t(copy, lang)}</h3>
        <p className="hint">{t('bf.notBuilt', lang)}</p>
      </div>
    </section>
  );
}
