import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { INDIVIDUAL_TOURNAMENT_POLICY } from '../lib/individual-tournament-policy.ts';
import { finalizeVerifiedIndividualSettlement } from '../lib/server/tournament-settlement.ts';
import { clearIndividualTournamentEarnings } from '../lib/server/individual-automatic-settlement.ts';
import { reviewIndividualMatch } from '../lib/server/individual-match-review.ts';
import { correctIndividualPrizeResult } from '../lib/server/individual-prize-correction.ts';
import { escalateOverdueIndividualReviews, reviewIndividualStructuralConflict } from '../lib/server/individual-review-escalation.ts';
assert.match(process.env.GCLOUD_PROJECT??'',/^demo-/);assert.match(process.env.FIRESTORE_EMULATOR_HOST??'',/^127\.0\.0\.1:\d+$/);
const app=initializeApp({projectId:process.env.GCLOUD_PROJECT}),db=getFirestore(app);let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function fixture(){const id='correction_'+randomUUID(),batch=db.batch();
 batch.set(db.collection('tournaments').doc(id),{id,hostId:id+'_host',configVersion:4,productPolicyVersion:INDIVIDUAL_TOURNAMENT_POLICY,format:'single_elimination',participationMode:'individual',status:'under_review'});
 for(const position of [1,2,3,4]){batch.set(db.collection('users').doc(id+'_u'+position),{accountStatus:'active'});batch.set(db.collection('tournamentParticipants').doc(id+'_p'+position),{tournamentId:id,userId:id+'_u'+position,status:'active',lossCount:position===1?0:1});if(position<=3)batch.set(db.collection('tournamentPlacements').doc(id+'_'+position),{tournamentId:id,participantId:id+'_p'+position,placement:position,sourceMatchId:id+(position===3?'_bronze':'_final')});}
 batch.set(db.collection('tournamentMatches').doc(id+'_final'),{tournamentId:id,bracket:'winners',status:'confirmed',resultStatus:'confirmed',resultMethod:'votes',participantAId:id+'_p1',participantBId:id+'_p2',winnerParticipantId:id+'_p1',loserParticipantId:id+'_p2',voteSequence:1,voteCountA:0,voteCountB:1,votingClosesAt:new Date(Date.now()-1000).toISOString()});
 batch.set(db.collection('tournamentVotes').doc(id+'_vote'),{tournamentId:id,matchId:id+'_final',selectedParticipantId:id+'_p2',voteSequence:1,status:'recorded'});
 batch.set(db.collection('tournamentMatches').doc(id+'_bronze'),{tournamentId:id,bracket:'bronze',status:'confirmed',resultStatus:'confirmed',participantAId:id+'_p3',participantBId:id+'_p4',winnerParticipantId:id+'_p3',loserParticipantId:id+'_p4'});
 batch.set(db.collection('creatorPrizeFundingPayments').doc(id+'_prize'),{tournamentId:id,challengeId:id,userId:id+'_host',fundingSubjectType:'tournament',paymentPurpose:'prize_pool_funding',status:'confirmed',amountCents:10000,currency:'USD',webhookConfirmed:true});await batch.commit();await finalizeVerifiedIndividualSettlement(db,id);return id;}
