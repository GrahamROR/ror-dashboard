// Component/handler contracts; actual React error recovery and DOM retention also
// require the separate real-browser acceptance check. No React renderer is emulated here.
'use strict';
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const repo = path.join(__dirname, '../..');

function harness({ bundle = true } = {}) {
  let owner = '', cursor = 0;
  const slots = new Map();
  const state = init => {
    const key = owner + ':' + cursor++;
    if (!slots.has(key)) slots.set(key, typeof init === 'function' ? init() : init);
    return [slots.get(key), next => slots.set(key, typeof next === 'function' ? next(slots.get(key)) : next)];
  };
  const h = (type, props, ...children) => ({ type, props: props || {}, children });
  const react = { Fragment: 'fragment', createElement: h, useState: state,
    useRef: init => state(() => ({ current: init }))[0], useEffect: () => {}, useMemo: fn => fn() };
  const ctx = vm.createContext({ console, Date, Intl, Map, Set, React: react, el: h,
    useState: state, useEffect: react.useEffect, useMemo: react.useMemo,
    RorModel: require('../../dashboard2/data-model'), RorCalc: require('../../dashboard2/calculations'),
    ManagementFinance: require('../../finance/management'), RorReportingMetrics: require('../metrics'),
    App: function App() {}, RorSalesApp: function RorSalesApp() {}, RorTopNavSwitcher: function RorTopNavSwitcher() {} });
  ctx.window = ctx;
  if (bundle) vm.runInContext(fs.readFileSync(path.join(repo, 'reporting/app.js'), 'utf8'), ctx);
  const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
  const rootScript = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).find(script => script.includes('function RootApp()'));
  vm.runInContext(rootScript.split('ReactDOM.createRoot')[0], ctx);
  function render(component, props = {}) {
    owner = component.name; cursor = 0;
    return component(props);
  }
  return { ctx, render, root: () => render(ctx.RootApp) };
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...(tree.children || []).flatMap(nodes)];
}
const find = (tree, predicate) => nodes(tree).find(predicate);
const tab = (tree, label) => find(tree, n => n.props.role === 'tab' && n.children.includes(label));
const field = (tree, label) => find(tree, n => n.props['aria-label'] === label);

test('Commercial is the default, has one stable child slot and does not mount new reports', () => {
  const h = harness(), child = { type: 'original-dashboard', props: {}, children: [] };
  const tree = h.render(h.ctx.RorReportingWorkspace, { dashboard: 'shopify', children: child });
  a.equal(tab(tree, 'Commercial').props['aria-selected'], true);
  const slot = find(tree, n => n.props['data-commercial-slot']);
  a.equal(slot.props.hidden, false);
  a.equal(slot.props.style, undefined);
  a.equal(slot.children[0], child);
  a.equal(nodes(tree).some(n => typeof n.type === 'function' && n.type.name === 'Reports'), false);
});

test('Reporting navigation hides the original child without replacing it and switches back', () => {
  const h = harness(), child = { type: 'original-dashboard', props: {}, children: [] };
  const props = { dashboard: 'shopify', children: child };
  let tree = h.render(h.ctx.RorReportingWorkspace, props);
  for (const name of ['Financial', 'Native Analytics', 'Metric Comparison']) {
    tab(tree, name).props.onClick(); tree = h.render(h.ctx.RorReportingWorkspace, props);
    a.equal(tab(tree, name).props['aria-selected'], true);
    const slot = find(tree, n => n.props['data-commercial-slot']);
    a.equal(slot.children[0], child); a.equal(slot.props.hidden, true);
    a.equal(slot.props.style.display, 'none');
    a.equal(find(tree, n => n.props.id === 'report-additional').props.hidden, false);
  }
  tab(tree, 'Commercial').props.onClick(); tree = h.render(h.ctx.RorReportingWorkspace, props);
  a.equal(find(tree, n => n.props['data-commercial-slot']).children[0], child);
  a.equal(find(tree, n => n.props['data-commercial-slot']).props.hidden, false);
  a.equal(tab(tree, 'Commercial').props.tabIndex, 0);
});

test('A missing reporting bundle renders the original dashboard and both original entry points', () => {
  const h = harness({ bundle: false });
  let tree = h.root();
  a.ok(find(tree, n => n.type === h.ctx.App));
  a.match(JSON.stringify(tree), /Commercial remains available/);
  find(tree, n => n.type === h.ctx.RorTopNavSwitcher).props.onChange('ror-sales');
  tree = h.root();
  a.ok(find(tree, n => n.type === h.ctx.RorSalesApp));
  a.equal(nodes(tree).filter(n => n.type === h.ctx.App).length, 0);
});

test('The original dashboard element is passed through without rewritten financial props', () => {
  const h = harness();
  const tree = h.root();
  const wrapper = find(tree, n => n.type === h.ctx.RorReportingWorkspace);
  a.equal(wrapper.props.dashboard, 'shopify');
  a.equal(wrapper.children[0].type, h.ctx.App);
  a.equal(wrapper.children[0].props.financialBasis, 'net_revenue');
  a.equal(typeof wrapper.children[0].props.setFinancialBasis, 'function');
});

test('New-report contexts stay independent per dashboard and never use legacy filters', () => {
  const h = harness();
  let workspace = h.render(h.ctx.RorReportingWorkspace, { dashboard: 'shopify' });
  tab(workspace, 'Financial').props.onClick();
  workspace = h.render(h.ctx.RorReportingWorkspace, { dashboard: 'shopify' });
  const component = find(workspace, n => typeof n.type === 'function' && n.type.name === 'Reports').type;
  const props = { dashboard: 'shopify', view: 'financial', shop: null, markets: null };
  let tree = h.render(component, props);
  a.equal(field(tree, 'Report store').props.value, 'shopify');
  a.equal(field(tree, 'Report store').props.disabled, true);
  field(tree, 'Report date range').props.onChange({ target: { value: 'custom' } });
  tree = h.render(component, props);
  field(tree, 'Report start date').props.onChange({ target: { value: '2026-10-01' } });
  tree = h.render(component, props);
  field(tree, 'Report end date').props.onChange({ target: { value: '2026-10-31' } });
  tree = h.render(component, { ...props, dashboard: 'ror-sales' });
  a.equal(field(tree, 'Report store').props.value, 'all');
  a.equal(field(tree, 'Report date range').props.value, 'previousFY');
  field(tree, 'Report store').props.onChange({ target: { value: 'etsy' } });
  tree = h.render(component, { ...props, view: 'native' });
  a.equal(field(tree, 'Report start date').props.value, '2026-10-01');
  a.equal(field(tree, 'Report end date').props.value, '2026-10-31');
  tree = h.render(component, { ...props, dashboard: 'ror-sales', view: 'comparison' });
  a.equal(field(tree, 'Report store').props.value, 'etsy');
  a.equal(field(tree, 'Report date range').props.value, 'previousFY');
});
