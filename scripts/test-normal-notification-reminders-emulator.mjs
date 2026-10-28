import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {queueNormalSubmissionReminders,deliverNormalReminderBatch} from '../lib/server/normal-submission-reminders.ts';
assert.match(process.env.GCLOUD_PROJECT??'',/^demo-/);assert.match(process.env.FIRESTORE_EMULATOR_HOST??'',/^127\.0\.0\.1:\d+$/);
const app=initializeApp({projectId:process.env.GCLOUD_PROJECT}),db=getFirestore(app),id='normal_notice_'+randomUUID(),now=new Date(),deadline=new Date(now.getTime()+6*3600000).toISOString();
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
try{
 await db.collection('challenges').doc(id).set({builderVersion:'normal_v3',status:'submission_open',visibility:'private',creatorId:'owner',submissionStartAt:new Date(now.getTime()-3600000).toISOString(),submissionDeadline:deadline});
 for(const kind of ['missing','accepted','correction','final_rejected','restricted','revoked','withdrawn']){
  const uid=id+'_'+kind,submissionId=id+'_entry_'+kind;
  await db.collection('users').doc(uid).set({accountStatus:kind==='restricted'?'suspended':'active'});
  await db.collection('notificationPreferences').doc(uid).set({inApp:false,challengeReminders:false});
  await db.collection('privateChallengeAccess').doc(id+'_'+uid).set({status:kind==='revoked'?'revoked':'approved'});
  await db.collection('challengeParticipants').doc(id+'_'+uid).set({challengeId:id,userId:uid,status:kind==='withdrawn'?'withdrawn':'active',...(['accepted','correction','final_rejected'].includes(kind)?{submissionId}:{})});
  if(['accepted','correction','final_rejected'].includes(kind))await db.collection('submissions').doc(submissionId).set({challengeId:id,userId:uid,status:kind==='accepted'?'pending_review':kind==='correction'?'resubmission_requested':'rejected',resubmissionDeadline:deadline});
 }
 eq((await queueNormalSubmissionReminders(db,id,now)).queued,true,'six-hour reminder source created');
 const events=await db.collection('normalNotificationOutbox').where('challengeId','==',id).get();eq(events.size,1,'one durable reminder context');const event=events.docs[0];
 eq(await deliverNormalReminderBatch(db,event.id,now),2,'only missing and correctable participants notified');
 const notices=await db.collection('notifications').where('entityId','==',id).get();eq(notices.size,2,'no Creator or unrelated recipient');
 eq(notices.docs.every(row=>[id+'_missing',id+'_correction'].includes(row.data().userId)),true,'accepted, restricted, revoked, withdrawn and final rejection excluded');
 const notice=notices.docs[0];await notice.ref.update({read:true,status:'read'});eq(await deliverNormalReminderBatch(db,event.id,now),0,'recovery never duplicates');eq((await notice.ref.get()).data().read,true,'recovery keeps read state');
 await db.collection('submissions').doc(id+'_entry_correction').update({status:'pending_review'});
 const oneHour=new Date(now.getTime()+5*3600000);await queueNormalSubmissionReminders(db,id,oneHour);
 const second=(await db.collection('normalNotificationOutbox').where('challengeId','==',id).get()).docs.find(row=>row.data().reminderHours===1);
 eq(await deliverNormalReminderBatch(db,second.id,oneHour),1,'accepted correction stops one-hour reminder');
 await db.collection('challenges').doc(id).update({submissionDeadline:new Date(oneHour.getTime()+7*3600000).toISOString()});
 const stale=db.collection('normalNotificationOutbox').doc(id+'_stale');await stale.set({...event.data(),status:'pending',cursor:null});
 eq(await deliverNormalReminderBatch(db,stale.id,oneHour),0,'old deadline never delivers');eq((await stale.get()).data().outcome,'stale_deadline_or_state','stale reason recorded');
 eq((await queueNormalSubmissionReminders(db,id,new Date(oneHour.getTime()+8*3600000))).queued,false,'no reminder after the latest deadline');
 console.log(`Normal/Private reminders: ${checks} actual eligibility, deadline, privacy, correction, preference and recovery assertions passed.`);
}finally{await app.delete();}
