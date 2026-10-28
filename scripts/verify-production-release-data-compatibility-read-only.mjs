import fs from 'node:fs';
import {createRequire} from 'node:module';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const require=createRequire(import.meta.url),auth=require('C:/Users/seyia/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth.js'),account=auth.getProjectDefaultAccount(process.cwd());
if(!account)throw Error('CLI_ACCOUNT_REQUIRED');const {access_token:token}=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
const headers={authorization:'Bearer '+token};
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('READ_HTTP_'+r.status);return r.json();}
const rel=await get('https://firebaserules.googleapis.com/v1/projects/challenge-suite/releases/firebase.storage/challenge-suite.firebasestorage.app');const rules=await get('https://firebaserules.googleapis.com/v1/'+rel.rulesetName);const norm=s=>s.replaceAll('\r\n','\n').trim();
const storageMatch=rules.source.files.some(f=>norm(f.content)===norm(fs.readFileSync('storage.rules','utf8')));
const {getAdminDb,getFirebaseAdminConfigStatus}=await import('../lib/firebase/admin.ts');if(getFirebaseAdminConfigStatus().projectId!=='challenge-suite')throw Error('WRONG_PROJECT');const db=getAdminDb();
const open=await db.collection('tournaments').where('status','==','registration_open').select('configVersion','publicationPolicyVersion').limit(501).get();
const legacy=open.docs.filter(d=>Number(d.data().configVersion||1)<3&&d.data().publicationPolicyVersion!==1).length;
const report={readOnly:true,productionMutations:0,checkedAt:new Date().toISOString(),storageRules:{ruleset:rel.rulesetName,candidateMatchesServing:storageMatch},registrationOpenRecords:{count:open.size,inventoryComplete:open.size<=500,legacyWithoutNewSchedulerGuard:legacy},passed:storageMatch&&open.size<=500&&legacy===0};
fs.writeFileSync('docs/automatic-publishing-production-data-compatibility-2026-10-20.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
