import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuthenticatedDestination} from '../lib/account-routing.ts';
assert.match(process.env.GCLOUD_PROJECT||'',/^demo-/);
for(const name of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'])assert.match(process.env[name]||'',/^127\.0\.0\.1:\d+$/);
const app=initializeApp({projectId:process.env.GCLOUD_PROJECT}),db=getFirestore(app),auth=getAuth(app);
const {GET}=await import('../app/api/auth/profile/bootstrap/route.ts');
const {getRequestUser,requireAdminUser}=await import('../lib/server/auth.ts');
let assertions=0;function eq(a,b,label){assert.deepEqual(a,b,label);assertions++;}
const originalAllowlist=process.env.ADMIN_EMAIL_ALLOWLIST;delete process.env.ADMIN_EMAIL_ALLOWLIST;
try{
for(const [label,fields,claims,expectedType,expectedDestination,allowed]of [
 ['host-legacy',{role:'host',planId:'host',isAdmin:true},{},'user','/dashboard/host',true],
 ['creator-legacy',{role:'user',planId:'creator',isAdmin:true},{},'user','/dashboard',true],
 ['ordinary',{role:'user',planId:'free',isAdmin:false},{},'user','/dashboard',false],
 ['explicit-admin',{role:'admin',planId:'host',isAdmin:true},{},'admin','/admin',true],
 ['claim-admin',{role:'user',planId:'free',isAdmin:false},{admin:true},'admin','/admin',true],
 ['assigned-admin',{role:'user',planId:'free',isAdmin:false,adminRoles:['admin']},{},'admin','/admin',true],
 ['suspended-admin',{role:'admin',planId:'host',isAdmin:true,adminAccessStatus:'suspended'},{},'user','/dashboard/host',false],
 ['untrusted-role',{role:'admin',planId:'free',isAdmin:false},{},'user','/dashboard',false],
 ['allowlisted-admin',{role:'user',planId:'free',isAdmin:false},{},'admin','/admin',true]
]){
 const email=`${label}-${randomUUID()}@example.test`,password='EmulatorOnly123!';
 const created=await auth.createUser({email,password,emailVerified:true});
 await auth.setCustomUserClaims(created.uid,claims);
 const account={uid:created.uid,email,emailVerified:true,verified:true,accountType:'user',accountTypeSelectionComplete:true,planStatus:'active',creatorOnboardingComplete:true,hostOnboardingComplete:true,...fields};
 await Promise.all(['users','profiles'].map(c=>db.collection(c).doc(created.uid).set(account)));
 if(label==='allowlisted-admin')process.env.ADMIN_EMAIL_ALLOWLIST=email;
 const signed=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
 const token=(await signed.json()).idToken;assert.ok(token);
 const request=new Request('http://localhost/api/auth/profile/bootstrap',{headers:{authorization:'Bearer '+token}});
 const actor=await getRequestUser(request);eq(actor.isAdmin,allowed,label+' existing capability preserved');eq(actor.adminAccount,expectedType==='admin',label+' explicit account identity');
 const result=await GET(request),body=await result.json();eq(result.status,200,label+' bootstrap succeeds');eq(body.data.user.accountType,expectedType,label+' projected identity');eq(getAuthenticatedDestination(body.data.user),expectedDestination,label+' default destination');
 const permission=await requireAdminUser(request);eq(permission.response?.status??200,allowed?200:403,label+' API boundary unchanged');
 delete process.env.ADMIN_EMAIL_ALLOWLIST;
}
console.log(`PASS explicit Admin identity vs personal capability: ${assertions} actual Auth/Firestore/bootstrap/authorization assertions.`);
}finally{if(originalAllowlist===undefined)delete process.env.ADMIN_EMAIL_ALLOWLIST;else process.env.ADMIN_EMAIL_ALLOWLIST=originalAllowlist;await db.terminate();await app.delete();}
