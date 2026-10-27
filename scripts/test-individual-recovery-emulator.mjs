import assert from 'node:assert/strict';
import { queueTournamentSubmissionReminders } from '../lib/server/tournament-submission-reminders.ts';
import { deliverTournamentEmailOutbox } from '../lib/server/normal-email.ts';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { generateTournamentBracket } from '../lib/server/tournament-operations.ts';
import { planIndividualBracketRecovery, recoverIndividualTournamentBracket } from '../lib/server/tournament-bracket-recovery.ts';
import { processTournamentLifecycleAction } from '../lib/server/tournament-lifecycle-scheduler.ts';
import { INDIVIDUAL_TOURNAMENT_POLICY } from '../lib/individual-tournament-policy.ts';
assert.match(process.env.GCLOUD_PROJECT??'',/^demo-/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST??'',/^127\.0\.0\.1:\d+$/);
const db=getFirestore(initializeApp({projectId:process.env.GCLOUD_PROJECT}));
let checks=0;const check=(v,label)=>{assert.ok(v,label);checks++;};
const now=new Date('2026-10-27T12:00:00Z');
for(const capacity of [4,8,16,32])for(const format of ['single_elimination','double_elimination']){
 const id=`recovery_${capacity}_${format}`;
 const tournament={id,hostId:'host',configVersion:4,productPolicyVersion:INDIVIDUAL_TOURNAMENT_POLICY,participationMode:'individual',participantCapacity:capacity,participantCount:capacity,status:'active',format,resultMethod:'votes',thirdPlaceMethod:'third_place_match',seedingMethod:'random',submissionDurationHours:48};
 const participants=Array.from({length:capacity},(_,i)=>({id:`${id}_p${i}`,tournamentId:id,userId:'u'+i,status:'active',lossCount:0,seed:i+1}));
 const graph=generateTournamentBracket({tournament,participants,existingMatches:[]});check(graph.created,id+' generated');
 const feeds=graph.matches.flatMap(row=>[...(row.nextMatchId?[row.nextMatchId+'|'+row.nextSlot]:[]),...(row.loserNextMatchId?[row.loserNextMatchId+'|'+row.loserNextSlot]:[])]);
 check(new Set(feeds).size===feeds.length,id+' every dependent slot has exactly one structural source');
 const first=graph.matches.filter(m=>m.bracket==='winners'&&m.roundNumber===1),bad=first[0],good=first[1];
 bad.status='submissions_open';bad.noSubmissionExtensionUsed=true;bad.submissionDeadlineAt=now.toISOString();
 good.status='confirmed';good.resultStatus='confirmed';good.winnerParticipantId=good.participantAId;good.loserParticipantId=good.participantBId;
 participants.find(p=>p.id===good.loserParticipantId).lossCount=1;
 const batch=db.batch();batch.set(db.collection('tournaments').doc(id),tournament);
 for(const row of participants){batch.set(db.collection('tournamentParticipants').doc(row.id),row);batch.set(db.collection('users').doc(row.userId),{accountStatus:'active'});}
 for(const row of graph.matches)batch.set(db.collection('tournamentMatches').doc(row.id),row);
 for(const row of graph.rounds)batch.set(db.collection('tournamentRounds').doc(row.id),row);
 await batch.commit();
 const run=()=>processTournamentLifecycleAction({db,id,tournament,action:'process_match_deadlines',actorId:'system_tournament_lifecycle',now});
 await Promise.all([run(),run()]);
 for(const competitorId of [bad.participantAId,bad.participantBId]){
  const saved=(await db.collection('tournamentParticipants').doc(competitorId).get()).data();check(saved.lossCount===1,id+' loss exactly once');check(saved.status===(format==='double_elimination'?'active':'eliminated'),id+' legitimate eligibility');
 }
 const source=(await db.collection('tournamentMatches').doc(bad.id).get()).data();check(source.status==='double_forfeit_hold'&&!source.winnerParticipantId,id+' no invented winner');
 const target=(await db.collection('tournamentMatches').doc(bad.nextMatchId).get()).data();
 if(target.nextMatchId){check(target.status==='bye'&&target.byeParticipantId===good.winnerParticipantId,id+' survivor has valid bye');check(!target.winnerParticipantId&&!target.loserParticipantId,id+' bye is not a match victory');}
 else check(target.status==='held',id+' indeterminate championship held');
 if(format==='double_elimination'){
  const loserTarget=(await db.collection('tournamentMatches').doc(bad.loserNextMatchId).get()).data();check(loserTarget.status==='held',id+' only conflicting loser path held');
  check(![bad.participantAId,bad.participantBId].includes(loserTarget.participantAId)&&![bad.participantAId,bad.participantBId].includes(loserTarget.participantBId),id+' neither entrant arbitrarily selected');
 }
 const retry=await recoverIndividualTournamentBracket(db,id,now);check(retry.updated===0,id+' recovery replay has no writes');
 check((await db.collection('tournamentMatches').where('tournamentId','==',id).get()).size===graph.matches.length,id+' no extra play-in');
 const legacy=planIndividualBracketRecovery({...tournament,configVersion:3},graph.matches,participants,now);check(legacy.updates.length===0,id+' legacy unchanged');
}
const leaseId='recovery_4_single_elimination',lease=db.collection('tournamentRecoveryLeases').doc(leaseId);
await lease.set({owner:'other_worker',expiresAtMs:Date.now()+120000});
check((await recoverIndividualTournamentBracket(db,leaseId,now)).status==='recovery_in_progress','active lease coalesces delivery without graph mutation or arbitrary retry');
check((await lease.get()).data().owner==='other_worker','another worker lease remains intact');
await lease.update({expiresAtMs:Date.now()-1});
check((await recoverIndividualTournamentBracket(db,leaseId,now)).updated===0,'expired crash lease permits safe idempotent recovery');
check(!(await lease.get()).exists,'successful recovery releases only its owned lease');
console.log(`Individual recovery emulator: ${checks} assertions passed across all capacities and formats.`);

