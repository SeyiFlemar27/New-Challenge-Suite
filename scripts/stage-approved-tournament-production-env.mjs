import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const project='prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX', team='team_Aof3F7rzekkBNGBsPb6p9XmO';
const cli='C:/Users/seyia/AppData/Roaming/npm/node_modules/vercel/dist/vc.js';
const worker='https://www.challengesuite.com/api/internal/tournament-activation';
const approved={TOURNAMENT_CLOUD_TASKS_QUEUE:'tournament-lifecycle',TOURNAMENT_CLOUD_TASKS_WORKER_URL:worker,TOURNAMENT_CLOUD_TASKS_ENQUEUER_SERVICE_ACCOUNT:'tournament-lifecycle-enqueuer@challenge-suite.iam.gserviceaccount.com',TOURNAMENT_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT:'tournament-lifecycle-invoker@challenge-suite.iam.gserviceaccount.com',TOURNAMENT_CLOUD_TASKS_OIDC_AUDIENCE:worker,TOURNAMENT_CLOUD_TASKS_RECONCILER_AUDIENCE:'https://www.challengesuite.com/api/internal/tournament-scheduler',TOURNAMENT_ACTIVATION_SCHEDULER_ENABLED:'false',TOURNAMENT_MATCH_LIFECYCLE_SCHEDULER_ENABLED:'false'};
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'challenge-suite-approved-env-'));
const report={capturedAt:new Date().toISOString(),project,team,records:[],applicationDeploymentPerformed:false};
function api(endpoint,body){
 const args=[cli,'api',endpoint,'--scope',team,'--method',body?'POST':'GET'];
 if(body){fs.writeFileSync(path.join(dir,'request.json'),JSON.stringify(body));args.push('--input',path.join(dir,'request.json'));}
 const result=spawnSync(process.execPath,args,{cwd:dir,encoding:'utf8',timeout:90000,maxBuffer:8_000_000});
 if(result.status!==0)throw Error('VERCEL_API_FAILED_'+(body?'POST':'GET'));
 const data=JSON.parse(result.stdout);if(data.error||data.failed?.length)throw Error('VERCEL_API_REJECTED');return data;
}
function identity(){const p=api('/v9/projects/'+project);assert.equal(p.id,project);assert.equal(p.name,'challenge-suite');assert.equal(p.accountId,team);return p;}
function inventory(){const r=api('/v10/projects/'+project+'/env');assert.ok(Array.isArray(r.envs));assert.ok(!r.pagination?.next,'ENV_PAGINATION_UNEXPECTED');return r.envs;}
function exact(e,key){assert.deepEqual(e.target,['production']);assert.equal(e.value,approved[key]);assert.ok(!e.gitBranch);assert.ok(!e.customEnvironmentIds?.length);}
try{
 const beforeProject=identity(),before=inventory();
 for(const key of Object.keys(approved)){assert.ok(!key.startsWith('NEXT_PUBLIC_'));const existing=before.filter(e=>e.key===key);assert.ok(existing.length<=1,'DUPLICATE_APPROVED_KEY');if(existing.length)exact(existing[0],key);}
 const original=new Map(before.map(e=>[e.id,JSON.stringify(e)]));
 for(const [key,value] of Object.entries(approved)){
  const current=inventory().filter(e=>e.key===key);assert.ok(current.length<=1);
  if(current.length){exact(current[0],key);report.records.push({name:key,scope:'production',status:'already_matching'});continue;}
  api('/v10/projects/'+project+'/env',{key,value,type:'plain',target:['production']});
  const saved=inventory().filter(e=>e.key===key);assert.equal(saved.length,1);exact(saved[0],key);
  report.records.push({name:key,scope:'production',status:'created_verified'});
  console.log(JSON.stringify({name:key,scope:'production',verified:true}));
 }
 const after=inventory();for(const [id,value]of original){assert.equal(JSON.stringify(after.find(e=>e.id===id)),value,'EXISTING_RECORD_CHANGED');}
 assert.equal(after.length,before.length+report.records.filter(r=>r.status==='created_verified').length);
 const afterProject=identity();assert.equal(afterProject.targets?.production?.id,beforeProject.targets?.production?.id,'PRODUCTION_DEPLOYMENT_CHANGED');
 report.existingRecordsUnchanged=true;report.bothSchedulerFlagsLiteralFalse=true;report.productionDeploymentUnchanged=true;report.productionDeploymentId=afterProject.targets?.production?.id;report.success=true;
}catch(error){report.success=false;report.failure=error.code||'SCOPED_CONFIGURATION_VERIFICATION_FAILED';process.exitCode=1;}
finally{fs.writeFileSync('C:/Dev/New-Challenge-Suite/docs/tournament-production-env-execution-2026-10-20.json',JSON.stringify(report,null,2)+'\n');fs.rmSync(path.join(dir,'request.json'),{force:true});fs.rmdirSync(dir);console.log(JSON.stringify(report,null,2));}
