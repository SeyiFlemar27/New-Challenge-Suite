import fs from 'node:fs';
const origin='https://challenge-suite-kmt9ic0gd-seyiflemar27s-projects.vercel.app';
const token=process.env.VERCEL_OIDC_TOKEN;
if(!token)throw Error('SHORT_LIVED_PREVIEW_IDENTITY_UNAVAILABLE');
const results=[];
for(const [label,path]of [['Homepage','/'],['Login','/auth/login'],['Explore','/explore'],['Sponsor application','/sponsor/apply'],['Enterprise contact','/enterprise/contact'],['Admin verification shell','/admin/tournament-runtime-verification'],['Explore backend availability','/api/explore/challenges']]){
 try{
  const response=await fetch(origin+path,{headers:{'x-vercel-trusted-oidc-idp-token':token},redirect:'manual',signal:AbortSignal.timeout(30000)});
  const type=response.headers.get('content-type')||'';const body=await response.text();
  const protectionPage=response.status===401||response.status===403||!!response.headers.get('location')?.includes('vercel.com');
  const json=type.includes('application/json')?JSON.parse(body):null;
  results.push({label,status:response.status,protectionPage,html:type.includes('text/html'),bodyNonempty:body.length>0,applicationUnavailable:json?.data?.backendAvailable===false||body.includes('Firebase')&&body.includes('not configured'),backendAvailable:json?.data?.backendAvailable,applicationOk:json?.ok,returnedChallengeCount:Array.isArray(json?.data?.challenges)?json.data.challenges.length:undefined});
 }catch(error){results.push({label,error:error.cause?.code||error.name});}
}
const report={origin,readOnly:true,environment:'preview',shortLivedIdentityUsed:true,credentialsPrinted:false,productionMutations:0,expectedCommit:'3203f4a42877d70b0b58aaa4ec4243897c5f66e4',results,verifiedAt:new Date().toISOString()};
fs.writeFileSync('C:/Dev/New-Challenge-Suite/docs/automatic-publishing-preview-read-only-smoke-2026-10-20.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
if(results.some(r=>r.error||r.protectionPage||r.status>=500||r.applicationUnavailable))process.exitCode=1;
