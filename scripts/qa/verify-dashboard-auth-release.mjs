import fs from 'node:fs';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';

// Read-only release evidence. CLI authentication stays inside the CLI process.
const sha=process.argv[2],phase=process.argv[3];
if(!/^[a-f0-9]{40}$/.test(sha||'')||!['preflight','deployed'].includes(phase))throw Error('Exact SHA and preflight|deployed required');
const project='prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX',team='team_Aof3F7rzekkBNGBsPb6p9XmO';
const cli='C:/Users/seyia/AppData/Roaming/npm/node_modules/vercel/dist/vc.js';
function vercel(path){const r=spawnSync(process.execPath,[cli,'api',path,'--scope',team,'--method','GET'],{encoding:'utf8',timeout:90000,maxBuffer:8e6});if(r.status!==0)throw Error('VERCEL_READ_FAILED');return JSON.parse(r.stdout);}
const p=vercel('/v9/projects/'+project),alias=vercel('/v4/aliases/www.challengesuite.com');
const id=alias.deployment?.id||alias.deploymentId;
const d=vercel('/v13/deployments/'+id);
const env=vercel('/v10/projects/'+project+'/env');
if(env.pagination?.next)throw Error('INCOMPLETE_ENV_METADATA');
const flags=['TOURNAMENT_ACTIVATION_SCHEDULER_ENABLED','TOURNAMENT_MATCH_LIFECYCLE_SCHEDULER_ENABLED'].map(name=>{const rows=env.envs.filter(e=>e.key===name&&e.target?.includes('production'));return{name,productionLiteralFalse:rows.length===1&&rows[0].value==='false'};});
const require=createRequire(import.meta.url),firebaseAuth=require('C:/Users/seyia/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth.js');
const account=firebaseAuth.getProjectDefaultAccount(process.cwd());if(!account)throw Error('EXISTING_CLI_LOGIN_REQUIRED');
const {access_token:token}=await firebaseAuth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
async function cloud(url){const r=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('CLOUD_READ_HTTP_'+r.status);return r.json();}
const job=await cloud('https://cloudscheduler.googleapis.com/v1/projects/challenge-suite/locations/us-central1/jobs/tournament-lifecycle-recovery');
const queue=await cloud('https://cloudtasks.googleapis.com/v2/projects/challenge-suite/locations/us-central1/queues/tournament-lifecycle/tasks?pageSize=1');
const source=d.gitSource?.sha||d.meta?.githubCommitSha,branch=d.meta?.githubCommitRef||d.gitSource?.ref;
const report={checkedAt:new Date().toISOString(),phase,readOnly:true,productionMutations:0,expectedSha:sha,projectId:d.projectId,teamId:team,deploymentId:id,url:'https://'+d.url,state:d.readyState,target:d.target,sha:source,branch,domain:'www.challengesuite.com',projectMatches:d.projectId===project&&p.id===project,sourceMatches:source===sha&&branch==='main',domainMatches:alias.projectId===project||id===p.targets?.production?.id,flags,schedulerState:job.state,queueEmpty:!queue.tasks?.length&&!queue.nextPageToken};
report.passed=report.projectMatches&&report.sourceMatches&&report.domainMatches&&d.readyState==='READY'&&d.target==='production'&&flags.every(f=>f.productionLiteralFalse)&&job.state==='PAUSED'&&report.queueEmpty;
fs.writeFileSync(`docs/dashboard-auth-${phase}-2026-10-21.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
