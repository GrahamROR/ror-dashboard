// ============================================================
// ROR SALES DASHBOARD 2 — UI
// ------------------------------------------------------------
// Consolidated commercial sales reporting across Shopify, NOTHS
// and Etsy. Deliberately separate from the Shopify Growth
// dashboard's marketing/attribution metrics (see build brief §2) —
// this file never touches ltv-cac.json or email-data.json.
//
// Depends on globals defined by earlier <script> tags in
// index.html: React/useState/useEffect/useMemo (dashboard1's own
// script), el/fmt/fmtC/fmtP (dashboard1's own script), RorModel,
// RorDataAdapter, RorCalc, RorCharts.
// ============================================================

(function (root) {

const M = RorModel;
const C = RorCalc;

// ── formatting helpers (metric-aware; reuse dashboard1's fmt/fmtC/fmtP) ──
function formatMetric(metric, v, short) {
  if (v == null) return '—';
  if (metric === 'orders') return short ? fmt(v, 0) : fmt(Math.round(v), 0);
  if (metric === 'aov') return fmtC(v, 2);
  return short ? fmtC(v, 0) : fmtC(v, 2);
}

function changeText(cmp) {
  if (cmp.status === 'not-occurred') return { text: 'Not yet occurred', tone: 'muted' };
  if (cmp.status === 'no-comparison-data') return { text: 'No comparison data', tone: 'muted' };
  if (cmp.status === 'zero-denominator') return { text: '—', tone: 'muted' };
  if (cmp.percentChange == null) return { text: '—', tone: 'muted' };
  const up = cmp.percentChange >= 0;
  return { text: (up ? '+' : '') + cmp.percentChange.toFixed(1) + '%', tone: up ? 'up' : 'down' };
}

function toneColor(tone) {
  return tone === 'up' ? 'var(--grn)' : tone === 'down' ? 'var(--red)' : 'var(--t3)';
}

// ── shared filter widgets ───────────────────────────────────
function Select({ value, onChange, options, style }) {
  return el('select', {
    value, onChange: (e) => onChange(e.target.value),
    style: Object.assign({
      background: 'var(--s2)', border: '1px solid var(--bdr2)', color: 'var(--t1)',
      borderRadius: 'var(--r)', padding: '7px 10px', fontFamily: 'inherit', fontSize: 12.5, outline: 'none',
    }, style || {}),
  }, options.map((o) => el('option', { key: o.value, value: o.value, disabled: o.disabled }, o.label)));
}

function FilterLabel({ children }) {
  return el('div', { className: 'lbl', style: { marginBottom: 4 } }, children);
}

function StoreSelect({ value, onChange, includeLegacyToggle, includeLegacy, onToggleLegacy }) {
  const opts = [{ value: 'all', label: 'All Stores' }].concat(
    M.ACTIVE_CHANNELS.map((c) => ({ value: c, label: M.CHANNEL_META[c].label }))
  );
  return el('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
    el(FilterLabel, null, 'Store'),
    el(Select, { value, onChange, options: opts }),
    includeLegacyToggle && el('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--t3)', marginTop: 2, cursor: 'pointer' } },
      el('input', { type: 'checkbox', checked: includeLegacy, onChange: (e) => onToggleLegacy(e.target.checked) }),
      'Include closed channels (SilkFred, ASOS)'
    )
  );
}

function DateRangeSelect({ value, onChange, custom, onCustomChange }) {
  return el('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
    el(FilterLabel, null, 'Date range'),
    el(Select, { value, onChange, options: C.DATE_PRESETS.map((p) => ({ value: p.key, label: p.label })) }),
    value === 'custom' && el('div', { style: { display: 'flex', gap: 6, marginTop: 4 } },
      el('input', { type: 'month', value: custom.start || '', onChange: (e) => onCustomChange({ ...custom, start: e.target.value }),
        style: { background: 'var(--s2)', border: '1px solid var(--bdr2)', color: 'var(--t1)', borderRadius: 'var(--r)', padding: '6px 8px', fontSize: 12 } }),
      el('input', { type: 'month', value: custom.end || '', onChange: (e) => onCustomChange({ ...custom, end: e.target.value }),
        style: { background: 'var(--s2)', border: '1px solid var(--bdr2)', color: 'var(--t1)', borderRadius: 'var(--r)', padding: '6px 8px', fontSize: 12 } })
    )
  );
}

