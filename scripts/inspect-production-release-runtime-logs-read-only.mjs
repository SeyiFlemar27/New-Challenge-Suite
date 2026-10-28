import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const id='dpl_9NY3gfa9Zq2omWAYbbvogemU8h4r',team='team_Aof3F7rzekkBNGBsPb6p9XmO',project='prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX';
const checks=[];
for(const [label,filter]of [['errors',['--level','error']],['http5xx',['--status-code','5xx']]]){
const r=spawnSync(process.execPath,['C:/Users/seyia/AppData/Roaming/npm/node_modules/vercel/dist/vc.js','logs','--deployment',id,'--project',project,'--scope',team,'--environment','production','--no-branch','--since','2026-10-20T17:53:00Z','--limit','100','--json',...filter],{encoding:'utf8',timeout:90000,maxBuffer:8e6});
if(r.status!==0){checks.push({label,verified:false,reason:'LOG_QUERY_FAILED'});continue;}
const rows=[];let parseFailures=0;for(const line of r.stdout.split('\n').filter(s=>s.trim())){try{rows.push(JSON.parse(line));}catch{parseFailures++;}}
checks.push({label,verified:parseFailures===0,returnedRows:rows.length,sampleLimit:100,possiblyTruncated:rows.length>=100,messagesAndRequestIdentifiersOmitted:true,parseFailures});
}
const report={readOnly:true,productionMutations:0,deployment:id,checkedAt:new Date().toISOString(),checks,scope:'Deployment-scoped bounded log window; does not prove absence of all provider side effects or future errors.'};fs.writeFileSync('docs/automatic-publishing-production-runtime-log-review-2026-10-20.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(checks.some(c=>!c.verified))process.exitCode=1;
