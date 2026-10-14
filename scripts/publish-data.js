// Existing export writers share a fast-forward, owned-path guarded publisher.
'use strict';
const P=require('../finance/publication');
const args=process.argv.slice(2),value=k=>args.includes(k)?args[args.indexOf(k)+1]:null;
const branch=process.env.GITHUB_REF_NAME,financeOutcome=value('--finance-outcome')||'skipped',rollbackId=value('--rollback');
if(!branch||process.env.GITHUB_REF!==`refs/heads/${branch}`)throw Error('Branch workflow context required');
if(financeOutcome!=='skipped'||rollbackId){
 if(branch!=='main')throw Error('Finance production publication requires main');
 if(rollbackId){if(process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.FINANCE_ROLLBACK_APPROVED!=='true'||process.env.FINANCE_PUBLICATION_ENABLED==='true')throw Error('Explicit manual rollback approval and paused finance refresh required');}
 else if(process.env.FINANCE_PUBLICATION_ENABLED!=='true')throw Error('Finance publication remains disabled until owner activation');
}
if((value('--files')||'').split(',').includes('ltv-cac.json')){const D=require('../finance/dependencies'),fs=require('fs');D.guard(JSON.parse(fs.readFileSync('ltv-cac.json')),D.load(process.cwd()));}
const prepared=P.prepare({repo:process.cwd(),files:(value('--files')||'').split(',').filter(Boolean),financeOutcome,rollbackId});
async function finish(){const result=P.publish({repo:process.cwd(),branch,prepared});console.log(JSON.stringify(result));if(branch==='main'&&process.env.GITHUB_ACTIONS==='true'){const pages=await require('../finance/pages-publication').requestBuild({repo:process.cwd(),repository:process.env.GITHUB_REPOSITORY,token:process.env.GH_TOKEN,revision:result.revision});console.log(JSON.stringify({pages}));}if(result.failed)process.exitCode=1;}finish().catch(e=>{console.error(e.message);process.exitCode=1;});
