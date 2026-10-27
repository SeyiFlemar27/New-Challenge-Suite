import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { finalizeVerifiedIndividualSettlement } from '../lib/server/tournament-settlement.ts';
import { clearIndividualTournamentEarnings } from '../lib/server/individual-automatic-settlement.ts';
import { INDIVIDUAL_TOURNAMENT_POLICY } from '../lib/individual-tournament-policy.ts';
assert.match(process.env.GCLOUD_PROJECT??'',/^demo-/);assert.match(process.env.FIRESTORE_EMULATOR_HOST??'',/^127\.0\.0\.1:\d+$/);
const db=getFirestore(initializeApp({projectId:process.env.GCLOUD_PROJECT}));let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function fixture(){const id='auto_'+randomUUID(),batch=db.batch();
 batch.set(db.collection('tournaments').doc(id),{id,hostId:id+'_host',configVersion:4,productPolicyVersion:INDIVIDUAL_TOURNAMENT_POLICY,format:'single_elimination',participationMode:'individual',status:'under_review'});
 for(const position of [1,2,3]){const userId=id+'_u'+position,participantId=id+'_p'+position;batch.set(db.collection('users').doc(userId),{accountStatus:'active'});batch.set(db.collection('tournamentParticipants').doc(participantId),{tournamentId:id,userId,status:'active'});batch.set(db.collection('tournamentPlacements').doc(id+'_'+position),{tournamentId:id,participantId,placement:position,sourceMatchId:id+(position===3?'_bronze':'_final')});}
 batch.set(db.collection('tournamentMatches').doc(id+'_final'),{tournamentId:id,bracket:'winners',status:'confirmed',resultStatus:'confirmed',participantAId:id+'_p1',participantBId:id+'_p2',winnerParticipantId:id+'_p1',loserParticipantId:id+'_p2'});
 batch.set(db.collection('tournamentMatches').doc(id+'_bronze'),{tournamentId:id,bracket:'bronze',status:'confirmed',resultStatus:'confirmed',participantAId:id+'_p3',participantBId:id+'_p4',winnerParticipantId:id+'_p3',loserParticipantId:id+'_p4'});
 batch.set(db.collection('tournamentEntryPayments').doc(id+'_entry'),{tournamentId:id,status:'confirmed',amountCents:10000,currency:'USD',webhookConfirmed:true,providerPaymentIntentId:id+'_pi'});
 batch.set(db.collection('creatorPrizeFundingPayments').doc(id+'_prize'),{tournamentId:id,challengeId:id,userId:id+'_host',fundingSubjectType:'tournament',paymentPurpose:'prize_pool_funding',status:'confirmed',amountCents:10000,currency:'USD',webhookConfirmed:true});await batch.commit();return id;}
const id=await fixture(),results=await Promise.all([finalizeVerifiedIndividualSettlement(db,id),finalizeVerifiedIndividualSettlement(db,id)]);
equal(results.filter(row=>row.settlement.created).length,1);equal(results[0].settlement.breakdown.winnerDistribution.map(row=>row.netAmountCents),[8250,4950,3300]);
equal((await db.collection('tournaments').doc(id).get()).data().automaticWinnerVerificationStatus,'verified');equal((await db.collection('tournaments').doc(id).get()).data().adminWinnerApprovalStatus,undefined);
equal((await clearIndividualTournamentEarnings(db,id)).cleared,0);
const after=new Date(Date.now()+73*3600000);
await db.collection('tournamentDisputes').doc(id+'_dispute').set({tournamentId:id,status:'open'});
await assert.rejects(clearIndividualTournamentEarnings(db,id,after),/SETTLEMENT_REVIEW_REQUIRED/);checks++;
await db.collection('tournamentDisputes').doc(id+'_dispute').update({status:'resolved'});
const clear=await Promise.all([clearIndividualTournamentEarnings(db,id,after),clearIndividualTournamentEarnings(db,id,after)]);equal(clear.reduce((n,row)=>n+row.cleared,0),3);
for(const[position,amount]of [[1,8250],[2,4950],[3,3300]]){const wallet=(await db.collection('cashWallets').doc(id+'_u'+position).get()).data();equal(wallet.availableBalanceCents,amount);equal(wallet.pendingBalanceCents,0);equal(wallet.withdrawalsEnabled,false);}
equal((await clearIndividualTournamentEarnings(db,id,after)).cleared,0);
for(const scenario of ['account','blocked','disabled','dispute','funding','missing','legacy']){const target=await fixture();
 if(scenario==='account')await db.collection('users').doc(target+'_u1').update({payoutHold:true});
 if(scenario==='blocked')await db.collection('users').doc(target+'_u1').update({accountStatus:'blocked'});
 if(scenario==='disabled')await db.collection('users').doc(target+'_u1').update({disabled:true});
 if(scenario==='dispute')await db.collection('tournamentDisputes').doc(target).set({tournamentId:target,status:'open'});
 if(scenario==='funding')await db.collection('tournamentEntryPayments').doc(target+'_entry').update({stripeDisputeRestricted:true});
 if(scenario==='missing')await db.collection('tournamentPlacements').doc(target+'_3').delete();
 if(scenario==='legacy')await db.collection('tournaments').doc(target).update({configVersion:3});
 await assert.rejects(finalizeVerifiedIndividualSettlement(db,target));checks++;equal((await db.collection('cashLedger').where('challengeId','==',target).get()).size,0);
}
console.log(`Automatic Individual settlement emulator: ${checks} accounting, holds, idempotency and legacy assertions passed; no provider called.`);
