import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const project='prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX',team='team_Aof3F7rzekkBNGBsPb6p9XmO';
function get(endpoint){const r=spawnSync(process.execPath,['C:/Users/seyia/AppData/Roaming/npm/node_modules/vercel/dist/vc.js','api',endpoint,'--scope',team,'--method','GET'],{encoding:'utf8',timeout:90000,maxBuffer:8_000_000});if(r.status!==0)throw Error('VERCEL_READ_ONLY_FAILED');const d=JSON.parse(r.stdout);if(d.error)throw Error('VERCEL_READ_ONLY_REJECTED');return d;}
const p=get('/v9/projects/'+project);assert.equal(p.id,project);assert.equal(p.accountId,team);assert.equal(p.name,'challenge-suite');
const env=get('/v10/projects/'+project+'/env');assert.ok(!env.pagination?.next);
const old=JSON.parse(fs.readFileSync('docs/tournament-production-env-execution-2026-10-20.json'));
const records=old.records.map(({name})=>{const found=env.envs.filter(e=>e.key===name);return {name,count:found.length,scope:found[0]?.target,serverOnly:!name.startsWith('NEXT_PUBLIC_'),flagFalse:name.endsWith('_ENABLED')?found[0]?.value==='false':undefined};});
const production=p.targets?.production;const deployment=production?get('/v13/deployments/'+production.id):null;
const report={readOnly:true,project,team,verifiedAt:new Date().toISOString(),tournamentRecords:records,environmentMetadata:env.envs.map(e=>({key:e.key,target:e.target,type:e.type,gitBranch:e.gitBranch||null})),servingDeployment:deployment?{id:deployment.id,state:deployment.readyState,target:deployment.target,sha:deployment.gitSource?.sha||deployment.meta?.githubCommitSha,branch:deployment.gitSource?.ref||deployment.meta?.githubCommitRef,url:deployment.url,aliases:deployment.alias}:null,gitIntegration:{type:p.link?.type,repo:p.link?.repo,org:p.link?.org,productionBranch:p.link?.productionBranch},productionMutations:0};
fs.writeFileSync('docs/notification-production-preflight-2026-10-28.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({project,team,tournamentRecords:records,servingDeployment:report.servingDeployment,environmentRecordCount:env.envs.length,productionMutations:0},null,2));
