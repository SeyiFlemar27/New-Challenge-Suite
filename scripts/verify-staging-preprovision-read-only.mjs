import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const auth=require('C:/Users/seyia/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth.js');
const account=auth.getProjectDefaultAccount(process.cwd());
if(!account)throw Error('EXISTING_CLI_LOGIN_REQUIRED');
const {access_token:token}=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
const allowed=new Set([
 'https://firebase.googleapis.com/v1/projects:checkProjectId',
 'https://cloudresourcemanager.googleapis.com/v3/projects/challenge-suite',
 'https://cloudresourcemanager.googleapis.com/v1/projects/challenge-suite:getIamPolicy',
 'https://cloudresourcemanager.googleapis.com/v3/organizations:search',
 'https://cloudbilling.googleapis.com/v1/billingAccounts',
 'https://cloudbilling.googleapis.com/v1/projects/challenge-suite/billingInfo',
 'https://firestore.googleapis.com/v1/projects/challenge-suite/databases',
 'https://storage.googleapis.com/storage/v1/b/challenge-suite.firebasestorage.app'
]);
const checks=[];
async function read(label,url,body,select){
 if(!allowed.has(url)&&!/^https:\/\/cloudbilling.googleapis.com\/v1\/billingAccounts\/[A-Z0-9-]+(?::testIamPermissions)?$/.test(url))throw Error('URL_NOT_ALLOWLISTED');
 try{
 const all={};let pageToken,pages=0,status;
 do{
 if(++pages>30)throw Error('PAGINATION_LIMIT');
 const target=new URL(url);if(pageToken)target.searchParams.set('pageToken',pageToken);
 const r=await fetch(target,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify({...body,...(pageToken?{pageToken}:{})})}:{}),signal:AbortSignal.timeout(30000)});
 status=r.status;const data=await r.json();if(!r.ok){checks.push({label,status,error:data.error?.status||'HTTP_ERROR'});return null;}
 for(const [k,v]of Object.entries(data))all[k]=Array.isArray(v)?[...(all[k]||[]),...v]:v;
 pageToken=data.nextPageToken;
 }while(pageToken);
 checks.push({label,httpStatus:status,pages,...select(all)});return all;
 }catch(e){checks.push({label,error:e.cause?.code||e.code||'READ_FAILED'});return null;}
}
const mask=s=>s?'ending-'+s.slice(-6):null;
const results=await Promise.all([
 read('projectIdAvailability','https://firebase.googleapis.com/v1/projects:checkProjectId',{proposedId:'challenge-suite-staging'},b=>({proposedId:'challenge-suite-staging',status:b.projectIdStatus,suggestedAlternativeReturned:!!b.suggestedProjectId})),
 read('productionProject','https://cloudresourcemanager.googleapis.com/v3/projects/challenge-suite',null,b=>({projectId:b.projectId,name:b.name,parent:b.parent||null,state:b.state})),
 read('productionOwnership','https://cloudresourcemanager.googleapis.com/v1/projects/challenge-suite:getIamPolicy',{options:{requestedPolicyVersion:3}},b=>({ownerBindings:(b.bindings||[]).filter(x=>x.role==='roles/owner').map(x=>({memberCount:x.members?.length||0,memberTypes:[...new Set((x.members||[]).map(m=>m.split(':')[0]))],existingCliAccountIsOwner:(x.members||[]).includes('user:'+account.user.email),conditional:!!x.condition})),otherPrincipalValuesOmitted:true})),
 read('visibleOrganizations','https://cloudresourcemanager.googleapis.com/v3/organizations:search',null,b=>({organizations:(b.organizations||[]).map(o=>({name:o.name,state:o.state})),privateDomainsOmitted:true})),
 read('billingAccounts','https://cloudbilling.googleapis.com/v1/billingAccounts',null,b=>({accounts:(b.billingAccounts||[]).map(a=>({reference:mask(a.name),open:a.open,currencyCode:a.currencyCode,organization:a.parent||null})),fullIdsAndDisplayNamesOmitted:true})),
 read('productionBillingLink','https://cloudbilling.googleapis.com/v1/projects/challenge-suite/billingInfo',null,b=>({projectId:b.projectId,billingEnabled:b.billingEnabled,billingAccountReference:mask(b.billingAccountName)})),
 read('productionDatabases','https://firestore.googleapis.com/v1/projects/challenge-suite/databases',null,b=>({databases:(b.databases||[]).map(d=>({name:d.name,databaseEdition:d.databaseEdition,type:d.type,locationId:d.locationId,concurrencyMode:d.concurrencyMode,deleteProtectionState:d.deleteProtectionState,pointInTimeRecoveryEnablement:d.pointInTimeRecoveryEnablement}))})),
 read('productionBucketMetadata','https://storage.googleapis.com/storage/v1/b/challenge-suite.firebasestorage.app',null,b=>({name:b.name,location:b.location,locationType:b.locationType,storageClass:b.storageClass,uniformBucketLevelAccess:b.iamConfiguration?.uniformBucketLevelAccess?.enabled,publicAccessPrevention:b.iamConfiguration?.publicAccessPrevention,softDeleteRetentionSeconds:b.softDeletePolicy?.retentionDurationSeconds}))
]);
for(const b of results[4]?.billingAccounts||[]){await read('billingPermissions-'+mask(b.name),'https://cloudbilling.googleapis.com/v1/'+b.name+':testIamPermissions',{permissions:['billing.resourceAssociations.create','billing.budgets.create','billing.budgets.get','billing.accounts.get']},d=>({permissions:d.permissions||[]}));}
if(results[5]?.billingAccountName){
 const linked=results[5].billingAccountName;
 await read('productionLinkedBillingAccount','https://cloudbilling.googleapis.com/v1/'+linked,null,b=>({reference:mask(b.name),open:b.open,currencyCode:b.currencyCode,organization:b.parent||null}));
 await read('productionLinkedBillingPermissions','https://cloudbilling.googleapis.com/v1/'+linked+':testIamPermissions',{permissions:['billing.resourceAssociations.create','billing.budgets.create','billing.budgets.get','billing.accounts.get']},b=>({permissions:b.permissions||[]}));
}
const report={readOnly:true,identitySource:'existing_firebase_cli_login',authenticatedAccountPresent:true,credentialsAndOwnerEmailsOmitted:true,checkedAt:new Date().toISOString(),candidate:'3203f4a42877d70b0b58aaa4ec4243897c5f66e4',checks,resourceMutations:0};
fs.writeFileSync('docs/challenge-suite-staging-preprovision-verification-2026-10-20.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(checks.some(c=>c.error))process.exitCode=1;
