import fs from 'node:fs';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url),auth=require('C:/Users/seyia/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth.js'),account=auth.getProjectDefaultAccount(process.cwd());if(!account)throw Error('CLI_LOGIN_REQUIRED');const {access_token:token}=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
async function read(url,authorized=true){const r=await fetch(url,{headers:authorized?{authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('READ_HTTP_'+r.status);return r.json();}
const job=await read('https://cloudscheduler.googleapis.com/v1/projects/challenge-suite/locations/us-central1/jobs/tournament-lifecycle-recovery'),tasks=await read('https://cloudtasks.googleapis.com/v2/projects/challenge-suite/locations/us-central1/queues/tournament-lifecycle/tasks?pageSize=1');
const live=await read('https://www.challengesuite.com/api/live-events/configuration',false);
const r=spawnSync(process.execPath,['C:/Users/seyia/AppData/Roaming/npm/node_modules/vercel/dist/vc.js','api','/v10/projects/prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX/env','--scope','team_Aof3F7rzekkBNGBsPb6p9XmO','--method','GET'],{encoding:'utf8',timeout:90000,maxBuffer:8e6});if(r.status!==0)throw Error('ENV_METADATA_READ_FAILED');const env=JSON.parse(r.stdout);if(env.pagination?.next)throw Error('ENV_METADATA_INCOMPLETE');
const flags=['TOURNAMENT_ACTIVATION_SCHEDULER_ENABLED','TOURNAMENT_MATCH_LIFECYCLE_SCHEDULER_ENABLED'].map(name=>{const e=env.envs.filter(e=>e.key===name&&e.target?.includes('production'));return {name,literalFalse:e.length===1&&e[0].value==='false'};});
const data=live.data||{};const expected=['creatorFundingAvailable','paidCheckoutAvailable','sponsorFundingAvailable','externalPayoutExecutionAvailable'];
const report={checkedAt:new Date().toISOString(),readOnly:true,productionMutations:0,schedulerState:job.state,queueEmpty:!tasks.tasks?.length&&!tasks.nextPageToken,flags,liveEventAvailability:Object.fromEntries(expected.map(k=>[k,data[k]])),liveEventFinancialOperationsDisabled:expected.every(k=>data[k]===false)};
report.passed=job.state==='PAUSED'&&report.queueEmpty&&flags.every(f=>f.literalFalse)&&report.liveEventFinancialOperationsDisabled;
fs.writeFileSync('docs/automatic-publishing-production-post-deployment-disabled-state-2026-10-20.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
