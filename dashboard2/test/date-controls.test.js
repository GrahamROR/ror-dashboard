// Dependency-free render contract for the actual three React date controls.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const M = require('../data-model.js'), C = require('../calculations.js');
const data = require('../sales-data.json');
const context = vm.createContext({
  window: {}, ShopifyIntegration:require('../../finance/integration'), ShopifyFinance:require('../../finance/contract'), RorModel:M, RorCalc:C, React:{ Fragment:'fragment' }, RorCharts:{SalesChart:'chart'},
  RorDataAdapter:{}, useEffect:()=>{}, useMemo:fn=>fn(),
  el:(type,props,...children)=>({type,props:props || {},children}),
  fmt:String, fmtC:String, fmtP:String,
});
const presets = C.REPORT_DATE_PRESETS.map(p=>p.key);
vm.runInContext(fs.readFileSync(require.resolve('../ror-sales-app.js'),'utf8'),context);
let selected = 'previousFY';
function render(node) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(render);
  if (typeof node.type === 'function') {
    let hook=0;
    const name=node.type.name;
    context.useState = initial => {
      const n=hook++;
      if (name === 'RorSalesApp') return [[false,'',data.meta,data.records,'all',selected,{start:'2024-02-01',end:'2024-02-29'},'mom'][n],()=>{}];
      return [initial === 'last12Months' ? selected : initial && typeof initial === 'object' && 'start' in initial ? {start:'2024-02-01',end:'2024-02-29'} : initial,()=>{}];
    };
    return render(node.type({...node.props,children:node.children}));
  }
  return {...node,children:node.children.map(render)};
}
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(n=>find(n,predicate));
  return [...(predicate(tree)?[tree]:[]),...find(tree.children,predicate)];
}
for (const key of presets) {
  selected=key;
  const tree=render({type:context.window.RorSalesApp,props:{},children:[]});
  const controls=find(tree,n=>n.type === 'select' && /date range$/.test(n.props['aria-label']));
  assert.equal(controls.length,3);
  for (const control of controls) {
    assert.equal(control.props.value,key);
    const options=find(control,n=>n.type === 'option');
    assert.deepEqual(options.map(n=>n.props.value),presets);
    assert.deepEqual(options.map(n=>n.children[0]),C.REPORT_DATE_PRESETS.map(p=>p.label));
  }
  const inputs=find(tree,n=>n.type === 'input' && n.props.type === 'date');
  assert.equal(inputs.length,key === 'custom' ? 6 : 0);
  if (key === 'custom') {
    assert.equal(new Set(inputs.map(n=>n.props['aria-label'])).size,6);
    assert.ok(inputs.every(n=>typeof n.props.onChange === 'function'));
    const periods=find(tree,n=>n.props['data-report-period']);
    assert.equal(periods.length,4);
    assert.ok(periods.every(n=>JSON.stringify(n).includes('2024-02-01 → 2024-02-29')));
  }
}
console.log('11 presets × 3 rendered selectors passed; all 6 custom inputs and 4 period labels verified');
