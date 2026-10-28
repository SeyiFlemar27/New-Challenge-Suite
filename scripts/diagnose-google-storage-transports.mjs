import nextEnv from '@next/env';
import {createRequire} from 'node:module';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const project=process.env.FIREBASE_PROJECT_ID||process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if(project!=='challenge-suite')throw Error('WRONG_TARGET');
const require=createRequire(import.meta.url),adminRequire=createRequire(require.resolve('firebase-admin/storage'));
const {Storage}=adminRequire('@google-cloud/storage'),storageRequire=createRequire(adminRequire.resolve('@google-cloud/storage'));
const credentials={client_email:process.env.FIREBASE_CLIENT_EMAIL,private_key:process.env.FIREBASE_PRIVATE_KEY.trim().replace(/\\n/g,'\n')};
const bucketName=process.env.FIREBASE_STORAGE_BUCKET||process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const results=[];
const describe=e=>({code:String(e.code||e.cause?.code||'REQUEST_FAILED'),origin:(()=>{try{return new URL(e.config?.url||e.request?.url).origin;}catch{return undefined;}})()});
for(const [name,lib,native] of [['application_google_auth',require('google-auth-library'),false],['storage_google_auth',storageRequire('google-auth-library'),false],['storage_google_auth_native_fetch',storageRequire('google-auth-library'),true]]){
 try{const auth=new lib.GoogleAuth({projectId:project,credentials,scopes:['https://www.googleapis.com/auth/devstorage.full_control'],...(native?{clientOptions:{transporterOptions:{fetchImplementation:fetch}}}:{})});const token=await auth.getAccessToken();results.push({stage:name,ok:Boolean(token)});}catch(e){results.push({stage:name,ok:false,...describe(e)});}
}
try{const storage=new Storage({projectId:project,credentials});const [permissions]=await storage.bucket(bucketName).iam.testPermissions(['storage.objects.get','storage.objects.create','storage.objects.update','storage.objects.delete']);results.push({stage:'storage_sdk_iam',ok:true,permissions});}catch(e){results.push({stage:'storage_sdk_iam',ok:false,...describe(e)});}
console.log(JSON.stringify({readOnly:true,project,node:process.version,results},null,2));