const reminderNow=new Date(),reminderId='reminder_matrix',deadline=new Date(reminderNow.getTime()+6*3600000).toISOString();
await db.collection('tournaments').doc(reminderId).set({configVersion:4,productPolicyVersion:INDIVIDUAL_TOURNAMENT_POLICY,status:'active'});
await db.collection('tournamentMatches').doc('reminder_match').set({tournamentId:reminderId,status:'submissions_open',participantAId:'reminder_a',participantBId:'reminder_b',submissionDeadlineAt:deadline});
for(const id of ['a','b']){await db.collection('tournamentParticipants').doc('reminder_'+id).set({tournamentId:reminderId,userId:'reminder_user_'+id,status:'active'});await db.collection('notificationPreferences').doc('reminder_user_'+id).set({email:true});await db.collection('users').doc('reminder_user_'+id).set({accountStatus:'active'});}
const submissionRef=db.collection('tournamentSubmissions').doc(reminderId+'_reminder_match_reminder_b');await submissionRef.set({status:'submitted'});
await Promise.all([queueTournamentSubmissionReminders(db,reminderId,reminderNow),queueTournamentSubmissionReminders(db,reminderId,reminderNow)]);
let notices=await db.collection('tournamentReminderDeliveries').where('tournamentId','==',reminderId).get();check(notices.size===1,'6-hour reminder deduplicated and valid partner omitted');check(notices.docs[0].data().userId==='reminder_user_a','only missing competitor reminded');
await queueTournamentSubmissionReminders(db,reminderId,new Date(reminderNow.getTime()+5*3600000));notices=await db.collection('tournamentReminderDeliveries').where('tournamentId','==',reminderId).get();check(notices.size===2,'separate one-hour reminder');
await db.collection('tournamentSubmissions').doc(reminderId+'_reminder_match_reminder_a').set({status:'approved'});
let sends=0;await deliverTournamentEmailOutbox(db,reminderId,{resolveRecipient:async()=> 'demo@example.test',send:async()=>{sends++;}});check(sends===0,'queued reminders cancelled after valid entry');
const emails=await db.collection('tournamentEmailOutbox').where('tournamentId','==',reminderId).get();check(emails.docs.every(row=>row.data().reason==='SUBMISSION_REMINDER_STALE'&&row.data().recipientDeliveryVerified===false),'stale email never marked delivered');
await queueTournamentSubmissionReminders(db,reminderId,new Date(Date.parse(deadline)+1));check((await db.collection('tournamentReminderDeliveries').where('tournamentId','==',reminderId).get()).size===2,'expired match creates no reminders');
console.log('Submission reminders: 6 queue, consent, deduplication and stale-delivery assertions passed.');
