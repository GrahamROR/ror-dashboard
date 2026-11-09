'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const B=require('../historical-backfill'),A=require('../api-normalize');
const repo=path.resolve(__dirname,'../../..'),read=file=>fs.readFileSync(path.join(repo,file)),json=file=>JSON.parse(read(file)),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const keys=(object,allowed)=>assert.deepEqual(Object.keys(object).sort(),[...allowed].sort());
test('Public history is a hash-consistent aggregate bundle with matching independent count evidence',()=>{
 const registry=json('finance/historical/manifest.json');keys(registry,['schema','marketplaces','shopify','coverage']);assert.equal(registry.schema,'ror-historical-bundle-v1');
 for(const entry of [registry.marketplaces,registry.shopify,registry.coverage]){assert.equal(sha(read(entry.file)),entry.sha256);}
 const archive=json(registry.marketplaces.file),proof=json(registry.coverage.file);
 keys(archive,['schema','historical','validated','confidence','currency','timezone','calculation_version','backfill_version','source_mapping_policy','discovery','channels']);
 const live=B.liveBoundaries(repo);B.validate(archive,live);assert.equal(archive.validated,false);assert.equal(proof.status,'coverage-verified');assert.equal(proof.archive_sha256,registry.marketplaces.sha256);
 for(const c of ['etsy','noths']){
  const channel=archive.channels[c];assert.equal(proof.channels[c].historical_source_orders,channel.audit.source_orders);assert.equal(proof.channels[c].status,'matched');assert.ok(channel.coverage.end<live[c]);
  keys(channel,['daily','months','coverage','live_start_at_capture','confidence','validation','source_sha256','audit','identity_check','chunks']);
  keys(archive.discovery[c],['earliest_day','total_source_orders','probed_at']);
  for(const row of channel.daily){keys(row,['date','completeness',...A.FIELDS[c]]);assert.equal(row.completeness,B.CONFIDENCE);}
  for(const row of channel.months)keys(row,['month','start','end','validation',...A.FIELDS[c]]);
 }
 assert.doesNotMatch(JSON.stringify(archive),/buyer_email|receipt_id|access_token|sourceFile|\.xlsx|"id"|"items"/);
});
test('Published Shopify legacy file is monthly only, source labelled, with exactly period/revenue/orders per aggregate',()=>{
 const legacy=json('finance/historical/shopify-legacy.json');keys(legacy,['schema','source','confidence','basis','grain','currency','live_start_at_capture','coverage','months']);
 assert.equal(legacy.grain,'monthly');assert.equal(legacy.source,'spreadsheet-import');assert.equal(legacy.confidence,'self-reported');assert.equal(legacy.basis,'workbook-recorded-revenue');
 const manifest=json('finance/staging/manifest.json'),boundary=json('finance/staging/'+manifest.file).coverage.start;
 for(const row of legacy.months){keys(row,['period','revenue','orders']);assert.ok(require('../../historical/reporting').monthEnd(row.period)<boundary);}
 assert.equal(cp.execFileSync('git',['-C',repo,'ls-files','--','local-data','finance/local-data'],{encoding:'utf8'}).trim(),'');
 assert.equal(fs.existsSync(path.join(repo,'finance/historical/control-report.json')),false); // Detailed workbook comparisons stay private.
});
