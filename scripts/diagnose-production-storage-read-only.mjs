import nextEnv from '@next/env';
import { cert } from 'firebase-admin/app';
import { createPrivateKey, sign } from 'node:crypto';

// No object/database writes. Tokens and credential values never leave this process.
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const project = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if (project !== 'challenge-suite' || process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw Error('WRONG_TARGET');
const email = process.env.FIREBASE_CLIENT_EMAIL;
const key = process.env.FIREBASE_PRIVATE_KEY?.trim().replace(/\\n/g, '\n');
const bucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const result = { readOnly: true, project, node: process.version, bucketConfigured: Boolean(bucket), principalInProject: Boolean(email?.endsWith('@challenge-suite.iam.gserviceaccount.com')), proxyVariablesPresent: ['HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','NODE_USE_ENV_PROXY','NODE_EXTRA_CA_CERTS'].filter(k => Boolean(process.env[k])), stages: [] };
function failure(error) { return { code: String(error.code || error.cause?.code || 'REQUEST_FAILED'), type: error.constructor.name }; }
try { createPrivateKey(key); result.stages.push({stage:'private_key_parse',ok:true}); } catch(e) {result.stages.push({stage:'private_key_parse',ok:false,...failure(e)}); console.log(JSON.stringify(result)); process.exit(1);}
let token;
try { const auth = cert({projectId:project,clientEmail:email,privateKey:key}); const credentials = await auth.getAccessToken(); token=credentials.access_token; result.stages.push({stage:'admin_sdk_token',ok:Boolean(token)}); }
catch(e) { result.stages.push({stage:'admin_sdk_token',ok:false,...failure(e)}); }
if (!token) {
  try {
    const now=Math.floor(Date.now()/1000), encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
    const payload=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:email,scope:'https://www.googleapis.com/auth/cloud-platform',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+300});
    const assertion=payload+'.'+sign('RSA-SHA256',Buffer.from(payload),key).toString('base64url');
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(20000)});
    const body=await response.json(); token=body.access_token;result.stages.push({stage:'native_fetch_token',ok:response.ok&&Boolean(token),status:response.status,error:body.error});
  } catch(e) { result.stages.push({stage:'native_fetch_token',ok:false,...failure(e)}); }
}
if(token && bucket) {
  try {
    const permissions=['storage.objects.get','storage.objects.create','storage.objects.update','storage.objects.delete'];
    const url=new URL('https://storage.googleapis.com/storage/v1/b/'+encodeURIComponent(bucket)+'/iam/testPermissions');
    permissions.forEach(p=>url.searchParams.append('permissions',p));
    const response=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
    const body=await response.json();result.stages.push({stage:'storage_test_permissions',ok:response.ok,status:response.status,permissions:body.permissions||[],errorReason:body.error?.errors?.[0]?.reason});
  } catch(e){result.stages.push({stage:'storage_test_permissions',ok:false,...failure(e)});}
}
console.log(JSON.stringify(result,null,2));
if(process.argv.includes('--application-storage')){
 try{const {getAdminStorage}=await import('../lib/firebase/admin.ts');const [permissions]=await getAdminStorage().bucket().iam.testPermissions(['storage.objects.get','storage.objects.create','storage.objects.update','storage.objects.delete']);console.log(JSON.stringify({stage:'repaired_application_storage',readOnly:true,ok:true,permissions}));}catch(e){console.log(JSON.stringify({stage:'repaired_application_storage',readOnly:true,ok:false,...failure(e)}));process.exitCode=1;}
}
if(!result.stages.some(s=>s.stage==='storage_test_permissions'&&s.ok))process.exitCode=1;
