import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
assert.match(process.env.GCLOUD_PROJECT??'',/^demo-/);assert.match(process.env.FIRESTORE_EMULATOR_HOST??'',/^127\.0\.0\.1:\d+$/);
const app=initializeApp({projectId:process.env.GCLOUD_PROJECT}),db=getFirestore(app);
try {
 for(let round=0;round<3;round++){
  const ref=db.collection('runtimeTransactionDiagnostics').doc('shared_'+round);await ref.set({counter:0});
  let arrived=0,release;const barrier=new Promise(resolve=>{release=resolve;});
  const worker=async()=>{let first=true;return db.runTransaction(async tx=>{const row=await tx.get(ref);if(first){first=false;arrived++;if(arrived===2)release();await barrier;}tx.update(ref,{counter:row.data().counter+1});});};
  const results=await Promise.allSettled([worker(),worker()]);
  console.log('Native SDK transaction diagnostic',round,results.map(row=>row.status==='fulfilled'?{status:row.status}:{status:row.status,code:row.reason?.code,message:row.reason?.message}));
  assert.ok(results.every(row=>row.status==='fulfilled'),'Native SDK must resolve contention without application retries');assert.equal((await ref.get()).data().counter,2);
 }
 console.log('Native SDK only: 3 competing transaction rounds passed; no application services, added retries or skipped contention.');
 for(let round=0;round<3;round++){
  const ref=db.collection('runtimeQueryDiagnostics').doc('shared_'+round);await ref.set({group:round,counter:0});
  let arrived=0,release;const barrier=new Promise(resolve=>{release=resolve;});
  const worker=async()=>{let first=true;return db.runTransaction(async tx=>{const rows=await tx.get(db.collection('runtimeQueryDiagnostics').where('group','==',round));if(first){first=false;arrived++;if(arrived===4)release();await barrier;}tx.update(ref,{counter:rows.docs[0].data().counter+1});});};
  const results=await Promise.allSettled(Array.from({length:4},worker));
  console.log('Native SDK query transaction diagnostic',round,results.map(row=>row.status==='fulfilled'?{status:row.status}:{status:row.status,code:row.reason?.code,message:row.reason?.message}));
  assert.ok(results.every(row=>row.status==='fulfilled'),'Native SDK must resolve query contention without application retries');assert.equal((await ref.get()).data().counter,4);
 }
 console.log('Native SDK only: 3 four-way query transaction rounds passed without application retries.');
} finally {await app.delete();}
