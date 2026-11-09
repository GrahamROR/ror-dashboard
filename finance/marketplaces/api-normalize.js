'use strict';
// Derive the existing marketplace source components from complete native captures.
// The management VAT/rounding rules remain in finance/management.js.
const crypto = require('node:crypto');
const F = require('../contract');
const C = require('./collect');
const VERSION = 'marketplace-native-components-v1';
const FIELDS = {
  etsy: ['gross_sales', 'discounts', 'net_sales', 'total_sales', 'shipping', 'tax', 'orders'],
  noths: ['gross_sales', 'shipping', 'customer_total', 'source_discounts', 'orders'],
};
function midnight(date) {
  F.day(date);
  const utc = Date.parse(date + 'T00:00:00Z');
  const hour = Number(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/London', hour:'2-digit', hourCycle:'h23'}).format(new Date(utc)));
  return new Date(utc - hour * 3600000).toISOString();
}
function money(v, channel) {
  if (channel === 'etsy') {
    if (v?.currency_code !== 'GBP' || v.divisor !== 100 || !Number.isSafeInteger(v.amount)) throw Error('Unsupported/missing Etsy source money');
    return v.amount;
  }
  if (v?.currency?.iso_code !== 'GBP' || v.currency.subunit_to_unit !== 100 || !Number.isSafeInteger(v.cents)) throw Error('Unsupported/missing NOTHS source money');
  return v.cents;
}
function add(row, field, amount) {
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(row[field] + amount)) throw Error('Invalid source component sum');
  row[field] += amount;
}
function derive(capture, start, end) {
  F.day(start); F.day(end);
  const channel = capture.channel, fields = FIELDS[channel];
  if (!fields || start > end || Date.parse(capture.start) !== Date.parse(midnight(start)) || Date.parse(capture.end) !== Date.parse(midnight(F.next(end)))) throw Error('Complete London source scope required');
  if (!Array.isArray(capture.rows) || capture.count !== capture.rows.length || !Number.isFinite(Date.parse(capture.collected_at)) || !Number.isSafeInteger(capture.pages) || capture.pages < 1) throw Error('Complete native pagination evidence required');
  const days = new Map();
  for (let date=start;date<=end;date=F.next(date)) days.set(date,{date,...Object.fromEntries(fields.map(k=>[k,0])),completeness:'validated'});
  const seen = new Set(), audit = {source_orders:capture.rows.length,excluded_orders:0,partial_refunds:0};
  for (const source of capture.rows) {
    const id = String(channel === 'etsy' ? source.receipt_id : source.id);
    if (!/^\d+$/.test(id) || seen.has(id)) throw Error('Duplicate/missing native order');
    seen.add(id);
    const date = C.londonDay(channel === 'etsy' ? source.create_timestamp*1000 : source.placed_at), row = days.get(date);
    if (!row) throw Error('Native order outside source window');
    if (channel === 'etsy') {
      if (typeof source.is_paid !== 'boolean' || !Array.isArray(source.refunds)) throw Error('Missing Etsy eligibility evidence');
      const refund = source.refunds.reduce((sum,r)=>sum+money(r.amount,channel),0);
      if (!source.is_paid) { audit.excluded_orders++; continue; }
      if (['Canceled','Fully Refunded'].includes(source.status)) {
        if (refund < money(source.grandtotal,channel)) throw Error('Cancelled Etsy order lacks full refund evidence');
        audit.excluded_orders++; continue;
      }
      if (!['Paid','Completed','Partially Refunded'].includes(source.status)) throw Error('Unrecognized paid Etsy order eligibility');
      const gross=money(source.total_price,channel),discount=money(source.discount_amt,channel),shipping=money(source.total_shipping_cost,channel),tax=money(source.total_tax_cost,channel),total=money(source.grandtotal,channel);
      if (gross<0 || discount<0 || discount>gross || shipping<0 || tax<0 || total<0 || refund<0) throw Error('Invalid Etsy financial components');
      // Etsy Stats excludes discounts, not processing fees or a second partial-refund deduction.
      for (const [k,v] of Object.entries({gross_sales:gross,discounts:discount,net_sales:gross-discount,total_sales:total,shipping,tax,orders:1})) add(row,k,v);
      if (refund>0) audit.partial_refunds++;
    } else {
      const fields = {gross_sales:source.financials?.purchase_items?.gross,shipping:source.financials?.purchase_delivery?.gross,customer_total:source.order_total,source_discounts:source.financials?.purchase_discount?.gross};
      for (const [k,v] of Object.entries(fields)) add(row,k,money(v,channel));
      add(row,'orders',1);
      // Approved NOTHS measure is the placed-order cohort: do not invent refund posting dates.
    }
  }
  const daily=[...days.values()],months=[];
  for (const month of [...new Set(daily.map(r=>r.date.slice(0,7)))]) {
    const selected=daily.filter(r=>r.date.startsWith(month));
    months.push({month,...Object.fromEntries(fields.map(k=>[k,selected.reduce((s,r)=>s+r[k],0)])),start:selected[0].date,end:selected.at(-1).date,validation:VERSION});
  }
  return {daily,months,coverage:{start,end},captured_at:capture.collected_at,policy:channel==='etsy'?'etsy-sold-orders-stats-v1':'noths-placed-order-cohort-v1',tax_definition:channel==='etsy'?'Native receipt total_tax_cost; includes marketplace-remitted tax omitted by historical CSV Sales Tax. Not deducted from the agreed management formula.':undefined,refresh:'Automatic read-only native source; source components checked before publication',validation:VERSION,source_sha256:crypto.createHash('sha256').update(JSON.stringify(capture)).digest('hex'),audit};
}
function replay(candidate, reference) {
  const differences=[],source_field_differences=[];
  for (const channel of ['etsy','noths']) {
    const current=new Map(candidate.channels[channel].daily.map(r=>[r.date,r]));
    for (const old of reference.channels[channel].daily) {
      const next=current.get(old.date);
      for (const field of FIELDS[channel]) if (!next || next[field]!==old[field]) {
        const difference={channel,date:old.date,field,reference:old[field],candidate:next?.[field]??null};
        // CSV Sales Tax and native receipt total_tax_cost are different source fields.
        // Retain native tax verbatim; compare every field used by approved sales maths.
        (channel==='etsy'&&field==='tax'?source_field_differences:differences).push(difference);
      }
    }
  }
  return {status:differences.length?'different':'matched',compared_days:Object.fromEntries(['etsy','noths'].map(c=>[c,reference.channels[c].daily.length])),differences,source_field_differences};
}
function build(captures, ranges, previous) {
  const channels={};
  for (const channel of ['etsy','noths']) {
    const next=derive(captures[channel],ranges[channel].start,ranges[channel].end);
    // Retain previously accepted records/metadata byte-for-byte when source facts agree.
    const old=previous?.channels?.[channel],byDate=new Map((old?.daily||[]).map(r=>[r.date,r]));
    next.daily=next.daily.map(r=>{const prior=byDate.get(r.date);return prior&&FIELDS[channel].every(k=>prior[k]===r[k])?prior:r;});
    next.months=next.months.map(m=>{
      const prior=old?.months?.find(r=>r.month===m.month);
      return prior&&FIELDS[channel].every(k=>prior[k]===m[k])?prior:m;
    });
    channels[channel]=next;
  }
  return {schema:'marketplace-sales-v1',currency:'GBP',timezone:'Europe/London',calculation_version:VERSION,channels};
}
module.exports={VERSION,FIELDS,midnight,derive,build,replay};
