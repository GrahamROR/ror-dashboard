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

  function Table({ label, headers, rows }) {
    return h('div', { style: { overflowX: 'auto', maxWidth: '100%' }, tabIndex: 0, role: 'region', 'aria-label': label },
      h('table', { 'aria-label': label, style: { width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 580 } },
        h('thead', null, h('tr', null, headers.map((name, i) => h('th', { key: name, scope: 'col', style: { ...cell, textAlign: i ? 'right' : 'left', borderBottom: '1px solid var(--bdr2)' } }, name)))),
        h('tbody', null, rows.map((row, i) => h('tr', { key: i, style: { borderBottom: '1px solid var(--bdr)' } }, row.map((value, j) =>
          h(j ? 'td' : 'th', { key: j, scope: j ? undefined : 'row', style: { ...cell, textAlign: j ? 'right' : 'left', fontWeight: j ? 400 : 500 } }, value)))))));
  }

  function Statuses({ report }) {
    const maths = report.total.identity.status;
    return h('div', { className: 'card', style: card, 'data-report-statuses': true },
      h('div', null, h('strong', null, 'Arithmetic: '), maths === 'ties' ? 'Ties using the exact sales ÷ orders fraction' : maths === 'zero-orders' ? 'Unavailable — zero orders' : 'Unavailable — complete matching sales and counts required'),
      h('div', null, h('strong', null, 'Source: '), report.sourceStatus === 'source-verified' ? 'Source-verified Shopify figures' : report.sourceStatus === 'provisional' ? 'Provisional management estimate — source assumptions remain' : 'Unavailable for the requested period'),
      h('div', { 'data-report-books': true }, h('strong', null, 'Accounting: '), 'Not compared in this view. Private accounting reconciliation is separate.'),
      h('p', { style: { ...muted, marginBottom: 0 } }, 'A ratio derived from sales will tie arithmetically. This does not independently validate source totals, order eligibility or the books.'));
  }

  function Arithmetic({ report }) {
    const rows = report.parts.map(p => [p.label, number(p.orders), money(p.pence),
      p.identity.perOrder == null ? '—' : '£' + p.identity.perOrder.toFixed(12) + '…',
      money(p.identity.reconstructedPence), money(p.identity.roundedDriftPence)]);
    if (report.parts.length > 1) rows.push(['All Stores (provisional)', number(report.total.orders), money(report.total.pence),
      report.total.identity.perOrder == null ? '—' : '£' + report.total.identity.perOrder.toFixed(12) + '…',
      money(report.total.identity.reconstructedPence), money(report.total.identity.roundedDriftPence)]);
    return h('section', { className: 'card', style: card, 'data-report-arithmetic': true },
      h('h2', { style: { fontSize: 18, marginTop: 0 } }, 'Orders × Management Net Sales per order'),
      h('p', null, 'The calculation keeps sales in integer pence and uses the exact sales ÷ orders fraction. The decimal shown here is a display approximation, never an input rounded to two decimal places.'),
      h(Table, { label: 'Management sales arithmetic', headers: ['Store', 'Source orders', 'Management Net Sales', 'Sales per order (decimal display)', 'Exact fraction × orders', 'Drift if per order rounded to 2dp'], rows }),
      h('p', { style: muted }, 'Drift = orders × the two-decimal displayed value − reported sales. Shopify counts eligible orders; Etsy counts source orders; NOTHS counts a provisional placed-order cohort. Zero-order periods have no per-order identity.'));
  }

  function Financial({ report }) {
    return h('div', null, h(Statuses, { report }), h(Arithmetic, { report }), report.parts.map(p =>
      h('section', { key: p.channel, className: 'card', style: card },
        h('h2', { style: { fontSize: 18, marginTop: 0 } }, p.label + ' · Source components'),
        h('p', { style: muted }, p.countLabel + ' · ' + p.confidence),
        p.available ? h(Table, { label: p.label + ' source components', headers: ['Measure', 'Source amount'], rows: p.components.map(c => [h('span', { title: c.definition }, c.label), money(c.value)]) }) :
          h('p', { role: 'status' }, 'Complete matching source coverage is unavailable.'),
        p.channel !== 'shopify' && h('p', { style: muted }, p.channel === 'etsy' ? 'Management Net Sales retains the existing provisional merchandise-plus-shipping ÷ 1.20 assumption and fiscal penny allocation. Source-reported tax is not deducted again.' :
          'Management Net Sales retains the existing provisional customer-total ÷ 1.20 assumption and fiscal penny allocation. Cumulative refunds are not assigned invented posting dates.'),
        p.warning && h('p', { style: muted }, root.RorModel.formatDateText(p.warning)))));
  }

  function NativeAnalytics({ report, marketingStatus }) {
    return h('div', null,
      h('section', { className: 'card', style: card },
        h('h2', { style: { fontSize: 18, marginTop: 0 } }, 'Native source definitions'),
        h('p', null, 'Shopify-reported AOV is an independently captured source measure for the exact interval, before post-order adjustments. It is distinct from management sales per order. Daily or monthly AOVs are never averaged to fill a missing interval.'),
        h(Table, { label: 'Native source measures', headers: ['Store', 'Source order count', 'Shopify-reported AOV', 'Availability'], rows: report.parts.map(p => [p.label, number(p.orders), pounds(p.nativeAov),
          p.channel === 'shopify' ? p.nativeStatus === 'captured' ? 'Exact native interval captured' : 'Native AOV unavailable for this exact interval' : 'Native AOV capture unavailable; source orders retain their own definition']) })),
      report.parts.map(p => h('section', { key: p.channel, className: 'card', style: card },
        h('h2', { style: { fontSize: 18, marginTop: 0 } }, p.label + ' · Native sales measures'),
        h(Table, { label: p.label + ' native sales measures', headers: ['Measure', 'Value'], rows: p.components.filter(c => !['management', 'residual'].includes(c.key)).map(c => [h('span', { title: c.definition }, c.label), money(c.value)]) }),
        !p.available && h('p', { role: 'status' }, 'Native source coverage unavailable for this period.'))),
      h('section', { className: 'card', style: card },
        h('h2', { style: { fontSize: 18, marginTop: 0 } }, 'Shopify sessions and customer rates'),
        report.marketing?.status === 'matched' ? h(Table, { label: 'Exact-period Shopify marketing metrics', headers: ['Measure', 'Value'], rows: [
          ['Sessions', number(report.marketing.sessions)], ['Online store conversion rate', percent(report.marketing.conversionRate)], ['Returning customer rate', percent(report.marketing.repeatRate)],
        ] }) : h('p', { role: 'status' }, marketingStatus === 'loading' ? 'Loading the separate Shopify capture…' : 'Unavailable for this exact period and store selection. Choose a captured full Shopify month or performance window. Monthly sessions are never prorated.'),
        h('p', { style: muted }, 'Email, advertising, customer acquisition and cost estimates remain in their original Commercial tabs, with their original reporting windows.')));
  }

  function Comparison({ report }) {
    return h('section', { className: 'card', style: card },
      h('h2', { style: { fontSize: 18, marginTop: 0 } }, 'Different definitions, same selected period'),
      report.parts.map(p => h('div', { key: p.channel, style: { marginBottom: 24 } },
        h('h3', { style: { fontSize: 16 } }, p.label),
        h(Table, { label: p.label + ' metric comparison', headers: ['Measure', 'Per order', 'Definition'], rows: [
          ['Management Net Sales per order', pounds(p.identity.perOrder), 'Management Net Sales ÷ ' + p.countLabel.toLowerCase()],
          ['Shopify-reported AOV', pounds(p.nativeAov), p.channel === 'shopify' ? 'Independent native exact-period metric, before post-order adjustments' : 'Unavailable — no captured native AOV'],
          ['Net merchandise sales per order', pounds(p.merchandisePerOrder), p.channel === 'noths' ? 'Unavailable — refund-adjusted native merchandise measure not verified' : 'Source net merchandise ÷ matching source orders; excludes shipping'],
          ['Native total sales per order', pounds(p.totalPerOrder), 'Source total ÷ matching source orders; channel definitions differ'],
          ['Shopify gross sales per order', pounds(p.grossPerOrder), 'Original gross merchandise + independently validated original shipping, divided by eligible orders'],
        ] }))),
      h('p', { style: muted }, 'These definitions cannot be substituted for one another. Native AOV × orders is not a refund ledger. Existing £48 targets, goal comparisons and What-If formulae remain in Commercial with their existing definitions.'));
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
        h('span', { style: muted }, 'These filters are shared by Financial, Native Analytics and Metric Comparison. Commercial keeps its independent filters.')),
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
            report.parts.map(p => h('p', { key: p.channel, style: { overflowWrap: 'anywhere' } }, p.label + ': through ' + date(p.through) + ' · ' + p.confidence + ' · ' + (p.sourceId || 'Source unavailable'))),
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
