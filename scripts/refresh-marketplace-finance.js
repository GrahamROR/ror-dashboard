'use strict';
const A=require('../finance/marketplaces/automatic-refresh');
async function main() {
  const verify=process.argv.includes('--verify');
  if(!verify&&(process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_REF_NAME!=='main'||process.env.MARKETPLACE_FINANCE_ENABLED!=='true'))throw Error('Automatic marketplace publication requires enabled main workflow context');
  let outcome='success',result;
  try {result=await A.refresh({verifyOnly:verify});}
  catch {outcome='failure';if(verify)throw Error('Marketplace source/validation check failed; no published files changed');}
  if(verify){console.log(JSON.stringify({status:'verified',verification:result.verification,historical_controls:result.controls}));return;}
  const P=require('../finance/publication'),MP=require('../finance/marketplaces/publication'),repo=process.cwd();
  const prepared=MP.prepare({repo,outcome}),publication=P.publish({repo,branch:'main',prepared});
  console.log(JSON.stringify({publication}));
  const pages=await require('../finance/pages-publication').requestBuild({repo,repository:process.env.GITHUB_REPOSITORY,token:process.env.GH_TOKEN,revision:publication.revision});
  console.log(JSON.stringify({pages}));
  const cp=require('node:child_process'),manifest=JSON.parse(prepared.pending.get(MP.ROOT+'/manifest.json')||cp.execFileSync('git',['show',publication.revision+':'+MP.ROOT+'/manifest.json'],{encoding:'utf8'})),status=JSON.parse(prepared.pending.get(MP.ROOT+'/refresh-status.json'));
  const site=await fetch('https://api.github.com/repos/'+process.env.GITHUB_REPOSITORY+'/pages',{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});
  if(!site.ok)throw Error('Published marketplace site metadata unavailable');
  const bundle=await MP.verifyServed({baseUrl:(await site.json()).html_url,manifest,status});
  console.log(JSON.stringify({marketplaces:bundle}));
  if(publication.failed)process.exitCode=1;
}
main().catch(()=>{console.error('Marketplace refresh or publication failed; last-good figures retained. Inspect workflow status; credentials and source records are never logged.');process.exitCode=1;});