const reviewInput=id=>({tournamentId:id,matchId:id+'_final',adminId:'existing_admin',decision:'hold',reason:'Verified historical result mismatch',evidenceReference:'persisted-vote-audit',requestKey:'review-case-0001'});
const correctionInput=id=>({tournamentId:id,matchId:id+'_final',caseKey:'review-case-0001',requestKey:'correction-request-0001',expectedVersion:0,adminId:'existing_admin',reason:'Recalculate from complete persisted votes',evidenceReference:'persisted-vote-audit',confirmed:true});
try {
 const id=await fixture();await reviewIndividualMatch(db,reviewInput(id));
 const input=correctionInput(id),results=await Promise.all([correctIndividualPrizeResult(db,input),correctIndividualPrizeResult(db,input)]);
 equal(results.filter(row=>!row.idempotent).length,1);equal(results[0].status,'corrected_unreleased');
 equal((await db.collection('tournamentMatches').doc(id+'_final').get()).data().winnerParticipantId,id+'_p2');
 equal((await db.collection('tournamentParticipants').doc(id+'_p1').get()).data().lossCount,1);equal((await db.collection('tournamentParticipants').doc(id+'_p2').get()).data().lossCount,0);
 equal((await db.collection('cashWallets').doc(id+'_u1').get()).data().pendingBalanceCents,3000);equal((await db.collection('cashWallets').doc(id+'_u2').get()).data().pendingBalanceCents,5000);equal((await db.collection('cashWallets').doc(id+'_u3').get()).data().pendingBalanceCents,2000);
 const ledger=await db.collection('cashLedger').where('challengeId','==',id).get();equal(ledger.docs.filter(row=>row.data().sourceType==='challenge_winner_prize').reduce((n,row)=>n+row.data().netAmountCents,0),10000);equal(ledger.docs.filter(row=>row.data().status==='corrected').length,2);
 equal((await db.collection('tournamentPrizeCorrections').where('tournamentId','==',id).get()).size,1);
 await assert.rejects(correctIndividualPrizeResult(db,{...input,reason:'Different request on reused key'}),/IDEMPOTENCY_CONFLICT/);checks++;
 equal((await clearIndividualTournamentEarnings(db,id,new Date(Date.now()+73*3600000))).cleared,3);
 for(const scenario of ['reserved','withdrawn','stale','invalid_votes']){const target=await fixture();await reviewIndividualMatch(db,reviewInput(target));const credit=(await db.collection('cashLedger').where('challengeId','==',target).get()).docs.find(row=>row.data().placement===1);const before=(await db.collection('cashWallets').doc(target+'_u1').get()).data();
  if(scenario==='reserved'){await credit.ref.update({reservedAmountCents:100});await db.collection('withdrawalRequests').doc(target).set({sourceIds:[credit.id],status:'pending_review',amountCents:100});}
  if(scenario==='withdrawn')await credit.ref.update({withdrawnAmountCents:100});
  if(scenario==='stale')await db.collection('tournaments').doc(target).update({prizeCorrectionVersion:1});
  if(scenario==='invalid_votes')await db.collection('tournamentVotes').doc(target+'_vote').update({voteSequence:2});
  if(['reserved','withdrawn'].includes(scenario)){equal((await correctIndividualPrizeResult(db,correctionInput(target))).status,'manual_recovery_required');equal((await db.collection('tournamentMatches').doc(target+'_final').get()).data().winnerParticipantId,target+'_p1');if(scenario==='reserved')equal((await db.collection('withdrawalRequests').doc(target).get()).data().financialHold,true);}
  else {await assert.rejects(correctIndividualPrizeResult(db,correctionInput(target)));checks++;}
  equal((await db.collection('cashWallets').doc(target+'_u1').get()).data(),before);
 }
 const overdue=await fixture();await reviewIndividualMatch(db,reviewInput(overdue));const future=new Date(Date.now()+74*3600000);equal((await escalateOverdueIndividualReviews(db,overdue,future)).escalated,1);equal((await escalateOverdueIndividualReviews(db,overdue,future)).escalated,0);equal((await db.collection('tournamentReviewEscalations').where('tournamentId','==',overdue).get()).size,1);
 await reviewIndividualMatch(db,{...reviewInput(overdue),decision:'confirm_existing_result'},future);equal((await db.collection('tournamentReviewEscalations').where('tournamentId','==',overdue).get()).docs[0].data().status,'resolved');
 const reservedReview=await fixture(),reservedCredit=(await db.collection('cashLedger').where('challengeId','==',reservedReview).get()).docs.find(row=>row.data().placement===1);
 await db.collection('withdrawalRequests').doc(reservedReview).set({sourceIds:[reservedCredit.id],status:'pending_review',riskStatus:'pending_review',financialHold:false});
 await reviewIndividualMatch(db,reviewInput(reservedReview));equal((await db.collection('withdrawalRequests').doc(reservedReview).get()).data().financialHold,true);
 await reviewIndividualMatch(db,{...reviewInput(reservedReview),decision:'confirm_existing_result'});equal((await db.collection('withdrawalRequests').doc(reservedReview).get()).data().financialHold,false);equal((await db.collection('withdrawalRequests').doc(reservedReview).get()).data().riskStatus,'pending_review');
 const structural='structural_'+randomUUID();await db.collection('tournaments').doc(structural).set({configVersion:4,productPolicyVersion:INDIVIDUAL_TOURNAMENT_POLICY,participationMode:'individual',format:'double_elimination',status:'active'});await db.collection('tournamentMatches').doc(structural+'_match').set({tournamentId:structural,bracket:'winners',status:'double_forfeit_hold',participantAId:structural+'_a',participantBId:structural+'_b'});for(const side of ['a','b']){await db.collection('tournamentParticipants').doc(structural+'_'+side).set({tournamentId:structural,userId:structural+'_'+side,status:'active',lossCount:1});await db.collection('users').doc(structural+'_'+side).set({accountStatus:'active'});}
 const resolution=await reviewIndividualStructuralConflict(db,{tournamentId:structural,matchId:structural+'_match',adminId:'existing_admin',reason:'Both retain legitimate first loss',evidenceReference:'verified-double-forfeit',requestKey:'structural-review-0001'});equal(resolution.status,'held_locked_policy_conflict');equal(resolution.winnerSelected,false);equal((await db.collection('tournamentMatches').where('tournamentId','==',structural).get()).size,1);equal((await db.collection('tournamentParticipants').doc(structural+'_a').get()).data().lossCount,1);
 const upstream=await fixture(),playedId=upstream+'_played';
 await db.collection('tournamentMatches').doc(upstream+'_final').update({nextMatchId:playedId,nextSlot:'A'});
 const played={tournamentId:upstream,status:'confirmed',resultStatus:'confirmed',participantAId:upstream+'_p1',participantBId:upstream+'_p3',winnerParticipantId:upstream+'_p1',loserParticipantId:upstream+'_p3',verifiedScoreA:9,verifiedScoreB:4};
 await db.collection('tournamentMatches').doc(playedId).set(played);
 const upstreamCredits=(await db.collection('cashLedger').where('challengeId','==',upstream).get()).docs;
 const firstCredit=upstreamCredits.find(row=>row.data().placement===1),secondCredit=upstreamCredits.find(row=>row.data().placement===2),thirdCredit=upstreamCredits.find(row=>row.data().placement===3);
 await secondCredit.ref.update({withdrawnAmountCents:100});
 await db.collection('withdrawalRequests').doc(upstream).set({status:'pending_review',sourceIds:[firstCredit.id],financialHold:false});
 const walletsBefore=await Promise.all([1,2,3].map(async n=>(await db.collection('cashWallets').doc(upstream+'_u'+n).get()).data()));
 const lossesBefore=await Promise.all([1,2,3].map(async n=>(await db.collection('tournamentParticipants').doc(upstream+'_p'+n).get()).data().lossCount));
 await reviewIndividualMatch(db,reviewInput(upstream));
 const policyResult=await correctIndividualPrizeResult(db,correctionInput(upstream));equal(policyResult.status,'awaiting_competitive_policy');
 const openCase=(await db.collection('tournamentDisputes').where('tournamentId','==',upstream).get()).docs[0].data();equal(openCase.status,'open');equal(openCase.competitivePolicyRequired,true);equal(openCase.correctionProposal.proposedResult.winnerParticipantId,upstream+'_p2');equal(openCase.correctionProposal.originalResult.winnerParticipantId,upstream+'_p1');
 equal((await db.collection('tournamentMatches').doc(upstream+'_final').get()).data().winnerParticipantId,upstream+'_p1');
 const playedAfter=(await db.collection('tournamentMatches').doc(playedId).get()).data();equal(playedAfter.winnerParticipantId,played.winnerParticipantId);equal(playedAfter.verifiedScoreA,9);equal(playedAfter.verifiedScoreB,4);equal(playedAfter.resultStatus,'under_review');
 equal((await db.collection('tournamentMatches').doc(upstream+'_bronze').get()).data().resultStatus,'confirmed');equal((await thirdCredit.ref.get()).data().disputeRestricted??false,false);
 equal((await db.collection('withdrawalRequests').doc(upstream).get()).data().financialHold,true);equal((await secondCredit.ref.get()).data().withdrawnAmountCents,100);
 equal((await db.collection('tournamentSettlementHolds').where('tournamentId','==',upstream).get()).docs.some(row=>row.data().status==='manual_recovery_required'),true);
 equal(await Promise.all([1,2,3].map(async n=>(await db.collection('cashWallets').doc(upstream+'_u'+n).get()).data())),walletsBefore);equal(await Promise.all([1,2,3].map(async n=>(await db.collection('tournamentParticipants').doc(upstream+'_p'+n).get()).data().lossCount)),lossesBefore);
 equal((await correctIndividualPrizeResult(db,correctionInput(upstream))).idempotent,true);
 await assert.rejects(reviewIndividualMatch(db,{...reviewInput(upstream),decision:'confirm_existing_result'}),/COMPETITIVE_POLICY_REQUIRED/);checks++;
 equal((await db.collection('tournamentDisputes').where('tournamentId','==',upstream).get()).docs[0].data().status,'open');
 equal((await db.collection('tournamentMatches').where('tournamentId','==',upstream).get()).size,3);
 console.log(`Individual corrections/review: ${checks} actual ledger, withdrawal, verified-result, escalation and locked-policy assertions passed. No provider called.`);
} finally {await app.delete();}
