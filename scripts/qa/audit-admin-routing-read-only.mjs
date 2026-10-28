import nextEnv from '@next/env';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {getAdminDb,getAdminAuth,getFirebaseAdminConfigStatus}=await import('../../lib/firebase/admin.ts');
if(getFirebaseAdminConfigStatus().projectId!=='challenge-suite')throw Error('WRONG_PROJECT');
const db=getAdminDb(),auth=getAdminAuth();if(!db||!auth)throw Error('BACKEND_UNAVAILABLE');
const users=await db.collection('users').select('isAdmin','adminRoles','adminRole','adminAccessStatus','accountType','planId','planStatus').limit(101).get();
const rows=[];
for(const doc of users.docs){
 const p=doc.data();const identity=await auth.getUser(doc.id).catch(()=>null);
 rows.push({accountTag:createHash('sha256').update(doc.id).digest('hex').slice(0,10),plan:p.planId,planStatus:p.planStatus,accountType:p.accountType,isAdminType:typeof p.isAdmin,isAdmin:p.isAdmin===true?true:p.isAdmin===false?false:p.isAdmin==null?null:'non-boolean',adminRoles:Array.isArray(p.adminRoles)?p.adminRoles:[],adminRole:p.adminRole??null,adminAccessStatus:p.adminAccessStatus??null,authAdminClaim:identity?.customClaims?.admin===true,authRecordExists:Boolean(identity)});
}
const report={checkedAt:new Date().toISOString(),readOnly:true,mutations:0,recordCount:rows.length,complete:rows.length<101,rows};
fs.writeFileSync('docs/dashboard-admin-routing-read-only-2026-10-21.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
