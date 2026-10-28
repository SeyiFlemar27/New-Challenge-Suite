import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),auth=require('C:/Users/seyia/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth.js');
const account=auth.getProjectDefaultAccount(process.cwd());if(!account)throw Error('CLI_ACCOUNT_UNAVAILABLE');
const {access_token:token}=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
const project='challenge-suite',base='projects/'+project,results=[];
async function request(url,policy=false){const r=await fetch(url,{method:policy?'POST':'GET',headers:{authorization:'Bearer '+token,...(policy?{'content-type':'application/json'}:{})},...(policy?{body:JSON.stringify({options:{requestedPolicyVersion:3}})}:{}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('READ_ONLY_HTTP_'+r.status);return r.json();}
const work=[
 ['notificationChannels',`https://monitoring.googleapis.com/v3/${base}/notificationChannels`,b=>({channels:(b.notificationChannels||[]).map(c=>({name:c.name,type:c.type,enabled:c.enabled,verificationStatus:c.verificationStatus})),hasMore:!!b.nextPageToken})],
 ['dedicatedQueueEmpty',`https://cloudtasks.googleapis.com/v2/${base}/locations/us-central1/queues/tournament-lifecycle/tasks?pageSize=1`,b=>({empty:!(b.tasks?.length),hasMore:!!b.nextPageToken})],
 ...['enqueuer','invoker'].flatMap(role=>{const sa=`${base}/serviceAccounts/tournament-lifecycle-${role}@${project}.iam.gserviceaccount.com`;return [
  [role+'Policy',`https://iam.googleapis.com/v1/${sa}:getIamPolicy`,b=>({bindings:b.bindings||[]}),true],
  [role+'Keys',`https://iam.googleapis.com/v1/${sa}/keys?keyTypes=USER_MANAGED`,b=>({userManagedKeyCount:b.keys?.length||0})]
 ];}),
 ['queuePolicy',`https://cloudtasks.googleapis.com/v2/${base}/locations/us-central1/queues/tournament-lifecycle:getIamPolicy`,b=>({bindings:b.bindings||[]}),true],
 ['indexes',`https://firestore.googleapis.com/v1/${base}/databases/(default)/collectionGroups/-/indexes`,b=>{
 const plan=JSON.parse(fs.readFileSync('docs/automatic-publishing-index-execution-2026-10-20.json'));return {required:plan.results.map(e=>({name:e.name,state:b.indexes?.find(i=>i.name===e.name)?.state||'MISSING'})),hasMore:!!b.nextPageToken};}],
 ];
await Promise.all(work.map(async([label,url,select,policy])=>{try{results.push({label,...select(await request(url,policy))});}catch(e){results.push({label,error:e.message});}}));
try{const release=await request('https://firebaserules.googleapis.com/v1/'+base+'/releases/cloud.firestore');const rules=await request('https://firebaserules.googleapis.com/v1/'+release.rulesetName);const source=rules.source.files.find(f=>f.name==='firestore.rules')?.content;const expected=fs.readFileSync('docs/qa/automatic-publishing-20261020/proposed-firestore-private-content-20261020.rules','utf8');const normalize=s=>s.replaceAll('\r\n','\n').trim();results.push({label:'servingFirestoreRules',release:release.name,ruleset:release.rulesetName,approvedCandidateMatches:!!source&&normalize(source)===normalize(expected),sha256:source?createHash('sha256').update(normalize(source)).digest('hex'):null});}catch(e){results.push({label:'servingFirestoreRules',error:e.message});}
const report={readOnly:true,productionMutations:0,project,completedAt:new Date().toISOString(),results};fs.writeFileSync('docs/automatic-publishing-final-infrastructure-verification-2026-10-20.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(results.some(r=>r.error))process.exitCode=1;
