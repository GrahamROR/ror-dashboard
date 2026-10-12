'use strict';
const test = require('node:test'),assert = require('node:assert/strict'),L=require('../noths-statements');
function text(lines) {return 'date,description,amount,balance\n07-09-2026,Initial Balance,,0.005\n'+lines.join('\n')+'\n';}
test('NOTHS customer refunds remain distinct from fees and credits; no payout-based net calculation',()=>{
 const r=L.inspect(text(['11-09-2026 15:08:24,Refund to shopper for Partner Order 1,-28.00,-28.00','11-09-2026 15:08:24,Admin fee (3.0%) for refund for Partner Order 1,-0.84,-28.84','11-09-2026 15:08:24,Partial reimbursement of commission for Partner Order 1,11.25,-17.59']));
 assert.equal(r.categories.customer_refund.amount_pence,-2800);assert.equal(r.categories.refund_admin_fee.amount_pence,-84);assert.equal(r.categories.commission_credit.amount_pence,1125);assert.equal(r.status,'investigation-only');assert.equal(r.net_sales,undefined);assert.equal(r.events[0].order_id,'1');assert.equal(r.events[0].day,'2026-09-11');assert.equal(r.timezone_in_source,false);
});
test('Platform VAT and funded discounts are distinct from customer refunds and bank transfers',()=>{
 for(const [s,type]of [['Reimbursement for VAT paid by Notonthehighstreet as deemed supplier for VAT purposes for Partner Order 2','platform_vat_deduction'],['Discount funded by NOTHS for Partner Order 2','platform_funded_discount'],['Scheduled transfer to bank account for Invoice 2','bank_transfer']])assert.equal(L.classify(s),type);
});
test('Statement source precision/residuals and repeated rows are preserved rather than silently corrected',()=>{
 const line='08-09-2026 09:00:00,Shopper payment for Partner Order 1,1.00,1.00'; const r=L.inspect(text([line,line]));assert.equal(r.balances.opening_ten_thousandths,50);assert.equal(r.balances.residual_ten_thousandths,-10050);assert.equal(r.possible_repeated_rows,1);assert.equal(r.categories.shopper_payment.amount_pence,200);
});
test('Unknown adjustments stay unknown and missing/malformed source fields fail',()=>{
 assert.equal(L.classify('Unexpected adjustment'),'unknown');assert.equal(L.inspect(text(['08-09-2026,Unexpected adjustment,1.00,1.00'])).categories.unknown.rows,1);
 assert.throws(()=>L.inspect(text(['08-09-2026,Shopper payment for Partner Order 1,,1.00'])),/Missing/);assert.throws(()=>L.inspect(text(['31-09-2026,Shopper payment for Partner Order 1,1.00,1.00'])),/date/i);
});

test('Four-decimal source opening balances are preserved exactly',()=>{const r=L.inspect(text(['08-09-2026,Shopper payment for Partner Order 1,1.00,1.00']).replace('0.005','0.0075'));assert.equal(r.balances.opening_ten_thousandths,75);assert.equal(r.balances.residual_ten_thousandths,-75);});
