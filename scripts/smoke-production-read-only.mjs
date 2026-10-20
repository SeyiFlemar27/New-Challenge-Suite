import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
const origin='https://www.challengesuite.com',results=[],synthetic='release-rules-nonexistent-'+randomUUID();
async function check(label,path,expected,{json=false}={}){try{const url=path.startsWith('https://')?path:origin+path;const r=await fetch(url,{signal:AbortSignal.timeout(30000),redirect:'follow'});const body=json?await r.json():await r.text();const ok=expected.includes(r.status)&&(!json||r.status!==200||body.ok!==false)&&(!json||body.data?.backendAvailable!==false);results.push({label,status:r.status,passed:ok});return json&&r.status===200?body:null;}catch(e){results.push({label,passed:false,error:String(e.code||e.cause?.code||e.name||'REQUEST_FAILED')});return null;}}
await check('Homepage','/',[200]);
await check('Authentication page','/auth/login',[200]);
await check('Explore page','/explore',[200]);
const explore=await check('Public Explore API','/api/explore/challenges',[200],{json:true});
await check('Tournament listing API','/api/tournaments',[200],{json:true});
await check('Sponsor application route','/sponsor/apply',[200]);
await check('Enterprise contact route','/enterprise/contact',[200]);
await check('Voting requires authentication','/api/votes?challengeId='+synthetic,[401],{json:true});
await check('Creator draft requires authentication','/api/challenges/drafts/'+synthetic,[401],{json:true});
await check('Admin moderation requires authentication','/api/admin/challenge-reviews',[401],{json:true});
const publicChallenge=explore?.data?.challenges?.find(c=>c.visibility!=='private'&&typeof c.id==='string'&&/^[A-Za-z0-9_-]+$/.test(c.id));
if(publicChallenge){await check('Public challenge detail API','/api/challenges/'+encodeURIComponent(publicChallenge.id),[200],{json:true});await check('Public challenge detail page','/challenges/'+encodeURIComponent(publicChallenge.id),[200]);}
else results.push({label:'Existing public challenge detail',skipped:true,reason:'No public fixture returned; no production record created.'});
for(const collection of ['challenges','submissions','votes'])await check('Anonymous direct '+collection+' read denied','https://firestore.googleapis.com/v1/projects/challenge-suite/databases/(default)/documents/'+collection+'/'+synthetic,[403],{json:true});
const report={target:origin,readOnly:true,recordsCreated:0,noFinancialOperations:true,applicationReleaseUnchanged:true,results,authenticatedAcceptance:'Not performed: no approved isolated production identity.',completedAt:new Date().toISOString()};
fs.writeFileSync('docs/automatic-publishing-production-read-only-smoke-2026-10-20.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(results.some(r=>!r.passed&&!r.skipped))process.exitCode=1;
