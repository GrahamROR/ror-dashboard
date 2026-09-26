// ============================================================
// ROR SALES DASHBOARD 2 — flexible SVG chart
// ------------------------------------------------------------
// One chart component, several chart types (bar / line /
// stacked-bar / area / donut) driven off the same series shape
// produced by calculations.js#buildSeries. No charting library —
// this project has none, and the brief explicitly asks not to
// pull in a heavy one just for this. Pure inline SVG + React.
//
// Series shape expected: [{ key, channels, points: [{ bucket, value, status, note }] }]
// comparisonSeries: same shape, rendered lighter/dashed alongside.
// ============================================================

(function (root) {

function niceMax(v) {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function pickLabelStride(n) {
  if (n <= 12) return 1;
  return Math.ceil(n / 12);
}

const CHART_H = 300;
const CHART_W = 960;
const PAD = { top: 18, right: 16, bottom: 34, left: 60 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;

function seriesColor(s, idx, fallbackPalette) {
  if (s.color) return s.color;
  if (s.channels && s.channels.length === 1 && RorModel.CHANNEL_META[s.channels[0]]) {
    return RorModel.CHANNEL_META[s.channels[0]].color;
  }
  return fallbackPalette[idx % fallbackPalette.length];
}

// A series carries its own `label` when it isn't a sales channel (e.g. the
// Ads tab's "Meta"/"Google"/"Blended" series) — only sales-dashboard series
// fall back to deriving a name from RorModel.CHANNEL_META.
function seriesLabel(s) {
  if (s.label) return s.label;
  if (s.channels && s.channels.length === 1 && RorModel.CHANNEL_META[s.channels[0]]) {
    return RorModel.CHANNEL_META[s.channels[0]].short;
  }
  return 'All stores';
}

const PALETTE = ['var(--amb)', 'var(--blu)', 'var(--pur)', 'var(--grn)', 'var(--red)'];

function Tooltip({ leftPct, items }) {
  return el('div', {
    style: {
      position: 'absolute', top: 4, left: leftPct + '%', transform: 'translateX(-50%)',
      background: 'var(--s3)', border: '1px solid var(--bdr2)', borderRadius: 8,
      padding: '8px 10px', fontSize: 12, color: 'var(--t1)', pointerEvents: 'none',
      whiteSpace: 'nowrap', zIndex: 5, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    },
  },
    el('div', { style: { fontWeight: 600, marginBottom: 4, color: 'var(--t2)', fontSize: 11 } }, items.bucketLabel),
    items.rows.map((r, i) => el('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 6 } },
      el('div', { style: { width: 8, height: 8, borderRadius: 2, background: r.color, flexShrink: 0, opacity: r.dashed ? 0.5 : 1 } }),
      el('span', { style: { color: 'var(--t2)' } }, r.label + ':'),
      el('span', { className: 'mono', style: { fontWeight: 500 } }, r.text)
    ))
  );
}

function TimeSeriesChart(props) {
  const { type, series, comparisonSeries, formatValue, valueLabel } = props;
  const [hoverIdx, setHoverIdx] = useState(null);

  const buckets = (series[0] && series[0].points.map((p) => p.bucket)) || [];
  const n = buckets.length;

  if (n === 0) {
    return el('div', { style: { height: CHART_H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: 13 } }, 'No data to chart for this selection.');
  }

  const allVals = [];
  series.forEach((s) => s.points.forEach((p) => { if (typeof p.value === 'number') allVals.push(p.value); }));
  (comparisonSeries || []).forEach((s) => s.points.forEach((p) => { if (typeof p.value === 'number') allVals.push(p.value); }));

  let maxVal;
  if (type === 'stacked-bar' && series.length > 1) {
    const sums = buckets.map((_, i) => series.reduce((s, ser) => s + (typeof ser.points[i].value === 'number' ? ser.points[i].value : 0), 0));
    maxVal = niceMax(Math.max(1, ...sums));
  } else {
    maxVal = niceMax(Math.max(1, ...allVals, 1));
  }

  const xStep = PLOT_W / n;
  const y = (v) => PLOT_H - (Math.max(0, v) / maxVal) * PLOT_H;
  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const stride = pickLabelStride(n);

  const marks = [];
  const legendItems = [];

  if (type === 'bar' || type === 'stacked-bar') {
    const groupPad = xStep * 0.16;
    const groupW = xStep - groupPad * 2;
    const barW = type === 'stacked-bar' ? groupW : groupW / Math.max(1, series.length);

    series.forEach((s, si) => {
      const color = seriesColor(s, si, PALETTE);
      legendItems.push({ color, label: seriesLabel(s) });

      s.points.forEach((p, i) => {
        const missing = typeof p.value !== 'number';
        const v = missing ? 0 : p.value;
        let barX, stackBase = 0;
        if (type === 'stacked-bar') {
          for (let k = 0; k < si; k++) {
            const kv = series[k].points[i].value;
            stackBase += typeof kv === 'number' ? kv : 0;
          }
          barX = PAD.left + i * xStep + groupPad;
        } else {
          barX = PAD.left + i * xStep + groupPad + si * barW;
        }
        const h = (v / maxVal) * PLOT_H;
        const yTop = PAD.top + (type === 'stacked-bar' ? y(stackBase + v) : y(v));
        if (missing) {
          marks.push(el('rect', {
            key: `${s.key}-${i}`, x: barX, y: PAD.top + PLOT_H - 6, width: barW, height: 6,
            fill: 'none', stroke: 'var(--t3)', strokeDasharray: '3,2', rx: 1,
          }));
        } else {
          marks.push(el('rect', {
            key: `${s.key}-${i}`, x: barX, y: yTop, width: Math.max(1, barW - 2), height: Math.max(0, h),
            fill: color, opacity: 0.85, rx: 2,
          }));
        }
      });
    });
  } else if (type === 'line' || type === 'area') {
    series.forEach((s, si) => {
      const color = seriesColor(s, si, PALETTE);
      legendItems.push({ color, label: seriesLabel(s) });
      const pts = s.points.map((p, i) => typeof p.value === 'number' ? [PAD.left + (i + 0.5) * xStep, PAD.top + y(p.value)] : null);
      const validSegs = [];
      let cur = [];
      pts.forEach((pt) => { if (pt) cur.push(pt); else if (cur.length) { validSegs.push(cur); cur = []; } });
      if (cur.length) validSegs.push(cur);

      validSegs.forEach((seg, segi) => {
        const path = seg.map((pt, i) => (i === 0 ? 'M' : 'L') + pt[0] + ',' + pt[1]).join(' ');
        if (type === 'area') {
          const baseY = PAD.top + PLOT_H;
          const areaPath = path + ` L${seg[seg.length - 1][0]},${baseY} L${seg[0][0]},${baseY} Z`;
          marks.push(el('path', { key: `${s.key}-area-${segi}`, d: areaPath, fill: color, opacity: 0.16 }));
        }
        marks.push(el('path', { key: `${s.key}-line-${segi}`, d: path, fill: 'none', stroke: color, strokeWidth: 2 }));
      });
      s.points.forEach((p, i) => {
        if (typeof p.value !== 'number') return;
        marks.push(el('circle', { key: `${s.key}-dot-${i}`, cx: PAD.left + (i + 0.5) * xStep, cy: PAD.top + y(p.value), r: 3, fill: color }));
      });
    });
  }

  // comparison series — always dashed/lighter, rendered as line overlay regardless of main type
  if (comparisonSeries) {
    comparisonSeries.forEach((s, si) => {
      const baseColor = seriesColor(s, si, PALETTE);
      legendItems.push({ color: baseColor, label: seriesLabel(s) + ' (comparison)', dashed: true });
      const pts = s.points.map((p, i) => typeof p.value === 'number' ? [PAD.left + (i + 0.5) * xStep, PAD.top + y(p.value)] : null).filter(Boolean);
      if (pts.length > 1) {
        const path = pts.map((pt, i) => (i === 0 ? 'M' : 'L') + pt[0] + ',' + pt[1]).join(' ');
        marks.push(el('path', { key: `cmp-${s.key}`, d: path, fill: 'none', stroke: baseColor, strokeWidth: 1.5, strokeDasharray: '5,4', opacity: 0.7 }));
      }
    });
  }

  const hoverRows = hoverIdx == null ? null : (() => {
    const rows = [];
    series.forEach((s, si) => {
      const p = s.points[hoverIdx];
      const color = seriesColor(s, si, PALETTE);
      rows.push({
        color,
        label: seriesLabel(s),
        text: typeof p.value === 'number' ? formatValue(p.value) : (p.note || 'No data'),
      });
    });
    if (comparisonSeries) comparisonSeries.forEach((s, si) => {
      const p = s.points[hoverIdx];
      const color = seriesColor(s, si, PALETTE);
      rows.push({
        color, dashed: true,
        label: seriesLabel(s) + ' (compare)',
        text: typeof p.value === 'number' ? formatValue(p.value) : (p.note || 'No data'),
      });
    });
    return { bucketLabel: buckets[hoverIdx].label, rows };
  })();

  return el('div', { style: { position: 'relative' } },
    hoverRows && el(Tooltip, { leftPct: ((hoverIdx + 0.5) / n) * 100, items: hoverRows }),
    el('svg', { viewBox: `0 0 ${CHART_W} ${CHART_H}`, style: { width: '100%', height: 'auto', display: 'block', overflow: 'visible' }, preserveAspectRatio: 'xMidYMid meet' },
      gridLines.map((f, i) => el('g', { key: i },
        el('line', { x1: PAD.left, x2: CHART_W - PAD.right, y1: PAD.top + PLOT_H * (1 - f), y2: PAD.top + PLOT_H * (1 - f), stroke: 'var(--bdr)', strokeWidth: 1 }),
        el('text', { x: PAD.left - 8, y: PAD.top + PLOT_H * (1 - f) + 4, fill: 'var(--t3)', fontSize: 10, textAnchor: 'end' }, formatValue(maxVal * f, true))
      )),
      marks,
      buckets.map((b, i) => (i % stride === 0) && el('text', {
        key: 'lbl' + i, x: PAD.left + (i + 0.5) * xStep, y: CHART_H - 8, fill: 'var(--t3)', fontSize: 10, textAnchor: 'middle',
      }, b.label)),
      // hover capture columns
      buckets.map((b, i) => el('rect', {
        key: 'hz' + i, x: PAD.left + i * xStep, y: PAD.top, width: xStep, height: PLOT_H,
        fill: 'transparent',
        onMouseEnter: () => setHoverIdx(i), onMouseLeave: () => setHoverIdx(null),
      }))
    ),
    el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10, fontSize: 11, color: 'var(--t2)' } },
      legendItems.map((li, i) => el('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 5 } },
        el('div', { style: { width: 10, height: li.dashed ? 2 : 8, background: li.color, opacity: li.dashed ? 0.7 : 0.85, borderRadius: li.dashed ? 0 : 2 } }),
        el('span', null, li.label)
      ))
    )
  );
}

function DonutChart({ slices, formatValue }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const total = slices.reduce((s, x) => s + (x.value || 0), 0);
  if (!total) {
    return el('div', { style: { height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: 13 } }, 'No data to chart for this selection.');
  }
  const cx = 130, cy = 130, r = 92, rInner = 56;
  let angle = -90;
  const arcs = slices.filter((s) => s.value > 0).map((s, i) => {
    const frac = s.value / total;
    const start = angle;
    const end = angle + frac * 360;
    angle = end;
    const large = (end - start) > 180 ? 1 : 0;
    const toXY = (a, rad) => [cx + rad * Math.cos((a * Math.PI) / 180), cy + rad * Math.sin((a * Math.PI) / 180)];
    const [x1, y1] = toXY(start, r), [x2, y2] = toXY(end, r);
    const [x1i, y1i] = toXY(end, rInner), [x2i, y2i] = toXY(start, rInner);
    const d = `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${x1i},${y1i} A${rInner},${rInner} 0 ${large} 0 ${x2i},${y2i} Z`;
    return { d, color: s.color, label: s.label, value: s.value, pct: frac, i };
  });

  return el('div', { style: { display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' } },
    el('svg', { viewBox: '0 0 260 260', style: { width: 220, height: 220, flexShrink: 0 } },
      arcs.map((a) => el('path', {
        key: a.i, d: a.d, fill: a.color, opacity: hoverIdx === null || hoverIdx === a.i ? 0.9 : 0.35,
        onMouseEnter: () => setHoverIdx(a.i), onMouseLeave: () => setHoverIdx(null),
      })),
      el('text', { x: cx, y: cy - 4, textAnchor: 'middle', fill: 'var(--t1)', fontSize: 15, fontWeight: 600 },
        hoverIdx !== null ? formatValue(arcs[hoverIdx].value) : formatValue(total)),
      el('text', { x: cx, y: cy + 14, textAnchor: 'middle', fill: 'var(--t3)', fontSize: 10 },
        hoverIdx !== null ? arcs[hoverIdx].label : 'Total')
    ),
    el('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 } },
      arcs.map((a) => el('div', { key: a.i, style: { display: 'flex', alignItems: 'center', gap: 8, opacity: hoverIdx === null || hoverIdx === a.i ? 1 : 0.5 },
        onMouseEnter: () => setHoverIdx(a.i), onMouseLeave: () => setHoverIdx(null) },
        el('div', { style: { width: 10, height: 10, borderRadius: 3, background: a.color, flexShrink: 0 } }),
        el('span', { style: { color: 'var(--t2)', minWidth: 130 } }, a.label),
        el('span', { className: 'mono', style: { fontWeight: 500 } }, formatValue(a.value)),
        el('span', { style: { color: 'var(--t3)' } }, '(' + (a.pct * 100).toFixed(1) + '%)')
      ))
    )
  );
}

function SalesChart(props) {
  if (props.type === 'donut') return el(DonutChart, props);
  return el(TimeSeriesChart, props);
}

root.RorCharts = { SalesChart, TimeSeriesChart, DonutChart, niceMax };

})(window);
