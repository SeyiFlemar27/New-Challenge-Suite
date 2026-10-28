import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
if(!process.argv.includes('--approved-create-pause-update'))throw Error('EXPLICIT_SCHEDULER_SEQUENCE_APPROVAL_REQUIRED');
if(Date.now()>=Date.parse('2026-12-31T00:00:00Z'))throw Error('REVIEW_FUTURE_SCHEDULE_AGAIN');
const project='challenge-suite',location='us-central1',name=`projects/${project}/locations/${location}/jobs/tournament-lifecycle-recovery`;
const endpoint='https://cloudscheduler.googleapis.com/v1/'+name;
const target='https://www.challengesuite.com/api/internal/tournament-scheduler';
const invoker=`tournament-lifecycle-invoker@${project}.iam.gserviceaccount.com`;
const require=createRequire(import.meta.url),auth=require('C:/Users/seyia/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth.js');
const account=auth.getProjectDefaultAccount(process.cwd());if(!account)throw Error('CLI_ACCOUNT_UNAVAILABLE');
const {access_token:token}=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
const actions=[],output='docs/tournament-paused-scheduler-execution-2026-10-20.json';
const save=()=>fs.writeFileSync(output,JSON.stringify({project,location,actions,runOrResumeCalled:false,updatedAt:new Date().toISOString()},null,2)+'\n');
async function api(url,method='GET',body,missing=false){assert.ok(['GET','POST','PATCH'].includes(method));assert.ok(!/:run|:resume/.test(url),'FORBIDDEN_EXECUTION_OPERATION');const response=await fetch(url,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const data=await response.json();if(missing&&response.status===404)return null;if(!response.ok)throw Object.assign(Error('SCHEDULER_API_FAILED'),{code:data.error?.status||response.status});return data;}
function verify(job){assert.equal(job.name,name);assert.equal(job.timeZone,'Etc/UTC');assert.equal(job.httpTarget.uri,target);assert.equal(job.httpTarget.httpMethod,'POST');assert.equal(job.httpTarget.oidcToken.serviceAccountEmail,invoker);assert.equal(job.httpTarget.oidcToken.audience,target);for(const [key,value]of Object.entries({retryCount:3,minBackoffDuration:'10s',maxBackoffDuration:'60s',maxDoublings:3}))assert.equal(job.retryConfig[key],value);assert.ok(!job.lastAttemptTime,'UNEXPECTED_JOB_EXECUTION');}
try{
 const identity=await api(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}`);assert.equal(identity.projectId,project);assert.equal(identity.projectNumber,'599920137316');
 assert.equal(await api(endpoint,'GET',undefined,true),null,'JOB_ALREADY_EXISTS_STOP_FOR_REVIEW');
 const accountMetadata=await api(`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts/${invoker}`);assert.equal(accountMetadata.email,invoker);assert.notEqual(accountMetadata.disabled,true);
 const job=await api(`https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/${location}/jobs`,'POST',{name,schedule:'0 0 1 1 *',timeZone:'Etc/UTC',httpTarget:{uri:target,httpMethod:'POST',headers:{'Content-Type':'application/json'},body:Buffer.from('{}').toString('base64'),oidcToken:{serviceAccountEmail:invoker,audience:target}},retryConfig:{retryCount:3,maxRetryDuration:'0s',minBackoffDuration:'10s',maxBackoffDuration:'60s',maxDoublings:3}});
 actions.push({operation:'created_with_future_schedule',name,schedule:job.schedule,nextOccurrence:job.scheduleTime});save();
 await api(endpoint+':pause','POST',{});
 let paused=await api(endpoint);assert.equal(paused.state,'PAUSED','PAUSE_NOT_CONFIRMED');verify(paused);assert.equal(paused.schedule,'0 0 1 1 *');actions.push({operation:'independent_pause_verified',state:paused.state});save();
 await api(endpoint+'?updateMask=schedule','PATCH',{name,schedule:'* * * * *'});
 paused=await api(endpoint);
 if(paused.state!=='PAUSED'){await api(endpoint+':pause','POST',{});const emergency=await api(endpoint);actions.push({operation:'unexpected_enable_emergency_pause',state:emergency.state});save();throw Error('UPDATE_CHANGED_JOB_STATE_STOP');}
 verify(paused);assert.equal(paused.schedule,'* * * * *');actions.push({operation:'final_verified',name,schedule:paused.schedule,timeZone:paused.timeZone,state:paused.state,target:paused.httpTarget,retryConfig:paused.retryConfig,noExecutionObserved:!paused.lastAttemptTime});save();
 console.log(JSON.stringify({name,state:paused.state,schedule:paused.schedule,timeZone:paused.timeZone,noExecutionObserved:true,runOrResumeCalled:false}));
}catch(e){save();console.error(JSON.stringify({stopped:true,code:String(e.code||e.message||'SCHEDULER_CONFIGURATION_FAILED'),actionsCompleted:actions.length,runOrResumeCalled:false}));process.exitCode=1;}
