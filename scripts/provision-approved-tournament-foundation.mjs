import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
if(!process.argv.includes('--approved-foundation-only'))throw Error('EXPLICIT_FOUNDATION_APPROVAL_REQUIRED');
const project='challenge-suite',number='599920137316',location='us-central1';
const enqueuer=`tournament-lifecycle-enqueuer@${project}.iam.gserviceaccount.com`,invoker=`tournament-lifecycle-invoker@${project}.iam.gserviceaccount.com`;
const queue=`projects/${project}/locations/${location}/queues/tournament-lifecycle`;
const principal=`principal://iam.googleapis.com/projects/${number}/locations/global/workloadIdentityPools/challenge-suite-vercel-prod/subject/owner:seyiflemar27s-projects:project:challenge-suite:environment:production`;
const require=createRequire(import.meta.url),auth=require('C:/Users/seyia/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth.js');
const account=auth.getProjectDefaultAccount(process.cwd());if(!account)throw Error('CLI_ACCOUNT_UNAVAILABLE');
const {access_token:token}=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
const report='docs/tournament-foundation-execution-2026-10-20.json';
const actions=fs.existsSync(report)?JSON.parse(fs.readFileSync(report,'utf8')).actions:[];
const save=()=>fs.writeFileSync(report,JSON.stringify({project,location,updatedAt:new Date().toISOString(),activationPerformed:false,actions},null,2)+'\n');
async function api(url,body,allowMissing=false){assert.ok(url.startsWith('https://'));const response=await fetch(url,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const data=await response.json();if(allowMissing&&response.status===404)return null;if(!response.ok)throw Object.assign(Error('CLOUD_API_FAILED'),{code:data.error?.status||response.status});return data;}
const iam=email=>`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts/${email}`;
async function bind(url,role,member){const policy=await api(url+':getIamPolicy',{options:{requestedPolicyVersion:3}});const before=JSON.parse(JSON.stringify(policy.bindings||[]));const existing=(policy.bindings||[]).find(b=>b.role===role&&!b.condition);if(existing?.members?.includes(member)){actions.push({operation:'binding_already_present',resource:url,role,member});save();return;}
 policy.bindings=policy.bindings||[];if(existing)existing.members.push(member);else policy.bindings.push({role,members:[member]});
 await api(url+':setIamPolicy',{policy});const after=await api(url+':getIamPolicy',{options:{requestedPolicyVersion:3}});
 assert.ok(after.bindings.some(b=>b.role===role&&!b.condition&&b.members.includes(member)),'BINDING_NOT_VERIFIED');
 for(const binding of before)assert.ok(after.bindings.some(b=>b.role===binding.role&&JSON.stringify(b.condition)===JSON.stringify(binding.condition)&&binding.members.every(m=>b.members.includes(m))),'EXISTING_BINDING_CHANGED');
 actions.push({operation:'binding_added_and_verified',resource:url,role,member});save();console.log(JSON.stringify(actions.at(-1)));}
try{
 const identity=await api(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}`);assert.equal(identity.projectId,project);assert.equal(identity.projectNumber,number);
 const normalQueueUrl=`https://cloudtasks.googleapis.com/v2/projects/${project}/locations/${location}/queues/normal-lifecycle`;
 const normalSchedulerUrl=`https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/${location}/jobs/normal-lifecycle-recovery`;
 const normalBefore=JSON.stringify([await api(normalQueueUrl),await api(normalSchedulerUrl)]);
 for(const email of [enqueuer,invoker]){let service=await api(iam(email),undefined,true);if(service){assert.equal(service.email,email);assert.notEqual(service.disabled,true);}else{service=await api(`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`,{accountId:email.split('@')[0],serviceAccount:{displayName:email===enqueuer?'Tournament lifecycle enqueuer':'Tournament lifecycle invoker'}});assert.equal(service.email,email);actions.push({operation:'service_account_created',email});save();}
 let keys;for(let attempt=0;attempt<6;attempt++){keys=await api(iam(email)+'/keys?keyTypes=USER_MANAGED',undefined,true);if(keys)break;await new Promise(resolve=>setTimeout(resolve,10000));}assert.ok(keys,'SERVICE_ACCOUNT_KEY_LIST_NOT_YET_VISIBLE');assert.equal((keys.keys||[]).length,0,'UNEXPECTED_PRIVATE_KEY');actions.push({operation:'keyless_identity_verified',email});save();}
 const queueUrl='https://cloudtasks.googleapis.com/v2/'+queue;
 let current=await api(queueUrl,undefined,true);if(!current){current=await api(`https://cloudtasks.googleapis.com/v2/projects/${project}/locations/${location}/queues`,{name:queue,rateLimits:{maxDispatchesPerSecond:5,maxConcurrentDispatches:10},retryConfig:{maxAttempts:10,maxRetryDuration:'86400s',minBackoff:'10s',maxBackoff:'300s',maxDoublings:5}});actions.push({operation:'queue_created',resource:queue});save();}
 current=await api(queueUrl);assert.equal(current.rateLimits.maxDispatchesPerSecond,5);assert.equal(current.rateLimits.maxConcurrentDispatches,10);for(const [field,value]of Object.entries({maxAttempts:10,maxRetryDuration:'86400s',minBackoff:'10s',maxBackoff:'300s',maxDoublings:5}))assert.equal(current.retryConfig[field],value,'QUEUE_CONFIGURATION_CONFLICT');
 const tasks=await api(queueUrl+'/tasks?pageSize=1');assert.equal((tasks.tasks||[]).length,0,'QUEUE_NOT_EMPTY');
 actions.push({operation:'queue_configuration_and_empty_state_verified',resource:queue,state:current.state,rateLimits:current.rateLimits,retryConfig:current.retryConfig});save();
 await bind(queueUrl,'roles/cloudtasks.enqueuer','serviceAccount:'+enqueuer);
 await bind(iam(invoker),'roles/iam.serviceAccountUser','serviceAccount:'+enqueuer);
 await bind(iam(enqueuer),'roles/iam.workloadIdentityUser',principal);
 const normalAfter=JSON.stringify([await api(normalQueueUrl),await api(normalSchedulerUrl)]);
 // Scheduler's next execution metadata can advance independently. Compare configuration only.
 const strip=rows=>rows.map(({scheduleTime,lastAttemptTime,status,userUpdateTime,...row})=>row);
 assert.deepEqual(strip(JSON.parse(normalAfter)),strip(JSON.parse(normalBefore)),'NORMAL_CONFIGURATION_CHANGED');
 actions.push({operation:'normal_configuration_unchanged',verified:true});save();console.log(JSON.stringify({foundationVerified:true,queueEmpty:true,keylessAccounts:2,scopedBindings:3,schedulerCreated:false,flagsChanged:false,tasksEnqueued:0,firestoreWrites:0}));
}catch(e){save();console.error(JSON.stringify({stopped:true,code:String(e.code||e.message||'PROVISIONING_FAILED'),completedActions:actions.length}));process.exitCode=1;}
