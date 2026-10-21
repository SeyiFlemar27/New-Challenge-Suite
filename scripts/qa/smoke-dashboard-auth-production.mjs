import fs from 'node:fs';
import {randomUUID} from 'node:crypto';

const sha=process.argv[2];if(!/^[a-f0-9]{40}$/.test(sha||''))throw Error('EXACT_SHA_REQUIRED');
const origin='https://www.challengesuite.com',results=[],missing='auth-release-nonexistent-'+randomUUID();
async function probe(label,path,statuses=[200],method='GET'){
  try{
    const r=await fetch(new URL(path,origin),{method,redirect:'follow',signal:AbortSignal.timeout(45000),...(method==='POST'?{headers:{'content-type':'application/json'},body:'{}'}:{})});
    const json=(r.headers.get('content-type')||'').includes('json'),body=json?await r.json():await r.text();
    const passed=statuses.includes(r.status)&&body?.data?.backendAvailable!==false&&!(r.status===200&&body?.ok===false);
    results.push({label,status:r.status,passed});return body;
  }catch(e){results.push({label,passed:false,error:e.cause?.code||e.name});return null;}
}
for(const [label,path]of [['Homepage','/'],['Login','/auth/login'],['Host protected page','/dashboard/host'],['Personal protected page','/dashboard'],['Explore','/explore'],['Sponsor application','/sponsor/apply'],['Enterprise contact','/enterprise/contact']])await probe(label,path);
const explore=await probe('Explore API','/api/explore/challenges');await probe('Explore refresh','/api/explore/challenges');
await probe('Tournament listing','/api/tournaments');const availability=await probe('Live Event operational config','/api/live-events/configuration');
const current=explore?.data?.challenges?.find(c=>c.visibility!=='private'&&typeof c.id==='string'&&/^[A-Za-z0-9_-]+$/.test(c.id));
if(current){await probe('Existing public detail API','/api/challenges/'+encodeURIComponent(current.id));await probe('Existing public detail page','/challenges/'+encodeURIComponent(current.id));}
else results.push({label:'Existing public detail',skipped:true,reason:'No eligible existing public record; no test record created.'});
for(const [label,path]of [['Profile bootstrap','/api/auth/profile/bootstrap'],['Creator dashboard','/api/dashboard'],['Admin moderation','/api/admin/challenge-reviews'],['Enterprise workspace','/api/enterprise/workspace']])await probe(label+' requires authentication',path,[401]);
for(const [label,path]of [['Server session','/api/auth/session'],['Challenge publish','/api/challenges/'+missing+'/publish'],['Tournament worker','/api/internal/tournament-activation'],['Tournament recovery','/api/internal/tournament-scheduler']])await probe(label+' rejects anonymous request',path,[401,403],'POST');
const config=availability?.data||{},financialKeys=['creatorFundingAvailable','paidCheckoutAvailable','sponsorFundingAvailable','externalPayoutExecutionAvailable'];
const report={checkedAt:new Date().toISOString(),sha,origin,productionRecordsCreated:0,authenticatedActions:0,financialOperationsInvoked:0,results,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>r.passed===false).length,skipped:results.filter(r=>r.skipped).length,liveEventFinancialOperationsDisabled:financialKeys.every(k=>config[k]===false),limitations:['No authenticated Host or other account journey is certified by these anonymous probes.','No successful production publication, payment, upload or worker dispatch performed.','Cannot exclude concurrent unrelated user writes or provider operations.']};
fs.writeFileSync('docs/dashboard-auth-production-smoke-2026-10-21.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.failed||!report.liveEventFinancialOperationsDisabled)process.exitCode=1;
