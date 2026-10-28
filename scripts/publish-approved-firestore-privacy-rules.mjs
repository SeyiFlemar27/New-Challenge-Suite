import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
if(!process.argv.includes('--approved-three-rule-correction'))throw Error('EXPLICIT_THREE_RULE_APPROVAL_REQUIRED');
const project='challenge-suite',base='https://firebaserules.googleapis.com/v1/',releaseName=`projects/${project}/releases/cloud.firestore`;
const directory='docs/qa/automatic-publishing-20261020/';
const baseline=fs.readFileSync(directory+'deployed-firestore-rules-before-20261020.rules','utf8'),candidate=fs.readFileSync(directory+'proposed-firestore-private-content-20261020.rules','utf8');
const normalize=s=>s.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trim(),hash=s=>createHash('sha256').update(normalize(s)).digest('hex');
let expected=baseline;
for(const [collection,id,read]of [['challenges','challengeId','true'],['submissions','submissionId','true'],['votes','voteId','signedIn()']]){const old=`match /${collection}/{${id}} {\n      allow read: if ${read};\n      allow write: if false;\n    }`;assert.equal(expected.split(old).length,2,'UNEXPECTED_BASELINE_CLAUSE');expected=expected.replace(old,`match /${collection}/{${id}} {\n      allow read, write: if false;\n    }`);}
assert.equal(normalize(candidate),normalize(expected),'UNAPPROVED_RULE_CHANGE');
const require=createRequire(import.meta.url),auth=require('C:/Users/seyia/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth.js');
const account=auth.getProjectDefaultAccount(process.cwd());if(!account)throw Error('CLI_ACCOUNT_UNAVAILABLE');
const {access_token:token}=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
const report={project,approvedCollections:['challenges','submissions','votes'],applicationDeployed:false,dataWrites:false,indexChanges:false,storageRuleChanges:false};
const save=()=>fs.writeFileSync('docs/firestore-private-content-rule-execution-2026-10-20.json',JSON.stringify(report,null,2)+'\n');
async function api(resource,method='GET',body){assert.ok(resource.startsWith(`projects/${project}/`)||resource===`projects/${project}:test`);const response=await fetch(base+resource,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const result=await response.json();if(!response.ok)throw Object.assign(Error('RULES_API_FAILED'),{code:result.error?.status||response.status});return result;}
try{
 const release=await api(releaseName);assert.equal(release.name,releaseName);report.previousRelease=release;
 const current=await api(release.rulesetName);assert.equal(current.source.files.length,1,'UNEXPECTED_MULTI_FILE_RULESET');
 assert.equal(normalize(current.source.files[0].content),normalize(baseline),'PRODUCTION_RULES_BASELINE_CHANGED');report.baselineSha256=hash(baseline);save();
 fs.writeFileSync(directory+'deployed-firestore-release-before-20261020.json',JSON.stringify({release,ruleset:current},null,2)+'\n');
 const validated=await api(`projects/${project}:test`,'POST',{source:{files:[{name:'firestore.rules',content:candidate}]}});assert.equal((validated.issues||[]).filter(i=>i.severity==='ERROR').length,0,'RULE_VALIDATION_FAILED');
 const created=await api(`projects/${project}/rulesets`,'POST',{source:{files:[{name:'firestore.rules',content:candidate}]}});assert.ok(created.name.startsWith(`projects/${project}/rulesets/`));report.candidateRulesetName=created.name;save();
 // Recheck the release immediately before the only mutable operation.
 const fresh=await api(releaseName);assert.equal(fresh.rulesetName,release.rulesetName,'CONCURRENT_RULE_RELEASE_CHANGED');
 await api(releaseName,'PATCH',{release:{name:releaseName,rulesetName:created.name}});
 const serving=await api(releaseName);assert.equal(serving.rulesetName,created.name,'SERVING_RULESET_NOT_UPDATED');const servingRules=await api(serving.rulesetName);assert.equal(normalize(servingRules.source.files[0].content),normalize(candidate));
 report.servingRelease=serving;report.servingSha256=hash(candidate);report.verified=true;report.completedAt=new Date().toISOString();save();console.log(JSON.stringify({project,releaseName,rulesetName:serving.rulesetName,threeRuleCorrectionVerified:true,dataWrites:false,indexChanges:false,storageRuleChanges:false}));
}catch(e){report.stopped=true;report.failure=String(e.code||e.message||'RULE_PUBLICATION_FAILED');save();console.error(JSON.stringify({stopped:true,code:report.failure,candidateRulesetCreated:Boolean(report.candidateRulesetName),servingVerified:report.verified===true}));process.exitCode=1;}
