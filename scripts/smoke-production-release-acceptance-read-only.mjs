import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
const origin='https://www.challengesuite.com',id='release-read-only-nonexistent-'+randomUUID(),results=[];
async function check(label,path,statuses=[200],options={}){
 try{const r=await fetch(new URL(path,origin),{method:options.method||'GET',...(options.method==='POST'?{headers:{'content-type':'application/json'},body:'{}'}:{}),redirect:'follow',signal:AbortSignal.timeout(45000)});const contentType=r.headers.get('content-type')||'';let body;
 if(contentType.includes('json'))body=await r.json();else if(options.image){const bytes=await r.arrayBuffer();body={byteLength:bytes.byteLength};}else body=await r.text();
 const unavailable=body?.data?.backendAvailable===false;const passed=statuses.includes(r.status)&&!unavailable&&!(r.status===200&&body?.ok===false)&&(!options.image||contentType.startsWith('image/')&&body.byteLength>0);
 results.push({label,status:r.status,passed,backendUnavailable:unavailable,...(options.image?{imageContentType:contentType,nonempty:body.byteLength>0}:{})});return {body,status:r.status};
 }catch(e){results.push({label,passed:false,error:e.cause?.code||e.name||'REQUEST_FAILED'});return {};}
}
for(const [label,path]of [['Homepage','/'],['Login','/auth/login'],['Explore','/explore'],['Sponsor application','/sponsor/apply'],['Enterprise contact','/enterprise/contact']])await check(label,path);
const explore=await check('Public Explore API','/api/explore/challenges');
await check('Explore refresh','/api/explore/challenges');
const tournaments=await check('Public Tournament listing','/api/tournaments');
await check('Live Event operational configuration','/api/live-events/configuration');
const current=explore.body?.data?.challenges?.find(c=>c.visibility!=='private'&&typeof c.id==='string'&&/^[A-Za-z0-9_-]+$/.test(c.id));
if(current){const detail=await check('Existing public detail API','/api/challenges/'+encodeURIComponent(current.id));await check('Existing public detail page','/challenges/'+encodeURIComponent(current.id));
 const candidates=[current.coverImageUrl,detail.body?.data?.challenge?.coverImageUrl,detail.body?.data?.coverImageUrl];const media=candidates.find(x=>typeof x==='string'&&x.startsWith('/api/challenge-media?'));
 if(media)await check('Existing authorized public image through server Storage adapter',media,[200],{image:true});else results.push({label:'Existing public image through server Storage adapter',skipped:true,reason:'No eligible same-origin media proxy URL returned; no object created.'});
}else results.push({label:'Existing public detail/media',skipped:true,reason:'No eligible existing public record returned; no fixture created.'});
for(const [label,path]of [['Creator drafts','/api/challenges/drafts/'+id],['Votes','/api/votes?challengeId='+id],['Admin moderation','/api/admin/challenge-reviews']])await check(label+' requires authentication',path,[401]);
await check('Protected runtime diagnostic requires authentication','/api/admin/tournament-runtime-verification',[401],{method:'POST'});
for(const [label,path]of [['Challenge publishing','/api/challenges/'+id+'/publish'],['Tournament publishing','/api/tournaments/'+id+'/publish'],['Tournament join','/api/tournaments/'+id+'/join'],['Tournament worker','/api/internal/tournament-activation'],['Tournament reconciler','/api/internal/tournament-scheduler']])await check(label+' rejects anonymous request before mutation',path,[401,403],{method:'POST'});
for(const collection of ['challenges','submissions','votes'])await check('Direct '+collection+' client reads denied','https://firestore.googleapis.com/v1/projects/challenge-suite/databases/(default)/documents/'+collection+'/'+id,[403]);
const ts=tournaments.body?.data?.tournaments||[];const report={checkedAt:new Date().toISOString(),candidate:'3203f4a42877d70b0b58aaa4ec4243897c5f66e4',origin,readOnlyAcceptance:true,applicationRecordsCreated:0,authenticatedActions:0,financialOperationsInvoked:0,anonymousPostProbes:'Authentication-first routes only; no credentials, existing IDs or worker identity supplied.',tournamentPublicRecords:ts.length,results,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>r.passed===false).length,skipped:results.filter(r=>r.skipped).length,limitations:['No successful authenticated Publish or media upload performed.','No full provider acceptance or worker dispatch performed.','Global concurrent Production writes cannot be excluded by this smoke test.']};
fs.writeFileSync('docs/automatic-publishing-production-post-deployment-smoke-2026-10-20.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.failed)process.exitCode=1;
