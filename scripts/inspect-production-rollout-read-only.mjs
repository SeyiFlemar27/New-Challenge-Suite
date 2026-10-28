import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolveCname,resolve4} from 'node:dns/promises';
const id='dpl_9NY3gfa9Zq2omWAYbbvogemU8h4r',sha='3203f4a42877d70b0b58aaa4ec4243897c5f66e4',project='prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX',team='team_Aof3F7rzekkBNGBsPb6p9XmO';
function get(path){const r=spawnSync(process.execPath,['C:/Users/seyia/AppData/Roaming/npm/node_modules/vercel/dist/vc.js','api',path,'--scope',team,'--method','GET'],{encoding:'utf8',timeout:90000,maxBuffer:8e6});if(r.status!==0)throw Error('VERCEL_READ_FAILED');return JSON.parse(r.stdout);}
const d=get('/v13/deployments/'+id),a=get('/v4/aliases/www.challengesuite.com');
const source=d.gitSource?.sha||d.meta?.githubCommitSha,branch=d.meta?.githubCommitRef||d.gitSource?.ref;
const aliasDeployment=a.deployment?.id||a.deploymentId;
const dns={};try{dns.cname=await resolveCname('www.challengesuite.com');}catch{dns.cnameUnavailable=true;}try{dns.ipv4Count=(await resolve4('www.challengesuite.com')).length;}catch{dns.ipv4Unavailable=true;}
if(dns.ipv4Unavailable){try{const r=await fetch('https://dns.google/resolve?name=www.challengesuite.com&type=A',{signal:AbortSignal.timeout(15000)});const b=await r.json();dns.httpsResolver={httpStatus:r.status,dnsStatus:b.Status,answerCount:b.Answer?.length||0,ipv4AnswerCount:(b.Answer||[]).filter(a=>a.type===1).length};}catch{dns.httpsResolverUnavailable=true;}}
const report={checkedAt:new Date().toISOString(),readOnly:true,id:d.id,url:d.url,state:d.readyState,target:d.target,projectId:d.projectId,sha:source,branch,aliases:d.alias,alias:{hostname:'www.challengesuite.com',deploymentId:aliasDeployment},dns,exactSourceMatches:source===sha&&branch==='main'&&d.projectId===project&&d.target==='production',domainMatches:aliasDeployment===id,productionMutations:0};
fs.writeFileSync('docs/automatic-publishing-production-deployment-verification-2026-10-20.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(['ERROR','CANCELED'].includes(d.readyState)||!report.exactSourceMatches)process.exitCode=1;
