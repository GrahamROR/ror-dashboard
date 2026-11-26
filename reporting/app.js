// Four reporting perspectives; Commercial always keeps the original dashboard mounted.
(function (root) {
  'use strict';
  const h = root.React.createElement;
  const { useState, useEffect, useMemo, useRef } = root.React;
  const TABS = [['commercial', 'Commercial'], ['financial', 'Financial'], ['native', 'Native Analytics'], ['comparison', 'Metric Comparison']];
  const card = { fontSize: 14, lineHeight: 1.65, marginBottom: 16 };
  const muted = { color: 'var(--t2)', fontSize: 13 };
  const cell = { padding: '10px 12px', textAlign: 'right', verticalAlign: 'top' };
  const money = pence => pence == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
  const pounds = value => value == null ? '—' : money(value * 100);
  const number = value => value == null ? '—' : new Intl.NumberFormat('en-GB').format(value);
  const percent = value => value == null ? '—' : (value * 100).toFixed(2) + '%';
  const date = value => value ? root.RorModel.formatDate(value) : 'unavailable';

  function Notice({ children }) {
    return h('div', { role: 'status', className: 'card', style: { ...card, borderColor: 'var(--amb)' } }, children);
  }

  const storeTone = { shopify: 'blu', etsy: 'pur', noths: 'amb' };
  const accent = tone => 'var(--' + tone + ')';

  function KPIs({ items }) {
    return h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 12, marginBottom: 16 } },
      items.map(([label, value, tone, icon, caption]) => h('div', { key: label, className: 'card', style: {
        minWidth: 0, padding: '14px 16px', borderTop: '2px solid ' + accent(tone),
        background: 'linear-gradient(var(--' + tone + '-bg), transparent), var(--s1)',
      } },
        h('div', { style: { color: accent(tone), display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 } },
          h('i', { className: 'ti ti-' + icon, 'aria-hidden': true }), label),
        h('div', { style: { fontSize: 27, fontWeight: 700, fontVariantNumeric: 'tabular-nums' } }, value),
        caption && h('div', { style: muted }, caption))));
  }

  function Table({ label, headers, rows, tones = {}, highlights = [] }) {
    return h('div', { style: { overflowX: 'auto', maxWidth: '100%' }, tabIndex: 0, role: 'region', 'aria-label': label },
      h('table', { 'aria-label': label, style: { width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: headers.length > 4 ? 620 : 0 } },
        h('thead', null, h('tr', null, headers.map((name, i) => h('th', { key: name, scope: 'col', style: {
          ...cell, textAlign: i ? 'right' : 'left', background: 'var(--s2)', color: tones[i] ? accent(tones[i]) : 'var(--t2)', borderBottom: '1px solid var(--bdr2)',
        } }, name)))),
        h('tbody', null, rows.map((row, i) => h('tr', { key: i, style: {
          borderBottom: '1px solid var(--bdr)', background: highlights.includes(i) ? 'var(--blu-bg)' : i % 2 ? 'var(--s2)' : undefined,
        } }, row.map((value, j) => h(j ? 'td' : 'th', { key: j, scope: j ? undefined : 'row', style: {
          ...cell, textAlign: j ? 'right' : 'left', fontWeight: !j || highlights.includes(i) ? 600 : 400,
          fontVariantNumeric: 'tabular-nums', whiteSpace: j ? 'nowrap' : undefined,
        } }, value)))))));
  }

  function Section({ title, children }) {
    return h('section', { className: 'card', style: card },
      h('h2', { style: { fontSize: 17, margin: '0 0 12px' } }, title), children);
  }

  function Details({ title, children }) {
    return h('details', { style: { ...muted, marginTop: 10 } },
      h('summary', { style: { cursor: 'pointer', color: 'var(--blu)' } }, title), children);
  }

  function Statuses({ report }) {
    const maths = report.total.identity.status;
    const checked = report.sourceStatus === 'source-verified';
    return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }, 'data-report-statuses': true },
      h('span', { className: 'badge ' + (maths === 'ties' ? 'bb' : 'ba') }, 'Arithmetic: ' + (maths === 'ties' ? 'Ties' : maths === 'zero-orders' ? 'Zero orders' : 'Unavailable')),
      h('span', { className: 'badge ' + (checked ? 'bb' : 'ba') }, 'Source: ' + (checked ? 'Verified' : report.sourceStatus === 'provisional' ? 'Provisional' : 'Unavailable')),
      h('span', { className: 'badge', 'data-report-books': true }, 'Accounting: Not compared'));
  }

  function Arithmetic({ report }) {
    const row = (label, part) => [label, number(part.orders), money(part.pence),
      part.identity.perOrder == null ? '—' : '£' + part.identity.perOrder.toFixed(12) + '…',
      money(part.identity.reconstructedPence), money(part.identity.roundedDriftPence)];
    const rows = report.parts.map(p => row(p.label, p));
    if (rows.length > 1) rows.push(row('All Stores (provisional)', report.total));
    return h(Section, { title: 'Sales reconciliation' },
      h(Table, { label: 'Management sales arithmetic', headers: ['Store', 'Source orders', 'Management Net Sales', 'Management Net Sales per order', 'Orders × exact ratio', 'Rounding difference'], rows, tones: { 2: 'blu', 4: 'grn' }, highlights: rows.length > 1 ? [rows.length - 1] : [] }),
      h('p', { style: muted }, 'This is an arithmetic tie. Source verification and accounting reconciliation are separate.'),
      h(Details, { title: 'How the reconciliation works' },
        h('p', null, 'Sales in pence ÷ source orders gives the exact ratio. The displayed decimal is an approximation. The rounding difference compares orders × the two-decimal value with net sales. A tie verifies the arithmetic. Accounting reconciliation is separate.'),
        h('ul', null, report.parts.map(p => h('li', { key: p.channel }, p.countLabel)))));
  }

  function Financial({ report }) {
    const { pence, orders, identity, countLabel } = report.total;
    return h('div', null,
      h(KPIs, { items: [
        ['Management Net Sales', money(pence), report.sourceStatus === 'provisional' ? 'amb' : 'grn', 'currency-pound', report.sourceStatus === 'provisional' ? 'Provisional management estimate' : undefined],
        ['Source orders', number(orders), 'blu', 'shopping-bag', countLabel],
        ['Management Net Sales per order', pounds(identity.perOrder), 'pur', 'receipt', 'Rounded for display'],
        ['Rounding difference', money(identity.roundedDriftPence), 'amb', 'calculator', 'If sales per order is rounded to 2dp'],
      ] }),
      h(Statuses, { report }), h(Arithmetic, { report }),
      h(Section, { title: 'Sales breakdown' },
        report.parts.map(p => h('details', { key: p.channel, open: report.parts.length === 1 ? true : undefined, style: { marginBottom: 8, border: '1px solid var(--bdr)', borderRadius: 8, overflow: 'hidden' } },
          h('summary', { style: { cursor: 'pointer', padding: '10px 12px', background: 'var(--s2)', color: accent(storeTone[p.channel]), fontWeight: 600 } },
            p.label + (p.confidence === 'provisional' ? ' · Provisional' : ''), h('span', { style: { float: 'right' } }, money(p.pence))),
          p.available ? h(Table, { label: p.label + ' source components', headers: ['Measure', 'Source amount'], rows: [...p.components.map(c => [h('span', { title: c.definition }, c.label), money(c.value)]),
            ...(p.channel === 'shopify' ? [] : [[(p.channel === 'etsy' ? '(Net merchandise + shipping)' : 'Original customer order total') + ' ÷ 1.20 · Management Net Sales', money(p.pence)]])] }) :
            h('p', { role: 'status', style: { padding: '0 12px' } }, 'Complete matching source coverage is unavailable.')))));
  }

  function NativeAnalytics({ report, marketingStatus }) {
    const shop = report.parts.find(p => p.channel === 'shopify');
    const marketing = report.marketing;
    const single = report.parts.length === 1;
    const captureCaption = value => value != null ? 'Exact-period Shopify capture' : marketingStatus === 'loading' ? 'Loading Shopify capture…' : 'Unavailable for this exact interval';
    const metrics = [['gross_sales', 'Gross merchandise'], ['discounts', 'Discounts (source sign)'], ['sales_reversals', 'Sales reversals'],
      ['net_sales', 'Net merchandise'], ['shipping', 'Shipping'], ['taxes', 'Source taxes'], ['total_sales', 'Source total sales']];
    const rows = [
      ['Source orders', ...report.parts.map(p => number(p.orders))],
      ...(shop ? [['Shopify-reported AOV', ...report.parts.map(p => pounds(p.nativeAov))]] : []),
      ...metrics.filter(([key]) => report.parts.some(p => p.components.some(c => c.key === key))).map(([key, label]) =>
        [label, ...report.parts.map(p => {
          const component = p.components.find(c => c.key === key);
          return h('span', { title: component?.definition }, money(component?.value));
        })]),
    ];
    return h('div', null,
      h(KPIs, { items: [
        ...(shop ? [['Shopify-reported AOV', pounds(shop.nativeAov), 'pur', 'receipt', shop.nativeAov == null ? 'Unavailable for this exact interval' : 'Captured for this exact interval']] : []),
        ['Source orders', number(report.total.orders), 'blu', 'shopping-bag', report.total.countLabel],
        ...(shop && single ? [['Sessions', number(marketing?.sessions), 'grn', 'users', captureCaption(marketing?.sessions)],
          ['Store conversion rate', percent(marketing?.conversionRate), 'amb', 'percentage', captureCaption(marketing?.conversionRate)]] : []),
        ...(!shop || !single ? report.parts.filter(p => p.channel !== 'shopify').map(p => [p.channel === 'etsy' ? 'Etsy receipt total' : 'NOTHS original order total', money(p.components.find(c => c.key === 'total_sales')?.value), storeTone[p.channel], 'currency-pound', p.channel === 'etsy' ? 'Includes source-reported tax' : 'Placed-order cohort, before refund deductions']) : []),
      ] }),
      h(Section, { title: 'Native sales by store' },
        h(Table, { label: 'Native source measures', headers: ['Measure', ...report.parts.map(p => p.label)], rows, tones: Object.fromEntries(report.parts.map((p, i) => [i + 1, storeTone[p.channel]])), highlights: shop ? [1] : [] }),
        h(Details, { title: 'Native metric definitions' },
          h('p', null, 'Shopify AOV is captured for the exact interval before post-order adjustments. Sales, discounts, shipping and taxes retain each platform’s source definition.'),
          h('p', null, 'Etsy merchandise follows Stats. Shopify discounts are signed. Etsy and NOTHS discounts are shown as amounts. NOTHS totals are original customer order totals.'),
          h('p', null, 'A dash indicates a measure is unavailable or does not apply.'),
          h('p', null, 'Sessions and customer rates require a matching Shopify capture. Select Shopify and a captured full month or performance window.'))),
      shop && single && marketing?.status === 'matched' && h(Section, { title: 'Shopify traffic and customer rates' },
        h(Table, { label: 'Exact-period Shopify marketing metrics', headers: ['Measure', 'Value'], rows: [
          ['Sessions', number(marketing.sessions)], ['Online store conversion rate', percent(marketing.conversionRate)], ['Returning customer rate', percent(marketing.repeatRate)],
        ] })));
  }

  function Comparison({ report }) {
    const shop = report.parts.find(p => p.channel === 'shopify');
    const measures = [
      ['Management Net Sales per order', p => p.identity.perOrder, 'Management Net Sales ÷ matching source orders.'],
      ['Shopify-reported AOV', p => p.nativeAov, 'Shopify’s exact-period AOV before post-order adjustments.'],
      ['Net merchandise per order', p => p.merchandisePerOrder, 'Source net merchandise ÷ matching source orders. Excludes shipping.'],
      ['Native total sales per order', p => p.totalPerOrder, 'Source total ÷ matching source orders. Each platform defines its total separately.'],
      ['Shopify gross sales per order', p => p.grossPerOrder, 'Gross merchandise plus validated original shipping ÷ eligible orders.'],
    ].filter((_, i) => shop || (i !== 1 && i !== 4));
    return h('div', null,
      h(KPIs, { items: [
        ['Management Net Sales per order', pounds(report.total.identity.perOrder), 'grn', 'currency-pound', report.parts.length > 1 ? 'All Stores · provisional' : report.parts[0].label],
        ...(shop ? [['Shopify-reported AOV', pounds(shop.nativeAov), 'pur', 'receipt'],
          ['Shopify net merchandise per order', pounds(shop.merchandisePerOrder), 'blu', 'shopping-bag'],
          ['Shopify total sales per order', pounds(shop.totalPerOrder), 'amb', 'calculator']] :
          [['Native total sales per order', pounds(report.parts[0].totalPerOrder), 'blu', 'receipt']]),
      ] }),
      h(Section, { title: 'Compare sales per order' },
        h(Table, { label: 'Sales per order comparison', headers: ['Measure', ...report.parts.map(p => p.label)], rows: measures.map(([label, get]) =>
          [label, ...report.parts.map(p => pounds(get(p)))]), tones: Object.fromEntries(report.parts.map((p, i) => [i + 1, storeTone[p.channel]])), highlights: shop ? [0, 1] : [0] }),
        h(Details, { title: 'How each metric is calculated' },
          h('ul', null, report.parts.map(p => h('li', { key: p.channel }, p.countLabel))),
          report.parts.some(p => p.channel === 'noths') && h('p', null, 'NOTHS net merchandise per order is unavailable because refund-adjusted merchandise sales are unverified.'),
          h('dl', null, measures.map(([label, , definition]) => h('div', { key: label, style: { marginTop: 8 } },
            h('dt', { style: { fontWeight: 600 } }, label), h('dd', { style: { margin: 0 } }, definition)))))));
  }

  function Reports({ dashboard, view, shop, markets, financeError, marketplaceError }) {
    const [contexts, setContexts] = useState({
      shopify: { store: 'shopify', preset: 'previousFY', start: '', end: '' },
      'ror-sales': { store: 'all', preset: 'previousFY', start: '', end: '' },
    });
    const [marketing, setMarketing] = useState(null);
    const [marketingStatus, setMarketingStatus] = useState('loading');
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
      let active = true;
      setMarketingStatus('loading');
      Promise.resolve().then(() => fetch('data.json', { cache: 'no-store' }))
        .then(r => { if (!r.ok) throw Error('capture unavailable'); return r.json(); })
        .then(data => { if (active) { setMarketing(data); setMarketingStatus('ready'); } })
        .catch(() => { if (active) { setMarketing(null); setMarketingStatus('unavailable'); } });
      return () => { active = false; };
    }, [attempt]);
    const context = contexts[dashboard];
    const update = patch => setContexts(previous => ({ ...previous, [dashboard]: { ...previous[dashboard], ...patch } }));
    const channels = context.store === 'all' ? root.RorReportingMetrics.CHANNELS : [context.store];
    const range = root.RorCalc.resolveDateRange(context.preset, { customStart: context.start, customEnd: context.end });
    const report = useMemo(() => range.unsupported ? null : root.RorReportingMetrics.build({ shop, markets, start: range.startDate, end: range.endDate, channels, marketing }),
      [shop, markets, range.startDate, range.endDate, range.unsupported, context.store, marketing]);
    const selectStyle = { padding: '8px 10px', background: 'var(--s2)', color: 'var(--t1)', border: '1px solid var(--bdr2)', borderRadius: 6, font: 'inherit', maxWidth: '100%', minWidth: 0 };
    const field = (label, node) => h('label', { style: { display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 } }, h('span', null, label), node);
    return h('div', { style: { maxWidth: 1280, margin: '0 auto', padding: '16px 20px', fontSize: 14, lineHeight: 1.65 }, 'data-report-context': dashboard },
      h('div', { className: 'card', style: { ...card, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' } },
        field('Report store', h('select', { 'aria-label': 'Report store', value: context.store, disabled: dashboard === 'shopify', style: selectStyle, onChange: e => update({ store: e.target.value }) },
          (dashboard === 'shopify' ? ['shopify'] : ['all', ...root.RorReportingMetrics.CHANNELS]).map(c => h('option', { key: c, value: c }, root.RorReportingMetrics.NAMES[c])))),
        field('Report date range', h('select', { 'aria-label': 'Report date range', value: context.preset, style: selectStyle, onChange: e => update({ preset: e.target.value }) },
          root.RorCalc.REPORT_DATE_PRESETS.map(p => h('option', { key: p.key, value: p.key }, p.label)))),
        context.preset === 'custom' && field('Report start date', h('input', { type: 'date', lang: 'en-GB', 'aria-label': 'Report start date', value: context.start, style: selectStyle, onChange: e => update({ start: e.target.value }) })),
        context.preset === 'custom' && field('Report end date', h('input', { type: 'date', lang: 'en-GB', 'aria-label': 'Report end date', value: context.end, style: selectStyle, onChange: e => update({ end: e.target.value }) })),
        h('span', { style: muted }, 'Shared across the three reporting views')),
      range.unsupported ? h(Notice, null, range.reason) : h('div', null,
        h('p', { 'data-new-report-period': true }, h('strong', null, range.label + ' · ' + date(range.startDate) + ' → ' + date(range.endDate) + ' (inclusive)'), ' · GBP · Europe/London'),
        (financeError || marketplaceError) && h(Notice, null, root.RorModel.formatDateText([financeError, marketplaceError].filter(Boolean).join(' '))),
        shop?.freshness?.warning && h(Notice, null, root.RorModel.formatDateText(shop.freshness.warning)),
        (shop?.refreshStatus?.status === 'failed' || markets?.refreshStatus?.status === 'failed') && h(Notice, null, 'Latest source refresh failed. Retained figures are shown only for periods with complete coverage.'),
        report?.status === 'error' ? h(Notice, null, report.error) : h('div', null,
          report?.status === 'unavailable' && h(Notice, null, 'Complete matching source coverage is unavailable. Requested dates are preserved; missing amounts are not replaced with legacy gross sales or zero.'),
          view === 'financial' ? h(Financial, { report }) : view === 'native' ? h(NativeAnalytics, { report, marketingStatus }) : h(Comparison, { report }),
          h('details', { className: 'card', style: card }, h('summary', { style: { cursor: 'pointer' } }, 'Source definitions and coverage'),
            h('p', null, root.ManagementFinance.DEFINITIONS.net_revenue),
            h('p', null, 'Marketplace management estimates use fiscal penny allocation. Etsy source tax is not deducted again. The NOTHS estimate uses original order totals. Cumulative refunds are excluded from the calculation because posting dates are unavailable.'),
            report.parts.map(p => h('p', { key: p.channel, style: { overflowWrap: 'anywhere' } }, p.label + ': through ' + date(p.through) + ' · ' + p.confidence + ' · ' + (p.sourceId || 'Source unavailable'), p.warning && h('span', null, ' · ' + root.RorModel.formatDateText(p.warning)))),
            h('p', { style: muted }, 'Historical workbook figures and archived comparisons remain in Commercial. These views require complete daily source coverage.')))),
      view === 'native' && marketingStatus === 'unavailable' && h('button', { type: 'button', onClick: () => setAttempt(n => n + 1), style: selectStyle }, 'Retry Shopify capture'));
  }

  // The class is created only when the new region is first opened. No error boundary
  // surrounds Commercial; report rendering failures cannot unmount the original app.
  let Boundary;
  function ReportBoundary(props) {
    if (!Boundary) Boundary = class extends root.React.Component {
      constructor(p) { super(p); this.state = { failed: false }; }
      static getDerivedStateFromError() { return { failed: true }; }
      render() {
        return this.state.failed ? h(Notice, null, 'Report unavailable. Commercial remains available with its selections preserved. ',
          h('button', { type: 'button', onClick: () => this.setState({ failed: false }) }, 'Retry report')) : this.props.children;
      }
    };
    return h(Boundary, props);
  }

  function Workspace({ children, dashboard, shop, markets, financeError, marketplaceError }) {
    const [view, setView] = useState('commercial');
    const [opened, setOpened] = useState(false);
    const scrolls = useRef({});
    function select(next) {
      if (next === view) return;
      scrolls.current[dashboard + ':' + view] = root.scrollY || 0;
      setOpened(true);
      setView(next);
    }
    useEffect(() => {
      const frame = root.requestAnimationFrame(() => root.scrollTo(0, scrolls.current[dashboard + ':' + view] || 0));
      return () => root.cancelAnimationFrame(frame);
    }, [view, dashboard]);
    const onKey = event => {
      const index = TABS.findIndex(([key]) => key === view);
      const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : null;
      if (next == null) return;
      event.preventDefault();
      select(TABS[next][0]);
      event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus();
    };
    return h(root.React.Fragment, null,
      h('nav', { 'aria-label': 'Reporting views', style: { background: 'var(--s1)', borderBottom: '1px solid var(--bdr)', padding: '8px 16px' } },
        h('div', { role: 'tablist', 'aria-label': 'Reporting views', style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
          TABS.map(([key, label]) => h('button', { key, type: 'button', role: 'tab', id: 'report-tab-' + key,
            'aria-selected': view === key, 'aria-controls': key === 'commercial' ? 'report-commercial' : 'report-additional', tabIndex: view === key ? 0 : -1,
            onClick: () => select(key), onKeyDown: onKey,
            style: { font: 'inherit', fontSize: 14, padding: '8px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--bdr2)',
              color: view === key ? 'var(--amb)' : 'var(--t2)', background: view === key ? 'var(--amb-bg)' : 'transparent' } }, label)))),
      h('div', { id: 'report-commercial', role: 'tabpanel', 'aria-labelledby': 'report-tab-commercial', hidden: view !== 'commercial',
        style: view === 'commercial' ? undefined : { display: 'none' }, 'data-commercial-slot': true }, children),
      h('div', { id: 'report-additional', role: 'tabpanel', 'aria-labelledby': 'report-tab-' + view, hidden: view === 'commercial',
        style: view === 'commercial' ? { display: 'none' } : undefined },
        opened && h(ReportBoundary, null, h(Reports, { dashboard, view, shop, markets, financeError, marketplaceError }))));
  }

  root.RorReportingWorkspace = Workspace;
})(window);
