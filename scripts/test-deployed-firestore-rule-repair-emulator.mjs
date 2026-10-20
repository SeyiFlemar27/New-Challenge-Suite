import assert from 'node:assert/strict';
import fs from 'node:fs';
const project=process.env.GCLOUD_PROJECT;
assert.match(project||'',/^demo-/);
for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'])assert.match(process.env[key]||'',/^127\.0\.0\.1:\d+$/);
const host='http://'+process.env.FIRESTORE_EMULATOR_HOST,base=host+`/v1/projects/${project}/databases/(default)/documents`;
let assertions=0;const eq=(a,b,message)=>{assert.equal(a,b,message);assertions++;};
const before=fs.readFileSync('docs/qa/automatic-publishing-20261020/deployed-firestore-rules-before-20261020.rules','utf8');
const proposed=fs.readFileSync('docs/qa/automatic-publishing-20261020/proposed-firestore-private-content-20261020.rules','utf8');
async function rules(content){const r=await fetch(host+`/emulator/v1/projects/${project}:securityRules`,{method:'PUT',body:JSON.stringify({rules:{files:[{content}]}})});eq(r.ok,true,'isolated emulator accepted rules');}
async function account(label){const r=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:label+'@example.test',password:'LocalTestOnly123!',returnSecureToken:true})});const data=await r.json();assert.ok(data.idToken);return {uid:data.localId,token:data.idToken};}
async function get(path,token){return fetch(base+'/'+path,{headers:token?{authorization:'Bearer '+token}:{}});}
async function seed(path,fields){const r=await fetch(base+'/'+path,{method:'PATCH',headers:{authorization:'Bearer owner','content-type':'application/json'},body:JSON.stringify({fields})});eq(r.ok,true,'synthetic emulator fixture persisted');}
const str=stringValue=>({stringValue}),owner=await account('rules-owner'),other=await account('rules-other');
try{
 await seed('challenges/private-fixture',{visibility:str('private'),status:str('draft'),creatorId:str(owner.uid),description:str('Synthetic private data')});
 await seed('submissions/rejected-fixture',{status:str('rejected'),challengeId:str('private-fixture')});
 await seed('votes/raw-fixture',{challengeId:str('private-fixture'),userId:str(owner.uid)});
 await seed('profiles/'+owner.uid,{userId:str(owner.uid)});
 await seed('legalDocumentVersions/public-fixture',{title:str('Synthetic terms')});
 await seed('cashLedger/private-fixture',{userId:str(owner.uid)});
 await rules(before);
 eq((await get('challenges/private-fixture')).status,200,'deployed rules reproduce anonymous private draft exposure');
 eq((await get('submissions/rejected-fixture')).status,200,'deployed rules reproduce rejected submission exposure');
 eq((await get('votes/raw-fixture',other.token)).status,200,'deployed rules reproduce unrelated signed-in raw-vote access');
 await rules(proposed);
 for(const [path,token]of [['challenges/private-fixture',null],['challenges/private-fixture',owner.token],['submissions/rejected-fixture',null],['votes/raw-fixture',other.token]])eq((await get(path,token)).status,403,'proposed rule requires server-authorized projection: '+path);
 eq((await get('challenges/private-fixture','owner')).status,200,'trusted backend access is preserved');
 eq((await get('profiles/'+owner.uid,owner.token)).status,200,'self-profile read is preserved');
 eq((await get('profiles/'+owner.uid,other.token)).status,403,'another account cannot read private profile');
 eq((await get('legalDocumentVersions/public-fixture')).status,200,'public legal document access is preserved');
 eq((await get('cashLedger/private-fixture',owner.token)).status,403,'financial records remain server-only');
 console.log(`PASS deployed Firestore privacy-rule reproduction and minimal repair: ${assertions} emulator assertions; zero production reads or writes.`);
}finally{await rules(fs.readFileSync('firestore.rules','utf8'));}
