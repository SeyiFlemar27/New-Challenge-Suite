import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
assert.match(process.env.GCLOUD_PROJECT??'',/^demo-/);assert.match(process.env.FIRESTORE_EMULATOR_HOST??'',/^127\.0\.0\.1:\d+$/);
const app=initializeApp({projectId:process.env.GCLOUD_PROJECT});
const alternate = process.env.CHALLENGE_SUITE_DIAGNOSTIC_FIRESTORE_PATH;
const db=alternate ? new (createRequire(import.meta.url)(alternate).Firestore)({projectId:process.env.GCLOUD_PROJECT}) : getFirestore(app);
const trace=[], rounds=[];
const mixedRounds=Number(process.env.CHALLENGE_SUITE_CONTENTION_ROUNDS ?? 20);
assert.ok(Number.isInteger(mixedRounds) && mixedRounds >= 20 && mixedRounds <= 200, 'Diagnostic rounds must retain at least the original 20 rounds and remain bounded');
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
 for(let round=0;round<mixedRounds;round++){
  const group='mixed_'+round, shared=db.collection('runtimeMixedReadDiagnostics').doc(group),participant=db.collection('runtimeMixedReadParticipants').doc(group+'_participant'),payment=db.collection('runtimeMixedReadPayments').doc(group+'_payment'),refund=db.collection('runtimeMixedReadRefunds').doc(group);
  await shared.set({group,counter:0});await participant.set({group,status:'active'});await payment.set({group,status:'confirmed'});
  const worker=(workerId)=>{let attempt=0;return db.runTransaction(async tx=>{
    attempt++;let operation='getAll shared + participant';
    const entryTrace={round,workerId,attempt,operations:[],startedAt:new Date().toISOString()};trace.push(entryTrace);
    try {
      entryTrace.operations.push(operation);const [head,entry]=await tx.getAll(shared,participant);
      if(entry.data().status==='done'){entryTrace.idempotent=true;return;}
      operation='query participants';entryTrace.operations.push(operation);const people=await tx.get(db.collection('runtimeMixedReadParticipants').where('group','==',group).limit(65));
      operation='query payments';entryTrace.operations.push(operation);const payments=await tx.get(db.collection('runtimeMixedReadPayments').where('group','==',group).limit(129));
      operation='getAll refund';entryTrace.operations.push(operation);const [prior]=await tx.getAll(refund);
      assert.equal(people.size,1);assert.equal(payments.size,1);
      if(!prior.exists)tx.create(refund,{group});tx.update(participant,{status:'done'});tx.update(shared,{counter:head.data().counter+1});
      entryTrace.operations.push('writes queued; native commit follows');
    } catch(error) {entryTrace.failure={operation,code:error.code,message:error.message};throw error;}
  });};
  const results=await Promise.allSettled([worker('A'),worker('B')]);
  const summary=results.map(row=>row.status==='fulfilled'?{status:row.status}:{status:row.status,code:row.reason?.code,message:row.reason?.message});rounds.push({round,results:summary});
  console.log('Native SDK sequential mixed-read transaction',round,summary);
  assert.ok(results.every(row=>row.status==='fulfilled'),'Sequential native SDK contention must complete without application retries');assert.equal((await shared.get()).data().counter,1);
 }
 console.log(`Native SDK only: ${mixedRounds} sequential mixed-read contention rounds passed.`);
 } finally {
 if(process.env.CHALLENGE_SUITE_CONTENTION_RESULTS_PATH)writeFileSync(process.env.CHALLENGE_SUITE_CONTENTION_RESULTS_PATH,JSON.stringify({node:process.version,project:process.env.GCLOUD_PROJECT,alternateSdk:Boolean(alternate),rounds,trace},null,2)+'\n');
 if(alternate)await db.terminate();await app.delete();
}
