import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {deliverTournamentNotifications} from '../lib/server/tournament-notifications.ts';
import {deliverTournamentEmailOutbox} from '../lib/server/normal-email.ts';
assert.match(process.env.GCLOUD_PROJECT??'',/^demo-/);assert.match(process.env.FIRESTORE_EMULATOR_HOST??'',/^127\.0\.0\.1:\d+$/);
const db=getFirestore(initializeApp({projectId:process.env.GCLOUD_PROJECT}));
const id='notice_'+randomUUID(),host=id+'_host',first=id+'_first',second=id+'_second',matchId=id+'_match';
let checks=0;const eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
const inbox=async uid=>(await db.collection('notifications').where('userId','==',uid).get()).docs;
try{
 await db.collection('tournaments').doc(id).set({hostId:host,activationState:'activated',status:'round_active'});
 for(const uid of [first,second])await db.collection('tournamentParticipants').doc(uid).set({userId:uid,tournamentId:id,status:'active'});
 await db.collection('tournamentParticipants').doc(id+'_withdrawn').set({tournamentId:id,userId:id+'_withdrawn_user',status:'withdrawn'});
 await db.collection('notificationPreferences').doc(second).set({inApp:false,challengeReminders:false,voteNotifications:false});
 const event=db.collection('tournamentAuditEvents').doc(id+'_activation');await event.set({tournamentId:id,action:'full_tournament_activated',actorId:'system_tournament_activation',createdAt:new Date().toISOString()});
 eq((await deliverTournamentNotifications(db,id)).delivered,3,'activation reaches host and both registered competitors despite legacy opt out');
 const notice=(await inbox(first))[0];await notice.ref.update({read:true,status:'read'});
 const repeated=await Promise.all([deliverTournamentNotifications(db,id),deliverTournamentNotifications(db,id)]);eq(repeated.reduce((n,row)=>n+row.delivered,0),0,'concurrent retry never duplicates');eq((await notice.ref.get()).data().read,true,'read status preserved');
 eq((await inbox(id+'_withdrawn_user')).length,0,'unregistered/withdrawn people receive no activation');eq((await event.get()).data().notificationDeliveredAt,undefined,'immutable audit source is not delivery state');
 await db.collection('tournamentMatches').doc(matchId).set({tournamentId:id,participantAId:first,participantBId:second,status:'voting_open'});
 await db.collection('tournamentAuditEvents').doc(id+'_voting').set({tournamentId:id,action:'match_voting_opened',actorId:'system_tournament_lifecycle',metadata:{matchId}});
 eq((await deliverTournamentNotifications(db,id)).delivered,2,'only assigned opponents receive match voting notice');eq((await inbox(host)).length,1,'Host receives no routine match notice');eq((await inbox(second)).length,2,'essential voting ignores legacy vote opt out');
 const matchNotice=(await inbox(first)).find(row=>row.data().actionUrl.endsWith('/matches/'+matchId));assert.ok(matchNotice);checks++;
 for(const action of ['participant_registered','submission_submitted','submission_replaced']){
  await db.collection('tournamentAuditEvents').doc(id+'_'+action).set({tournamentId:id,action,actorId:first,metadata:{matchId}});
  eq((await deliverTournamentNotifications(db,id)).delivered,1,'routine event belongs to the actor only: '+action);
 }
 eq((await inbox(host)).length,1,'routine registrations and submissions do not spam Host');eq((await inbox(second)).length,2,'opponent does not receive another user registration or submission receipt');
 await db.collection('tournamentAuditEvents').doc(id+'_unscoped').set({tournamentId:id,action:'competitor_advanced',actorId:'existing_admin'});
 eq((await deliverTournamentNotifications(db,id)).delivered,0,'missing competitor scope never broadcasts advancement');eq((await inbox('existing_admin')).length,0,'Admin actor does not receive ordinary advancement spam');
 await db.collection('tournamentAuditEvents').doc(id+'_target').set({tournamentId:id,action:'competitor_advanced',actorId:'system_tournament_lifecycle',metadata:{targetCompetitorIds:[first]}});
 eq((await deliverTournamentNotifications(db,id)).delivered,1,'targeted progression stays scoped');eq((await inbox(second)).length,2,'unrelated opponent excluded');
 await db.collection('notificationPreferences').doc(first).set({email:true});
 await db.collection('tournamentAuditEvents').doc(id+'_email').set({tournamentId:id,action:'resume',actorId:first,metadata:{matchId}});
 eq((await deliverTournamentNotifications(db,id)).delivered,3,'material resume reaches affected competitors and Host');
 const outbox=await db.collection('tournamentEmailOutbox').where('tournamentId','==',id).get();eq(outbox.size,1,'only opted-in email recipient queued');eq((await deliverTournamentEmailOutbox(db,id)).enabled,false,'no provider fabricated');
 const sent=[];const adapter={resolveRecipient:async()=> 'isolated-recipient@example.test',send:async message=>{sent.push(message.idempotencyKey);}};
 const dispatches=await Promise.all([deliverTournamentEmailOutbox(db,id,adapter),deliverTournamentEmailOutbox(db,id,adapter)]);eq(dispatches.reduce((n,row)=>n+row.accepted,0),1,'concurrent email claim accepted once');eq(sent.length,1,'one fixture provider call');
 eq((await outbox.docs[0].ref.get()).data().recipientDeliveryVerified,false,'provider acceptance is not recipient delivery');eq((await deliverTournamentEmailOutbox(db,id,adapter)).accepted,0,'recovery never resends accepted email');
 eq((await notice.ref.get()).data().read,true,'later events still preserve old read status');
 console.log(`Tournament notifications: ${checks} actual event/recipient/preference/privacy/retry assertions passed; no real provider activated.`);
}finally{await db.terminate();}
