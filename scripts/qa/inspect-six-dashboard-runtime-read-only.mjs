import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const id=process.argv[2],since=process.argv[3];
if(!/^dpl_[A-Za-z0-9]+$/.test(id||'')||!Number.isFinite(Date.parse(since||'')))throw Error('Deployment ID and ISO start time required');
const checks=[];
for(const [label,filter]of [['errors',['--level','error']],['http5xx',['--status-code','5xx']]]){
  const r=spawnSync(process.execPath,['C:/Users/seyia/AppData/Roaming/npm/node_modules/vercel/dist/vc.js','logs','--deployment',id,'--project','prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX','--scope','team_Aof3F7rzekkBNGBsPb6p9XmO','--environment','production','--no-branch','--since',since,'--limit','100','--json',...filter],{encoding:'utf8',timeout:90000,maxBuffer:8e6});
  if(r.status!==0){checks.push({label,verified:false,reason:'LOG_QUERY_FAILED'});continue;}
  const rows=[];let parseFailures=0;for(const line of r.stdout.split('\n').filter(s=>s.trim())){try{rows.push(JSON.parse(line));}catch{parseFailures++;}}
  const knownShellWarnings=rows.filter(row=>/DEP0190|shell option true|shell:true/.test(JSON.stringify(row))).length;
  checks.push({label,verified:parseFailures===0,rows:rows.length,knownShellWarnings,otherRows:rows.length-knownShellWarnings,possiblyTruncated:rows.length>=100,parseFailures,rawMessagesAndIdentifiersOmitted:true});
}
const report={checkedAt:new Date().toISOString(),deploymentId:id,since,readOnly:true,productionMutations:0,checks,limitations:'Bounded deployment log sample; cannot prove absence of all unrelated concurrent data writes, provider operations or future errors.'};
fs.writeFileSync('docs/six-dashboard-runtime-logs-2026-10-21.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(checks.some(c=>!c.verified||c.otherRows||c.possiblyTruncated))process.exitCode=1;
