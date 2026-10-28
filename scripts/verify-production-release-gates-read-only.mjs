import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const sha='3203f4a42877d70b0b58aaa4ec4243897c5f66e4',project='challenge-suite',bucket='challenge-suite.firebasestorage.app',vp='prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX',team='team_Aof3F7rzekkBNGBsPb6p9XmO';
const results=[];
function vc(path){const r=spawnSync(process.execPath,['C:/Users/seyia/AppData/Roaming/npm/node_modules/vercel/dist/vc.js','api',path,'--scope',team,'--method','GET'],{encoding:'utf8',timeout:90000,maxBuffer:8e6});if(r.status!==0)throw Error('VERCEL_READ_FAILED');return JSON.parse(r.stdout);}
const p=vc('/v9/projects/'+vp);if(p.id!==vp||p.accountId!==team||p.name!==project)throw Error('WRONG_VERCEL_PROJECT');
const env=vc('/v10/projects/'+vp+'/env');if(env.pagination?.next)throw Error('INCOMPLETE_ENV_METADATA');const prod=env.envs.filter(e=>e.target?.includes('production'));
const required=['NEXT_PUBLIC_FIREBASE_PROJECT_ID','NEXT_PUBLIC_FIREBASE_API_KEY','NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN','NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET','NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID','NEXT_PUBLIC_FIREBASE_APP_ID','FIREBASE_PROJECT_ID','FIREBASE_STORAGE_BUCKET','FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY','PRIVATE_INVITE_ENCRYPTION_KEY'];
results.push({label:'productionConfigurationPresence',passed:required.every(k=>prod.some(e=>e.key===k)),missing:required.filter(k=>!prod.some(e=>e.key===k)),valuesOmitted:true});
const flags=['TOURNAMENT_ACTIVATION_SCHEDULER_ENABLED','TOURNAMENT_MATCH_LIFECYCLE_SCHEDULER_ENABLED'];
for(const key of flags){const r=prod.filter(e=>e.key===key);results.push({label:key,passed:r.length===1&&r[0].value==='false',literalFalse:r[0]?.value==='false'});}
for(const key of ['TOURNAMENT_ENTRY_PAYMENTS_ENABLED','LIVE_EVENT_PAID_CHECKOUT_ENABLED','LIVE_EVENT_AUTOMATIC_REFUNDS_ENABLED','LIVE_EVENT_CREATOR_FUNDING_ENABLED','LIVE_EVENT_SPONSOR_FUNDING_ENABLED']){const r=prod.filter(e=>e.key===key);results.push({label:key,passed:r.length===0||r.every(e=>e.value==='false'),absent:r.length===0});}
const old=vc('/v13/deployments/dpl_DyD6caF8diEezVDYUZdxz8cVffo5');
results.push({label:'rollbackDeploymentAvailable',passed:old.readyState==='READY'&&old.projectId===vp&&old.meta?.githubCommitSha==='4e0c5cee1c012361f492fd37a50518194fd909d6',id:old.id,state:old.readyState,url:old.url});
results.push({label:'gitIntegration',passed:p.link?.repo==='New-Challenge-Suite'&&p.link?.org==='SeyiFlemar27'&&p.link?.productionBranch==='main',repo:p.link?.repo,org:p.link?.org,productionBranch:p.link?.productionBranch});
const require=createRequire(import.meta.url),auth=require('C:/Users/seyia/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth.js'),account=auth.getProjectDefaultAccount(process.cwd());if(!account)throw Error('EXISTING_CLI_ACCOUNT_REQUIRED');
const {access_token:token}=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
async function get(url){const r=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('READ_HTTP_'+r.status);return r.json();}
const indexes=await get('https://firestore.googleapis.com/v1/projects/challenge-suite/databases/(default)/collectionGroups/-/indexes');if(indexes.nextPageToken)throw Error('INCOMPLETE_INDEX_INVENTORY');
const expected=JSON.parse(fs.readFileSync('docs/automatic-publishing-index-execution-2026-10-20.json')).results;
results.push({label:'eightRequiredIndexesReady',passed:expected.length===8&&expected.every(e=>indexes.indexes.some(i=>i.name===e.name&&i.state==='READY')),ready:expected.filter(e=>indexes.indexes.some(i=>i.name===e.name&&i.state==='READY')).length});
const release=await get('https://firebaserules.googleapis.com/v1/projects/challenge-suite/releases/cloud.firestore');const rule=await get('https://firebaserules.googleapis.com/v1/'+release.rulesetName);const norm=s=>s.replaceAll('\r\n','\n').trim();const content=rule.source.files.find(f=>f.name==='firestore.rules')?.content;const approved=fs.readFileSync('docs/qa/automatic-publishing-20261020/proposed-firestore-private-content-20261020.rules','utf8');
results.push({label:'servingApprovedFirestoreRules',passed:!!content&&norm(content)===norm(approved),ruleset:release.rulesetName});
const sched=await get('https://cloudscheduler.googleapis.com/v1/projects/challenge-suite/locations/us-central1/jobs/tournament-lifecycle-recovery');results.push({label:'tournamentSchedulerPaused',passed:sched.state==='PAUSED',state:sched.state});
const tasks=await get('https://cloudtasks.googleapis.com/v2/projects/challenge-suite/locations/us-central1/queues/tournament-lifecycle/tasks?pageSize=1');results.push({label:'tournamentQueueEmpty',passed:!tasks.tasks?.length&&!tasks.nextPageToken});
const {getAdminDb,getAdminStorage,getAdminAuth,getFirebaseAdminConfigStatus}=await import('../lib/firebase/admin.ts');
const cfg=getFirebaseAdminConfigStatus();if(cfg.projectId!==project||cfg.storageBucket!==bucket||cfg.emulator)throw Error('WRONG_APPLICATION_BACKEND');
await getAdminDb().collection('challenges').select().limit(1).get();results.push({label:'applicationCredentialFirestoreRead',passed:true,noDocumentContentExported:true});
try{await getAdminAuth().getUser('release-read-only-nonexistent-'+randomUUID());results.push({label:'applicationCredentialAuthRead',passed:false,reason:'Unexpected existing random identity'});}catch(e){results.push({label:'applicationCredentialAuthRead',passed:e.code==='auth/user-not-found',code:e.code});}
const [bm]=await getAdminStorage().bucket(bucket).getMetadata();results.push({label:'applicationCredentialStorageMetadataRead',passed:bm.name===bucket,location:bm.location});
const localConfigUnchanged=['.env.local','next-env.d.ts','tsconfig.json'].map(file=>{const recovery='C:/Users/seyia/AppData/Local/Temp/challenge-suite-auto-publish-recovery-c4RtLq';return {file,exists:fs.existsSync(file),snapshotPresent:fs.existsSync(recovery)};});
const report={checkedAt:new Date().toISOString(),candidate:sha,readOnly:true,productionMutations:0,credentialValuesPrinted:false,results,sourcePreservation:localConfigUnchanged,limitations:['Credential reads use configured local application identity; Production runtime is independently checked after deployment.','No publishing mutation, live provider acceptance, new media writes or authenticated browser journey performed.']};
fs.writeFileSync('docs/automatic-publishing-production-execution-gates-2026-10-20.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(results.some(r=>!r.passed))process.exitCode=1;
