import nextEnv from '@next/env';
import { cert } from 'firebase-admin/app';
import { createRequire } from 'node:module';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const project=process.env.FIREBASE_PROJECT_ID||process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if(project!=='challenge-suite')throw Error('WRONG_PROJECT');
const credential=cert({projectId:project,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY.trim().replace(/\\n/g,'\n')});
let token, authenticatedAccount;
if(process.argv.includes('--firebase-cli-account')){
 const require=createRequire(import.meta.url), auth=require('C:/Users/seyia/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth.js');
 const account=auth.getProjectDefaultAccount(process.cwd());if(!account)throw Error('CLI_ACCOUNT_UNAVAILABLE');
 authenticatedAccount=account.user.email;
 const credentials=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);token=credentials.access_token;
}else{token=(await credential.getAccessToken()).access_token;}
async function get(label,url,select,policy=false){try{const r=await fetch(url,{method:policy?'POST':'GET',headers:{authorization:'Bearer '+token,...(policy?{'content-type':'application/json'}:{})},...(policy?{body:JSON.stringify({options:{requestedPolicyVersion:3}})}:{}),signal:AbortSignal.timeout(20000)});const body=await r.json();let pages=1;while(r.ok&&body.nextPageToken){if(pages++>=100)throw Error('PAGINATION_LIMIT');const next=new URL(url);next.searchParams.set('pageToken',body.nextPageToken);const page=await fetch(next,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});if(!page.ok)throw Error('PAGINATION_FAILED');const data=await page.json();for(const [key,value]of Object.entries(data))if(Array.isArray(value))body[key]=[...(body[key]||[]),...value];body.nextPageToken=data.nextPageToken;}return {label,status:r.status,pages,...(r.ok?select(body):{error:body.error?.status})};}catch(e){return {label,error:String(e.code||e.cause?.code||e.message||'TRANSPORT_FAILED')};}}
const number='599920137316',location='us-central1';
const checks=await Promise.all([
 ...['cloudtasks.googleapis.com','cloudscheduler.googleapis.com','iam.googleapis.com','logging.googleapis.com','monitoring.googleapis.com'].map(api=>get(api,`https://serviceusage.googleapis.com/v1/projects/${number}/services/${api}`,b=>({state:b.state}))),
 get('queues',`https://cloudtasks.googleapis.com/v2/projects/${project}/locations/${location}/queues`,b=>({queues:(b.queues||[]).map(q=>({name:q.name,state:q.state,rateLimits:q.rateLimits,retryConfig:q.retryConfig})),hasMore:Boolean(b.nextPageToken)})),
 get('scheduler',`https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/${location}/jobs`,b=>({jobs:(b.jobs||[]).map(j=>({name:j.name,state:j.state,schedule:j.schedule,timeZone:j.timeZone,retryConfig:j.retryConfig,target:j.httpTarget?{uri:j.httpTarget.uri,httpMethod:j.httpTarget.httpMethod,oidcToken:j.httpTarget.oidcToken}:undefined})),hasMore:Boolean(b.nextPageToken)})),
 get('serviceAccounts',`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`,b=>({accounts:(b.accounts||[]).map(a=>({email:a.email,disabled:a.disabled===true})),hasMore:Boolean(b.nextPageToken)})),
 get('wifPools',`https://iam.googleapis.com/v1/projects/${number}/locations/global/workloadIdentityPools`,b=>({pools:(b.workloadIdentityPools||[]).map(p=>({name:p.name,state:p.state,disabled:p.disabled===true})),hasMore:Boolean(b.nextPageToken)})),
 get('alertPolicies',`https://monitoring.googleapis.com/v3/projects/${project}/alertPolicies`,b=>({policies:(b.alertPolicies||[]).map(p=>({name:p.name,displayName:p.displayName,enabled:p.enabled})),hasMore:Boolean(b.nextPageToken)})),
 get('projectIdentity',`https://cloudresourcemanager.googleapis.com/v1/projects/${project}`,b=>({projectId:b.projectId,projectNumber:b.projectNumber,lifecycleState:b.lifecycleState})),
 get('wifProviders',`https://iam.googleapis.com/v1/projects/${number}/locations/global/workloadIdentityPools/challenge-suite-vercel-prod/providers`,b=>({providers:(b.workloadIdentityPoolProviders||[]).map(p=>({name:p.name,state:p.state,disabled:p.disabled,attributeMapping:p.attributeMapping,attributeCondition:p.attributeCondition,oidc:p.oidc}))})),
 get('projectServiceAgentBindings',`https://cloudresourcemanager.googleapis.com/v1/projects/${project}:getIamPolicy`,b=>({bindings:(b.bindings||[]).filter(x=>/cloudtasks.serviceAgent|cloudscheduler.serviceAgent/.test(x.role))}),true),
 ...['normal-lifecycle-enqueuer','normal-lifecycle-invoker'].map(name=>get(name+'Policy',`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts/${name}@${project}.iam.gserviceaccount.com:getIamPolicy`,b=>({bindings:b.bindings||[]}),true)),
 get('logMetrics',`https://logging.googleapis.com/v2/projects/${project}/metrics`,b=>({metrics:(b.metrics||[]).map(m=>({name:m.name,filter:m.filter,disabled:m.disabled===true}))})),
]);
console.log(JSON.stringify({readOnly:true,project,location,authenticatedAccount,identitySource:process.argv.includes('--firebase-cli-account')?'existing_firebase_cli_login':'configured_admin_service_account',checks},null,2));
