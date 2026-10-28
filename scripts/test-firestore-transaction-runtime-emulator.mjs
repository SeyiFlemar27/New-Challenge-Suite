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
 for(let round=0;round<20;round++){
  const group='mixed_'+round, shared=db.collection('runtimeMixedReadDiagnostics').doc(group),participant=db.collection('runtimeMixedReadParticipants').doc(group+'_participant'),payment=db.collection('runtimeMixedReadPayments').doc(group+'_payment'),refund=db.collection('runtimeMixedReadRefunds').doc(group);
  await shared.set({group,counter:0});await participant.set({group,status:'active'});await payment.set({group,status:'confirmed'});
  const worker=()=>db.runTransaction(async tx=>{
    const [head,entry]=await tx.getAll(shared,participant);
    if(entry.data().status==='done')return;
    const people=await tx.get(db.collection('runtimeMixedReadParticipants').where('group','==',group).limit(65));
    const payments=await tx.get(db.collection('runtimeMixedReadPayments').where('group','==',group).limit(129));
    const [prior]=await tx.getAll(refund);
    assert.equal(people.size,1);assert.equal(payments.size,1);
    if(!prior.exists)tx.create(refund,{group});tx.update(participant,{status:'done'});tx.update(shared,{counter:head.data().counter+1});
  });
  const results=await Promise.allSettled([worker(),worker()]);
  console.log('Native SDK sequential mixed-read transaction',round,results.map(row=>row.status==='fulfilled'?{status:row.status}:{status:row.status,code:row.reason?.code,message:row.reason?.message}));
  assert.ok(results.every(row=>row.status==='fulfilled'),'Sequential native SDK contention must complete without application retries');assert.equal((await shared.get()).data().counter,1);
 }
 console.log('Native SDK only: 20 sequential mixed-read contention rounds passed.');
} finally {await app.delete();}
