/**
 * Torna — charts.
 *
 * Inline SVG, no library. Two rules carried over from the mockup:
 *
 *  · The donut draws each slice as an explicit arc path. Stacking full circles
 *    with stroke-dasharray looks the same until rounding at a slice boundary
 *    chips a visible notch out of the ring — which it did, at some values only.
 *  · Ordered quantities use the --seq-1..4 ramp, light to dark: the darker the
 *    step, the more the money is committed. Never a multi-hue scale.
 *
 * Colours come from CSS variables, so these follow a token change like
 * everything else.
 *
 * Owner: A(서진)
 */

export interface Slice {
  value: number;
  /** A CSS variable, e.g. 'var(--seq-1)'. Never a literal. */
  color: string;
  label: string;
}

/** 2px of surface between slices, expressed as an angle at this radius. */
const GAP_PX = 2;

export function Donut({
  slices, centreLabel, centreValue, size = 132, r = 46, width = 17,
}: {
  slices: Slice[];
  centreLabel: string;
  centreValue: string;
  size?: number;
  r?: number;
  width?: number;
}) {
  const parts = slices.filter((s) => s.value > 0);
  const sum = parts.reduce((a, s) => a + s.value, 0);
  const cx = 65, cy = 65;

  let body: React.ReactNode;
  if (sum <= 0) {
    body = <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={width} />;
  } else if (parts.length === 1) {
    body = <circle cx={cx} cy={cy} r={r} fill="none" stroke={parts[0].color} strokeWidth={width} />;
  } else {
    const gap = GAP_PX / r;
    let a = -Math.PI / 2;
    body = parts.map((s, i) => {
      const span = 2 * Math.PI * (s.value / sum);
      const pad = Math.min(gap / 2, span * 0.22);   // a sliver keeps a smaller gap
      const a0 = a + pad, a1 = a + span - pad;
      a += span;
      if (a1 <= a0) return null;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const d = `M${(cx + r * Math.cos(a0)).toFixed(3)} ${(cy + r * Math.sin(a0)).toFixed(3)}`
        + ` A${r} ${r} 0 ${large} 1 ${(cx + r * Math.cos(a1)).toFixed(3)} ${(cy + r * Math.sin(a1)).toFixed(3)}`;
      return <path key={i} d={d} fill="none" stroke={s.color} strokeWidth={width} />;
    });
  }

  return (
    <svg viewBox="0 0 130 130" width={size} height={size} role="img"
         aria-label={`${centreLabel} ${centreValue}`}>
      {body}
      <text x={cx} y={61} textAnchor="middle" fontSize="10" fill="var(--ink-3)" fontWeight="600">
        {centreLabel}
      </text>
      <text x={cx} y={80} textAnchor="middle" fontSize="21" fontWeight="700" fill="var(--ink)"
            fontFamily="Roboto Mono, monospace">
        {centreValue}
      </text>
    </svg>
  );
}

/**
 * Half-circle gauge for a single ratio. Status colour above the thresholds,
 * because a gauge past 100% is the one thing on the issuer console that has to
 * be seen without reading.
 */
export function Gauge({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const LEN = 157; // length of the 50px-radius semicircle path below
  const stroke = pct > 85 ? 'var(--crit)' : pct > 60 ? 'var(--warn)' : 'var(--violet)';
  return (
    <svg viewBox="0 0 120 68" width={132} height={75} role="img" aria-label={`${label} ${pct}%`}>
      <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="var(--surface-3)"
            strokeWidth={12} strokeLinecap="round" />
      <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke={stroke}
            strokeWidth={12} strokeLinecap="round"
            strokeDasharray={LEN} strokeDashoffset={LEN - (LEN * clamped) / 100} />
      <text x={60} y={54} textAnchor="middle" fontSize="19" fontWeight="700" fill="var(--ink)"
            fontFamily="Roboto Mono, monospace">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

export function Legend({ rows }: { rows: Array<{ color?: string; label: string; value: string }> }) {
  return (
    <ul className="legend">
      {rows.map((r, i) => (
        <li key={i}>
          {r.color && <span className="sw" style={{ background: r.color }} />}
          <span className="lk">{r.label}</span>
          <span className="lv num">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * LP valuation across the timepoints the viewer has actually opened.
 *
 * Deliberately not a chart of all twelve: a line through timepoints nobody
 * looked at claims a story the viewer did not see. Below two points there is
 * no trend to draw, so the caller hides the section entirely.
 *
 * Colour: the sequential ramp's light step for the trace, its darkest for the
 * current point — the same "further along is darker" rule as everywhere else.
 */
export function Trail({
  points, format,
}: {
  points: Array<{ id: string; value: number }>;
  format: (v: number) => string;
}) {
  const W = 700, H = 196, L = 58, R = 12, T = 14, B = 34;
  const pw = W - L - R, ph = H - T - B;
  const vals = points.map((p) => p.value);

  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max(400, (hi - lo) * 0.18);
  lo = Math.max(0, lo - pad); hi = hi + pad;
  const raw = (hi - lo) / 3;
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= raw) ?? mag * 10;
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;

  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-6; v += step) ticks.push(v);

  const X = (i: number) => L + (points.length === 1 ? pw / 2 : i * (pw / (points.length - 1)));
  const Y = (v: number) => T + ph - ((v - lo) / (hi - lo || 1)) * ph;

  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.value).toFixed(1)}`).join(' ');
  const last = points.length - 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: '100%', display: 'block' }} role="img">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} y1={Y(v)} x2={W - R} y2={Y(v)} stroke="var(--line)" strokeWidth={1} />
          <text x={L - 9} y={Y(v) + 4} textAnchor="end" fontSize={10} fill="var(--ink-3)">
            {format(Math.round(v))}
          </text>
        </g>
      ))}
      <path d={`${d} L${X(last).toFixed(1)} ${T + ph} L${L} ${T + ph} Z`} fill="var(--violet)" fillOpacity={0.09} />
      <path d={d} fill="none" stroke="var(--violet)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={p.id}>
          <circle
            cx={X(i)} cy={Y(p.value)} r={i === last ? 5 : 3.2}
            fill={i === last ? 'var(--seq-4)' : 'var(--violet)'}
            stroke="var(--surface)" strokeWidth={2}
          />
          <text x={X(i)} y={T + ph + 17} textAnchor="middle" fontSize={10} fill="var(--ink-3)">{p.id}</text>
        </g>
      ))}
      <text
        x={X(last) - 8} y={Y(points[last].value) - 11} textAnchor="end"
        fontSize={11} fontWeight={500} fill="var(--seq-4)"
      >
        {format(Math.round(points[last].value))}
      </text>
      <line x1={L} y1={T + ph} x2={W - R} y2={T + ph} stroke="var(--line-2)" strokeWidth={1} />
    </svg>
  );
}
