// Read-only statement diagnostics. Settlement movements are not verified sales.
'use strict';
const E = require('./etsy'), F = require('../contract');
const TYPES = [
  ['shopper_payment', /^Shopper payment for Partner Order \d+$/],
  ['commission_fee', /^Commission fee for Partner Order \d+$/],
  ['platform_funded_discount', /^Discount funded by NOTHS for Partner Order \d+$/],
  ['customer_refund', /^Refund to shopper for Partner Order \d+$/],
  ['refund_admin_fee', /^Admin fee \([\d.]+%\) for refund for Partner Order \d+$/],
  ['commission_credit', /^(Reimbursement of commission fee|Partial reimbursement of commission) for Partner Order \d+$/],
  ['platform_vat_deduction', /^Reimbursement for VAT paid by Notonthehighstreet as deemed supplier for VAT purposes for Partner Order \d+$/],
  ['bank_transfer', /^Scheduled transfer to bank account for Invoice \d+$/],
];
function classify(description) {
  return TYPES.find(([,pattern]) => pattern.test(description))?.[0] || 'unknown';
}
function preciseBalance(value) {
  if (!/^-?\d+(\.\d{1,4})?$/.test(value)) throw Error('Missing/invalid statement balance');
  const [whole,part=''] = value.replace('-','').split('.');
  const result = Number(whole)*10000 + Number(part.padEnd(4,'0'));
  if (!Number.isSafeInteger(result)) throw Error('Unsafe statement balance');
  return value.startsWith('-') ? -result : result;
}
function inspect(text) {
  const rows = E.csv(text), categories = {}, events = [], possibleRepeatedRows = new Set(), seen = new Set();
  let opening = null, running = 0, lastBalance = null;
  for (const r of rows) {
    const dateMatch = /^(\d{2})-(\d{2})-(\d{4})(?: (\d{2}:\d{2}:\d{2}))?$/.exec(r.date || '');
    if (!dateMatch) throw Error('Invalid statement date');
    const day = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`; F.day(day);
    if(dateMatch[4] && !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(dateMatch[4])) throw Error('Invalid statement time');
    const balance = preciseBalance(r.balance); lastBalance = balance;
    if (r.description === 'Initial Balance') {
      if (opening !== null || events.length) throw Error('Duplicate/misplaced opening balance');
      opening = balance; running = opening; continue;
    }
    if (opening === null) throw Error('Missing opening balance');
    const amount = F.minor(r.amount);
    if (amount === null) throw Error('Missing statement transaction amount');
    const type = classify(r.description), category = categories[type] ||= {rows:0, amount_pence:0};
    category.rows++; category.amount_pence += amount; running += amount*100;
    const signature = JSON.stringify([r.date,r.description,r.amount,r.balance]);
    if (seen.has(signature)) possibleRepeatedRows.add(signature); seen.add(signature);
    events.push({type,day,source_timestamp:r.date,order_id:/Partner Order (\d+)/.exec(r.description)?.[1] || null,amount_pence:amount});
  }
  if (opening === null) throw Error('Missing opening balance');
  return {source_sha256:E.hash(text),status:'investigation-only',currency_in_source:false,timezone_in_source:false,source_rows:rows.length,categories,events,
    possible_repeated_rows:possibleRepeatedRows.size,
    balances:{opening_ten_thousandths:opening,closing_ten_thousandths:lastBalance,sum_of_exported_amounts_ten_thousandths:running,residual_ten_thousandths:lastBalance-running},
    definition:'Customer refunds, commissions, fee credits, platform VAT, funding and transfers remain separate. No settlement-derived net-sales metric or automatic promotion.'};
}
module.exports = {classify, inspect};