function GranularitySelect({ value, onChange }) {
  return el('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
    el(FilterLabel, null, 'Granularity'),
    el(Select, {
      value, onChange,
      options: M.GRANULARITIES.map((g) => ({ value: g.key, label: g.label + (g.supported ? '' : ' (unavailable)'), disabled: !g.supported })),
    })
  );
}

function UnavailableNotice({ reason }) {
  return el('div', { className: 'card', style: { borderColor: 'var(--amb-bdr)', background: 'var(--amb-bg)', display: 'flex', gap: 10, alignItems: 'flex-start' } },
    el('i', { className: 'ti ti-alert-triangle', style: { color: 'var(--amb)', fontSize: 16, marginTop: 1 } }),
    el('div', { style: { fontSize: 12.5, color: 'var(--t1)', lineHeight: 1.5 } }, reason)
  );
}

// ── KPI cards (§5) ───────────────────────────────────────────
function KpiCard({ label, icon, metric, agg, cmp, accentCol }) {
  const value = agg.status === 'not-occurred' ? '—' : agg.status === 'no-data' ? '—' : formatMetric(metric, agg[metric]);
  const chg = changeText(cmp);
  return el('div', { className: 'card', style: { display: 'flex', flexDirection: 'column', gap: 0 } },
    el('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 } },
      el('div', { style: { width: 28, height: 28, borderRadius: 6, background: accentCol + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        el('i', { className: 'ti ' + icon, style: { color: accentCol, fontSize: 14 } })),
      el('div', { className: 'lbl' }, label)
    ),
    el('div', { style: { fontSize: 26, fontWeight: 600, color: 'var(--t1)', fontFamily: "'DM Mono',monospace", letterSpacing: '-0.02em', marginBottom: 6 } }, value),
    (agg.status === 'no-data' || agg.status === 'not-occurred' || agg.status === 'incomplete-data')
      ? el('div', { style: { fontSize: 11, color: 'var(--t3)' } }, agg.note)
      : el('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 } },
          el('span', { style: { color: toneColor(chg.tone), fontWeight: 500 } }, chg.text),
          cmp.absoluteChange != null && el('span', { style: { color: 'var(--t3)' } }, '(' + (cmp.absoluteChange >= 0 ? '+' : '') + formatMetric(metric, cmp.absoluteChange) + ')'),
          agg.status === 'partial' && el('span', { className: 'badge ba', style: { fontSize: 10 } }, 'MTD')
        )
  );
}

function KpiSection({ records, channels, range, comparisonMode, setComparisonMode }) {
  const nowPeriod = C.monthKeyFromDate(new Date());
  const revAgg = C.aggregate(records, { channels, startPeriod: range.startPeriod, endPeriod: range.endPeriod, nowPeriod });
  const ordAgg = revAgg; // same aggregate carries both revenue+orders

  const prevEq = C.previousEquivalentRange(range.startPeriod, range.endPeriod);
  const prevAgg = C.aggregate(records, { channels, startPeriod: prevEq.startPeriod, endPeriod: prevEq.endPeriod, nowPeriod });

  const yoyRange = C.yearEarlierRange(range.startPeriod, range.endPeriod);
  const yoyAgg = C.aggregate(records, { channels, startPeriod: yoyRange.startPeriod, endPeriod: yoyRange.endPeriod, nowPeriod });

  const growthBasisAgg = comparisonMode === 'yoy' ? yoyAgg : prevAgg;
  const growthCmp = C.compareAggregates(revAgg, growthBasisAgg, 'revenue');

  return el('div', { className: 'fi grid-auto', style: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }, key: 'kpis' },
    el(KpiCard, { label: 'Revenue', icon: 'ti-currency-pound', metric: 'revenue', agg: revAgg, cmp: C.compareAggregates(revAgg, prevAgg, 'revenue'), accentCol: 'var(--amb)' }),
    el(KpiCard, { label: 'Orders', icon: 'ti-shopping-cart', metric: 'orders', agg: ordAgg, cmp: C.compareAggregates(revAgg, prevAgg, 'orders'), accentCol: 'var(--blu)' }),
    el(KpiCard, { label: 'Average Order Value', icon: 'ti-receipt', metric: 'aov', agg: revAgg, cmp: C.compareAggregates(revAgg, prevAgg, 'aov'), accentCol: 'var(--pur)' }),
    el('div', { className: 'card', style: { display: 'flex', flexDirection: 'column', gap: 0 } },
      el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          el('div', { style: { width: 28, height: 28, borderRadius: 6, background: 'var(--grn-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
            el('i', { className: 'ti ti-trending-up', style: { color: 'var(--grn)', fontSize: 14 } })),
          el('div', { className: 'lbl' }, 'Growth')),
        el('div', { className: 'tab-bar', style: { padding: 2 } },
          ['mom', 'yoy'].map((k) => el('div', {
            key: k, className: 'tab' + (comparisonMode === k ? ' active' : ''), style: { padding: '3px 8px', fontSize: 10.5 },
            onClick: () => setComparisonMode(k),
          }, k.toUpperCase())))
      ),
      el('div', { style: { fontSize: 26, fontWeight: 600, color: toneColor(changeText(growthCmp).tone), fontFamily: "'DM Mono',monospace", marginBottom: 6 } }, changeText(growthCmp).text),
      el('div', { style: { fontSize: 11, color: 'var(--t3)' } }, comparisonMode === 'yoy' ? 'vs. same period last year' : 'vs. previous equivalent period')
    )
  );
}

// ── comparison table (§6) ───────────────────────────────────
function ComparisonTable({ records, channels }) {
  const [metric, setMetric] = useState('revenue');
  const [granularity, setGranularity] = useState('monthly');
  const [rangePreset, setRangePreset] = useState('last12Months');

  const range = C.resolveDateRange(rangePreset === 'custom' ? 'last12Months' : rangePreset);
  const table = useMemo(() => {
    if (range.unsupported) return null;
    return C.buildComparisonTable(records, {
      channels, granularity, fromPeriod: range.startPeriod, toPeriod: range.endPeriod, metric,
    });
  }, [records, channels.join(','), granularity, range.startPeriod, range.endPeriod, metric]);

  const showYoyCol = granularity === 'monthly' || granularity === 'quarterly';

  function cell(cmp) {
    if (cmp.status === 'not-occurred') return el('span', { style: { color: 'var(--t3)' } }, '—');
    if (cmp.status === 'no-comparison-data') return el('span', { style: { color: 'var(--t3)' } }, 'n/a');
    if (cmp.status === 'zero-denominator') return el('span', { style: { color: 'var(--t3)' } }, '—');
    const chg = changeText(cmp);
    return el('span', { style: { color: toneColor(chg.tone) } },
      (cmp.absoluteChange != null ? (cmp.absoluteChange >= 0 ? '+' : '') + formatMetric(metric, cmp.absoluteChange) : '—') +
      '  ·  ' + chg.text
    );
  }

  return el('div', { className: 'card' },
    el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', marginBottom: 16 } },
      el('div', { style: { flex: 1, minWidth: 160 } },
        el('div', { style: { fontWeight: 600, fontSize: 14 } }, 'Sales comparison table'),
        el('div', { style: { fontSize: 11, color: 'var(--t3)', marginTop: 2 } }, 'Replaces the manual month-by-month spreadsheet comparison.')),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        el(FilterLabel, null, 'Metric'),
        el(Select, { value: metric, onChange: setMetric, options: [{ value: 'revenue', label: 'Revenue' }, { value: 'orders', label: 'Orders' }, { value: 'aov', label: 'AOV' }] })),
      el(GranularitySelect, { value: granularity, onChange: setGranularity }),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        el(FilterLabel, null, 'Range'),
        el(Select, {
          value: rangePreset, onChange: setRangePreset,
          options: [
            { value: 'last12Months', label: 'Last 12 months' },
            { value: 'thisYear', label: 'This year' },
            { value: 'lastYear', label: 'Last year' },
            { value: 'currentFY', label: 'Current financial year' },
            { value: 'previousFY', label: 'Previous financial year' },
          ],
        }))
    ),
    !table ? el(UnavailableNotice, { reason: range.reason }) :
    el('div', { className: 'scroll-x-fade table-scroll-hint', style: { overflowX: 'auto' } },
      el('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 } },
        el('thead', null,
          el('tr', { style: { borderBottom: '1px solid var(--bdr2)' } },
            ['Period', metric === 'orders' ? 'Orders' : 'Revenue', 'Previous period', 'Δ (MoM-style)', '% change'].map((h, i) =>
              el('th', { key: h, style: { textAlign: i === 0 ? 'left' : 'right', padding: '6px 10px', color: 'var(--t3)', fontWeight: 500, fontSize: 11, whiteSpace: 'nowrap' } }, h)
            ),
            showYoyCol && el('th', { key: 'yoyd', style: { textAlign: 'right', padding: '6px 10px', color: 'var(--t3)', fontWeight: 500, fontSize: 11 } }, 'Δ (YoY)'),
            showYoyCol && el('th', { key: 'yoyp', style: { textAlign: 'right', padding: '6px 10px', color: 'var(--t3)', fontWeight: 500, fontSize: 11 } }, '% YoY')
          )
        ),
        el('tbody', null,
          table.rows.map((row) => el('tr', { key: row.bucket.key, style: { borderBottom: '1px solid var(--bdr)' } },
            el('td', { style: { padding: '7px 10px', whiteSpace: 'nowrap' } }, row.bucket.label),
            el('td', { style: { padding: '7px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace" } },
              row.current.status === 'not-occurred' ? '—' : row.current.status === 'no-data' ? el('span', { style: { color: 'var(--t3)' } }, 'no data') : formatMetric(metric, row.current[metric])),
            el('td', { style: { padding: '7px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace", color: 'var(--t3)' } },
              row.mom.previous != null ? formatMetric(metric, row.mom.previous) : '—'),
            el('td', { style: { padding: '7px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace" } }, cell(row.mom)),
            el('td', { style: { padding: '7px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace" } },
              row.mom.status === 'ok' || row.mom.status === 'incomplete-current' ? (row.mom.percentChange != null ? (row.mom.percentChange >= 0 ? '+' : '') + row.mom.percentChange.toFixed(1) + '%' : '—') : ''),
            showYoyCol && el('td', { style: { padding: '7px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace" } }, cell(row.yoy)),
            showYoyCol && el('td', { style: { padding: '7px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace" } },
              row.yoy.status === 'ok' || row.yoy.status === 'incomplete-current' ? (row.yoy.percentChange != null ? (row.yoy.percentChange >= 0 ? '+' : '') + row.yoy.percentChange.toFixed(1) + '%' : '—') : '')
          )),
          el('tr', { style: { borderTop: '2px solid var(--bdr2)', fontWeight: 600 } },
            el('td', { style: { padding: '8px 10px' } }, 'Total / weighted avg'),
            el('td', { style: { padding: '8px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace" } }, table.totals.revenue != null ? formatMetric(metric, table.totals[metric]) : '—'),
            el('td', { colSpan: showYoyCol ? 5 : 3 })
          )
        )
      )
    ),
    metric === 'aov' && el('div', { style: { fontSize: 11, color: 'var(--t3)', marginTop: 10 } },
      'AOV total is total revenue ÷ total orders for the range — never an average of the per-row AOVs.')
  );
}

// ── channel contribution (§9) ────────────────────────────────
function ChannelContribution({ records, range }) {
  const [view, setView] = useState('donut');
  const nowPeriod = C.monthKeyFromDate(new Date());
  const contrib = useMemo(() => C.channelContribution(records, {
    channels: M.ACTIVE_CHANNELS, startPeriod: range.startPeriod, endPeriod: range.endPeriod, nowPeriod,
  }), [records, range.startPeriod, range.endPeriod]);

  const slices = contrib.channels.map((c) => ({
    label: M.CHANNEL_META[c.channel].short, value: c.revenue || 0, color: M.CHANNEL_META[c.channel].color,
  }));
  // One shared category ("Revenue by channel") with one bar per channel —
  // grouped side-by-side for the bar view, stacked into a single total bar
  // for the stacked-bar view.
  const contributionBucket = { label: 'Revenue by channel', key: 'contribution' };
  const barSeries = contrib.channels.map((c) => ({
    key: c.channel, channels: [c.channel],
    points: [{ bucket: contributionBucket, value: c.revenue, status: c.status, note: c.note }],
  }));

  return el('div', { className: 'card' },
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 16 } },
      el('div', null,
        el('div', { style: { fontWeight: 600, fontSize: 14 } }, 'Channel contribution'),
        el('div', { style: { fontSize: 11, color: 'var(--t3)', marginTop: 2 } }, 'Shopify · NOTHS · Etsy — the three active stores, for the date range selected above.')),
      el('div', { className: 'tab-bar' },
        [['donut', 'ti-chart-donut'], ['bar', 'ti-chart-bar'], ['stacked-bar', 'ti-stack-2']].map(([k, ic]) =>
          el('div', { key: k, className: 'tab' + (view === k ? ' active' : ''), onClick: () => setView(k) }, el('i', { className: 'ti ' + ic, style: { fontSize: 13 } }))))
    ),
    contrib.totals.status === 'no-data' ? el(UnavailableNotice, { reason: 'No revenue recorded for the active channels in this period.' }) :
    view === 'donut' ? el(RorCharts.SalesChart, { type: 'donut', slices, formatValue: (v) => fmtC(v, 0) }) :
    el(RorCharts.SalesChart, { type: view === 'bar' ? 'bar' : 'stacked-bar', series: barSeries, formatValue: (v, short) => short ? fmtC(v, 0) : fmtC(v, 0) }),
    el('div', { className: 'scroll-x-fade', style: { overflowX: 'auto', marginTop: 16 } },
      el('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 480 } },
        el('thead', null, el('tr', { style: { borderBottom: '1px solid var(--bdr2)' } },
          ['Channel', 'Revenue', '% of total', 'Orders', 'AOV'].map((h, i) => el('th', { key: h, style: { textAlign: i === 0 ? 'left' : 'right', padding: '6px 10px', color: 'var(--t3)', fontSize: 11, fontWeight: 500 } }, h)))),
        el('tbody', null, contrib.channels.map((c) => el('tr', { key: c.channel, style: { borderBottom: '1px solid var(--bdr)' } },
          el('td', { style: { padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6 } },
            el('div', { style: { width: 8, height: 8, borderRadius: 2, background: M.CHANNEL_META[c.channel].color } }),
            M.CHANNEL_META[c.channel].label),
          el('td', { style: { padding: '7px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace" } }, c.revenue != null ? fmtC(c.revenue, 0) : '—'),
          el('td', { style: { padding: '7px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace" } }, c.pctOfRevenue != null ? fmtP(c.pctOfRevenue) : '—'),
          el('td', { style: { padding: '7px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace" } }, c.orders != null ? fmt(c.orders, 0) : '—'),
          el('td', { style: { padding: '7px 10px', textAlign: 'right', fontFamily: "'DM Mono',monospace" } }, c.aov != null ? fmtC(c.aov, 2) : '—')
        )))
      )
    )
  );
}

// ── interactive sales explorer (§8) ─────────────────────────
const CHART_TYPES = [
  { key: 'bar', label: 'Bar', icon: 'ti-chart-bar' },
  { key: 'line', label: 'Line', icon: 'ti-chart-line' },
  { key: 'stacked-bar', label: 'Stacked bar', icon: 'ti-stack-2' },
  { key: 'area', label: 'Area', icon: 'ti-chart-area-line' },
  { key: 'donut', label: 'Donut', icon: 'ti-chart-donut' },
];

function SalesExplorer({ records }) {
  const [metric, setMetric] = useState('revenue');
  const [storeMode, setStoreMode] = useState('all'); // 'all' | channel key | 'byChannel'
  const [rangePreset, setRangePreset] = useState('last12Months');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [granularity, setGranularity] = useState('monthly');
  const [comparison, setComparison] = useState('none');
  const [chartType, setChartType] = useState('bar');
  const [includeLegacy, setIncludeLegacy] = useState(false);

  const range = C.resolveDateRange(rangePreset, { customStart: customRange.start, customEnd: customRange.end });

  const channels = storeMode === 'all' || storeMode === 'byChannel'
    ? (includeLegacy ? M.ALL_CHANNELS : M.ACTIVE_CHANNELS)
    : [storeMode];
  const seriesMode = storeMode === 'byChannel' ? 'byChannel' : 'combined';

  // donut only makes sense as a channel-revenue-contribution snapshot —
  // restrict it to byChannel mode so it isn't offered where it can't mean anything.
  const availableChartTypes = CHART_TYPES.filter((t) => t.key !== 'donut' || seriesMode === 'byChannel');
  const effectiveChartType = availableChartTypes.some((t) => t.key === chartType) ? chartType : 'bar';

  const nowPeriod = C.monthKeyFromDate(new Date());
  const seriesData = useMemo(() => {
    if (range.unsupported) return null;
    return C.buildSeries(records, {
      channels, granularity, fromPeriod: range.startPeriod, toPeriod: range.endPeriod,
      metric, seriesMode, comparison, nowPeriod,
    });
  }, [records, channels.join(','), granularity, range.startPeriod, range.endPeriod, metric, seriesMode, comparison]);

  const donutSlices = useMemo(() => {
    if (!seriesData || effectiveChartType !== 'donut') return [];
    return seriesData.series.map((s) => {
      const total = s.points.reduce((sum, p) => sum + (typeof p.value === 'number' ? p.value : 0), 0);
      const ch = s.channels[0];
      return { label: M.CHANNEL_META[ch] ? M.CHANNEL_META[ch].short : 'All', value: total, color: M.CHANNEL_META[ch] ? M.CHANNEL_META[ch].color : 'var(--amb)' };
    });
  }, [seriesData, effectiveChartType]);

  return el('div', { className: 'card' },
    el('div', { style: { marginBottom: 16 } },
      el('div', { style: { fontWeight: 600, fontSize: 14 } }, 'Sales explorer'),
      el('div', { style: { fontSize: 11, color: 'var(--t3)', marginTop: 2 } }, 'One chart, many views — switch metric, store, granularity, comparison and chart type without losing your place.')
    ),
    el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 18 } },
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        el(FilterLabel, null, 'Metric'),
        el(Select, { value: metric, onChange: setMetric, options: [{ value: 'revenue', label: 'Revenue' }, { value: 'orders', label: 'Orders' }, { value: 'aov', label: 'AOV' }] })),
      el(StoreSelect, {
        value: storeMode === 'byChannel' ? 'all' : storeMode,
        onChange: setStoreMode,
        includeLegacyToggle: true, includeLegacy, onToggleLegacy: setIncludeLegacy,
      }),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        el(FilterLabel, null, 'Series'),
        el(Select, {
          value: seriesMode, onChange: (v) => setStoreMode(v === 'byChannel' ? 'byChannel' : 'all'),
          options: [{ value: 'combined', label: 'Combined' }, { value: 'byChannel', label: 'Separate per store' }],
        })),
      el(DateRangeSelect, { value: rangePreset, onChange: setRangePreset, custom: customRange, onCustomChange: setCustomRange }),
      el(GranularitySelect, { value: granularity, onChange: setGranularity }),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        el(FilterLabel, null, 'Comparison'),
        el(Select, {
          value: comparison, onChange: setComparison,
          options: [{ value: 'none', label: 'No comparison' }, { value: 'previous-period', label: 'Previous period' }, { value: 'previous-year', label: 'Previous year' }],
        }))
    ),
    el('div', { className: 'tab-bar', style: { marginBottom: 16, width: 'fit-content' } },
      availableChartTypes.map((t) => el('div', {
        key: t.key, className: 'tab' + (effectiveChartType === t.key ? ' active' : ''),
        onClick: () => setChartType(t.key),
      }, el('i', { className: 'ti ' + t.icon, style: { fontSize: 13, marginRight: 5 } }), t.label))
    ),
    range.unsupported ? el(UnavailableNotice, { reason: range.reason }) :
    !seriesData ? null :
    effectiveChartType === 'donut'
      ? el(RorCharts.SalesChart, { type: 'donut', slices: donutSlices, formatValue: (v) => formatMetric(metric, v) })
      : el(RorCharts.SalesChart, {
          type: effectiveChartType, series: seriesData.series, comparisonSeries: seriesData.comparisonSeries,
          formatValue: (v, short) => formatMetric(metric, v, short),
        })
  );
}

// ── top-level Dashboard 2 ────────────────────────────────────
function RorSalesApp() {
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [meta, setMeta] = useState(null);
  const [records, setRecords] = useState([]);
  const [topStore, setTopStore] = useState('all');
  const [topRangePreset, setTopRangePreset] = useState('currentFY');
  const [comparisonMode, setComparisonMode] = useState('mom');

  useEffect(() => {
    const adapter = RorDataAdapter.createDemoAdapter('dashboard2/demo-data.json');
    adapter.load()
      .then((d) => { setMeta(d.meta); setRecords(d.records); setLoading(false); })
      .catch((e) => { setLoadErr(e.message || 'Failed to load sales data'); setLoading(false); });
  }, []);

  const range = C.resolveDateRange(topRangePreset);
  const channels = topStore === 'all' ? M.ACTIVE_CHANNELS : [topStore];

  if (loading) {
    return el('div', { style: { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 } },
      el('div', { className: 'spin', style: { width: 24, height: 24, border: '2px solid var(--amb)', borderTopColor: 'transparent', borderRadius: '50%' } }),
      el('div', { style: { fontSize: 13, color: 'var(--t3)' } }, 'Loading ROR Sales data…'));
  }

  return el('div', { style: { minHeight: '100vh', display: 'flex', flexDirection: 'column' } },
    el('div', { style: { padding: 16, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1280, width: '100%', margin: '0 auto' } },
      meta && el('div', { style: {
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 20,
        background: 'var(--amb-bg)', border: '1px solid var(--amb-bdr)', fontSize: 11.5, color: 'var(--amb)', width: 'fit-content',
      } },
        el('i', { className: 'ti ti-flask', style: { fontSize: 12 } }),
        el('span', null, meta.label)
      ),
      loadErr && el(UnavailableNotice, { reason: 'Could not load sales data: ' + loadErr }),

      // §5 top controls
      el('div', { className: 'card', style: { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' } },
        el(StoreSelect, { value: topStore, onChange: setTopStore }),
        el(DateRangeSelect, { value: topRangePreset, onChange: setTopRangePreset, custom: {}, onCustomChange: () => {} }),
        el('div', { style: { fontSize: 11, color: 'var(--t3)', lineHeight: 1.5, maxWidth: 340 } },
          'KPI cards and channel contribution below use these two filters. The sales explorer and comparison table further down have their own independent controls.')
      ),

      range.unsupported ? el(UnavailableNotice, { reason: range.reason }) :
        el(KpiSection, { records, channels, range, comparisonMode, setComparisonMode }),

      el(ComparisonTable, { records, channels }),

      !range.unsupported && el(ChannelContribution, { records, range }),

      el(SalesExplorer, { records }),

      el('div', { style: { fontSize: 11, color: 'var(--t3)', padding: '4px 4px 24px', lineHeight: 1.7 } },
        el('div', { style: { fontWeight: 600, color: 'var(--t2)', marginBottom: 4 } }, 'Revenue definitions differ by channel — see build brief §13:'),
        M.ACTIVE_CHANNELS.map((c) => el('div', { key: c }, M.CHANNEL_META[c].label + ': ' + M.CHANNEL_META[c].revenueDefinition))
      )
    )
  );
}

function TopNavSwitcher({ active, onChange }) {
  return el('div', { style: {
    background: 'var(--s1)', borderBottom: '1px solid var(--bdr)', padding: '8px 16px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 8,
  } },
    el('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
      el('div', { style: { width: 8, height: 8, borderRadius: '50%', background: 'var(--amb)' } }),
      el('div', { style: { fontWeight: 600, fontSize: 14 } }, 'Rock On Ruby')
    ),
    el('div', { className: 'tab-bar tab-bar-scroll' },
      [['shopify', 'ti-brand-shopify', 'Shopify Growth'], ['ror-sales', 'ti-chart-histogram', 'ROR Sales']].map(([key, icon, label]) =>
        el('div', {
          key, className: 'tab' + (active === key ? ' active' : ''), onClick: () => onChange(key), style: { whiteSpace: 'nowrap' },
        }, el('i', { className: 'ti ' + icon, style: { fontSize: 13 } }), el('span', { style: { marginLeft: 5 } }, label))
      )
    )
  );
}

root.RorSalesApp = RorSalesApp;
root.RorTopNavSwitcher = TopNavSwitcher;

})(window);
