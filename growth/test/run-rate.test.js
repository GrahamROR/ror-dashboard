'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),R=require('../run-rate'),T=require('../targets');
test('FY capture average uses its own London date and shares target-plan elapsed days',()=>{
 const p=R.sessions({fy:'FY27',value:10200,updated:'2026-11-10T09:00:00Z'});assert.equal(p.elapsedDays,102);assert.equal(p.perDay,100);assert.equal(p.through,'2026-11-10');assert.equal(p.partial,true);
 const aligned=R.sessions({fy:'FY27',value:10100,updated:'2026-11-10T09:00:00Z',coverage:{status:'complete',timezone:'Europe/London',start:'2026-08-01',end:'2026-11-09'}});assert.equal(aligned.elapsedDays,101);assert.equal(aligned.perDay,100);assert.equal(aligned.partial,false);
 const days=T.plan(1,'FY27','2026-11-10').months.reduce((n,m)=>n+m.elapsedDays,0);assert.equal(p.elapsedDays,days);
});
test('Zero/missing, first-FY-day and absent marketing month never produce Infinity or an invented average',()=>{
 for(const input of [{value:null},{value:NaN},{value:10,updated:null},{value:10,updated:'broken'},{value:10,updated:'2026-07-31T12:00:00Z'}])assert.equal(R.sessions({fy:'FY27',updated:'2026-11-10T09:00:00Z',...input}).perDay,null);
 assert.equal(R.sessions({fy:'FY27',value:0,updated:'2026-08-01T12:00:00Z'}).perDay,0);
 assert.equal(R.sessions({fy:'FY27',value:100,updated:'2026-11-10T09:00:00Z',months:[{key:'2026-08',sessions:100}]}).perDay,null);
});
test('London midnight, leap year and closed years retain the appropriate calendar-day denominator',()=>{
 assert.equal(R.sessions({fy:'FY27',value:31,updated:'2026-08-31T23:30:00Z'}).elapsedDays,32);
 const old=R.sessions({fy:'FY24',value:366,updated:'2026-11-10T09:00:00Z'});assert.equal(old.elapsedDays,366);assert.equal(old.perDay,1);assert.equal(old.partial,false);
});
test('MTD pace shows actual average, projection and remaining daily requirement on the SAME verified period',()=>{
 const p=R.month({actual:900,target:3000,elapsedDays:9,days:30,complete:true});assert.equal(p.actualPerDay,100);assert.equal(p.projection,3000);assert.equal(p.remainingDays,21);assert.equal(p.neededPerDay,100);
 assert.equal(R.month({actual:4000,target:3000,elapsedDays:9,days:30,complete:true}).neededPerDay,0);
});
test('Both financial table rates withhold missing or zero-elapsed amounts; completed months need no remaining pace',()=>{
 for(const data of [{actual:null},{elapsedDays:0},{complete:false},{days:0},{elapsedDays:31}]){const p=R.month({actual:900,target:3000,elapsedDays:9,days:30,complete:true,...data});assert.equal(p.actualPerDay,null);assert.equal(p.neededPerDay,null);assert.equal(p.projection,null);}
 const zero=R.month({actual:0,target:3000,elapsedDays:9,days:30,complete:true});assert.equal(zero.actualPerDay,0);assert.ok(Number.isFinite(zero.neededPerDay));assert.equal(R.month({actual:3000,target:3000,elapsedDays:30,days:30,complete:true}).neededPerDay,null);
});
