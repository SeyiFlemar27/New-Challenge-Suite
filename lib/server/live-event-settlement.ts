import {createHash,randomUUID} from "node:crypto";
import {FieldValue, type Firestore, type Transaction} from "firebase-admin/firestore";
import {eventKind, eventOptions, liveEventWinnerShares, LiveEventPolicyError, rankPhysicalResults} from "@/lib/live-event-policy";
import {readLiveEvent} from "@/lib/server/live-event-admission";
import {cashLedgerEntry} from "@/lib/server/challenge-settlement";
import {CASH_EARNING_HOLD_HOURS, holdUntilFromApproval} from "@/lib/server/payout-structure";

const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const amount=(value:unknown)=>{if(!Number.isSafeInteger(value)||Number(value)<0)throw new LiveEventPolicyError("FINANCIAL_SOURCE_INVALID");return Number(value);};
const settlementHistory=(db:Firestore,tx:Transaction,eventId:string)=>tx.get(db.collection("challengeSettlements").where("challengeId","==",eventId).limit(2));

/** Operational serialization only; money remains in the original atomic ledger transaction. */
async function financialAction(db:Firestore,eventId:string,run:(lease:{ref:FirebaseFirestore.DocumentReference;token:string})=>Promise<{settlementId:string;repeated:boolean;status:string}>){
  const ref=db.collection("liveEventFinancialOperationLeases").doc(digest(eventId)),token=randomUUID(),now=Date.now();
  const claimed=await db.runTransaction(async tx=>{const current=await tx.get(ref);if(current.data()?.state==="running"&&Date.parse(String(current.data()?.leaseUntil))>now)return false;tx.set(ref,{eventId,token,state:"running",leaseUntil:new Date(now+300000).toISOString(),updatedAt:new Date(now).toISOString()});return true;});
  if(!claimed)return {settlementId:`live_event_${digest(eventId)}`,repeated:true,status:"financial_review_in_progress"};
  try{return await run({ref,token});}
  finally{
    // A crash or unavailable database leaves a bounded lease, never a fabricated completion.
    try{await db.runTransaction(async tx=>{const current=await tx.get(ref);if(current.data()?.token===token)tx.update(ref,{state:"idle",leaseUntil:null,updatedAt:new Date().toISOString()});});}catch{/* Recovery may acquire the expired lease; ledger idempotency remains authoritative. */}
  }
}
async function verifyFinancialLease(tx:Transaction,lease:{ref:FirebaseFirestore.DocumentReference;token:string}){
  const current=await tx.get(lease.ref),expires=Date.parse(String(current.data()?.leaseUntil));if(current.data()?.token!==lease.token||current.data()?.state!=="running"||!Number.isFinite(expires)||expires<=Date.now())throw new LiveEventPolicyError("FINANCIAL_ACTION_LEASE_CHANGED");
}

/** One transactional evidence snapshot for preview AND approval. No client totals or placements are accepted. */
async function evidence(db:Firestore,tx:Transaction,eventId:string,allocatedSettlementId?:string,history?:Awaited<ReturnType<typeof settlementHistory>>){
  const state=await readLiveEvent(db,tx,eventId),event=state.event;
  if(!state.challengeExists||event.isLiveEvent!==true||event.eventApprovalStatus!=="approved"||eventKind(event)!=="physical_competition"||!event.resultsPublishedAt||["cancelled","deleted"].includes(String(event.status)))throw new LiveEventPolicyError("PUBLISHED_RESULTS_REQUIRED");
  if(event.stripeDisputeRestricted||event.settlementRestricted||event.liveEventFinancialReviewRequired||event.financialRestriction)throw new LiveEventPolicyError("FINANCIAL_RECONCILIATION_REQUIRED");
  // Keep a deterministic read order. Parallel streams on an aborted transaction
  // can obscure the original retryable contention error with a closed-stream error.
  const creator=await tx.get(db.collection("creatorPrizeFundingPayments").where("challengeId","==",eventId).limit(101));
  const sponsor=await tx.get(db.collection("sponsorContributions").where("challengeId","==",eventId).limit(101));
  const ledger=await tx.get(db.collection("cashLedger").where("eventId","==",eventId).limit(301));
  const registrations=await tx.get(db.collection("liveEventRegistrations").where("eventId","==",eventId).limit(101));
  const scores=await tx.get(db.collection("liveEventPhysicalScores").where("eventId","==",eventId).limit(101));
  const refunds=await tx.get(db.collection("refundCases").where("eventId","==",eventId).limit(101));
  const disputes=await tx.get(db.collection("chargebackCases").where("eventId","==",eventId).limit(101));
  const previousSettlements=history??await settlementHistory(db,tx,eventId);
  if(previousSettlements.docs.some(doc=>doc.id!==`live_event_${digest(eventId)}`))throw new LiveEventPolicyError("FINANCIAL_SOURCE_ALREADY_ALLOCATED");
  if([creator,sponsor,registrations,scores,refunds,disputes].some(rows=>rows.size>100)||ledger.size>300)throw new LiveEventPolicyError("FINANCIAL_PARTITION_REVIEW_REQUIRED");
  // A final provider outcome does not itself authorize an accounting release.
  if(refunds.docs.some(row=>!["completed","refunded","succeeded","rejected","cancelled"].includes(String(row.data().status)))||disputes.docs.some(row=>row.data().resolutionRequired!==false))throw new LiveEventPolicyError("FINANCIAL_RECONCILIATION_REQUIRED");
  const published=event.publishedPhysicalResults;
  const count=Number(eventOptions(event).winnerCount),judges=Number(event.physicalJudgeCountLocked);
  if(![1,2,3].includes(count)||!Array.isArray(published)||published.length!==count||!Number.isSafeInteger(judges)||judges<1)throw new LiveEventPolicyError("WINNER_EVIDENCE_INVALID");
  const ranking=rankPhysicalResults(registrations.docs.filter(doc=>doc.data().kind==="competitor"&&doc.data().eligible===true&&doc.data().status==="checked_in").map(doc=>{
    const row=doc.data(),score=scores.docs.find(item=>item.data().userId===row.userId)?.data();
    return {userId:String(row.userId),eligible:true,checkedIn:Boolean(row.checkedInAt),scores:score?.attendanceCheckedInAt===row.checkedInAt&&Array.isArray(score?.scores)?score.scores:[]};
  }),judges,count);
  if(published.some((row,index)=>row.userId!==ranking[index]?.userId||row.score!==ranking[index]?.score))throw new LiveEventPolicyError("WINNER_EVIDENCE_INVALID");
  const winners=published.map((row,index)=>{
    const registration=registrations.docs.find(item=>item.data().userId===row.userId)?.data();
    const score=scores.docs.find(item=>item.data().userId===row.userId)?.data();
    if(typeof row.userId!=="string"||row.placement!==index+1||!registration||registration.kind!=="competitor"||registration.eligible!==true||registration.status!=="checked_in"||!registration.checkedInAt||!score||score.attendanceCheckedInAt!==registration.checkedInAt||!Array.isArray(score.scores)||score.scores.length!==judges||score.scores.some((value:unknown)=>typeof value!=="number"||!Number.isFinite(value)||value<0||value>10))throw new LiveEventPolicyError("WINNER_EVIDENCE_INVALID");
    return {userId:row.userId as string,placement:index+1};
  });
  if(new Set(winners.map(row=>row.userId)).size!==count)throw new LiveEventPolicyError("WINNER_EVIDENCE_INVALID");
  const sources:Array<{path:string;amountCents:number}>=[];
  for(const [rows,purpose] of [[creator,"prize_pool_funding"],[sponsor,"sponsor_funding"]] as const){
    for(const doc of rows.docs){const row=doc.data();
      // Application expiry/failure alone is not authoritative evidence that a
      // provider charge can never complete. Unreconciled attempts stay on hold.
      if(row.status!=="confirmed"||row.webhookConfirmed!==true||row.currency!=="USD"||row.paymentPurpose!==purpose||row.stripeDisputeRestricted||row.settlementRestricted||row.refundedAt||row.financialRestriction||row.refundLiabilityStatus==="pending")throw new LiveEventPolicyError("FINANCIAL_RECONCILIATION_REQUIRED");
      if(row.liveEventSettlementId&&row.liveEventSettlementId!==allocatedSettlementId)throw new LiveEventPolicyError("FINANCIAL_SOURCE_ALREADY_ALLOCATED");
      sources.push({path:doc.ref.path,amountCents:amount(row.amountCents)});
    }
  }
  const entry=ledger.docs.filter(doc=>{const row=doc.data();return row.sourceType==="host_event_revenue"&&row.revenueType==="entry_fee"&&row.shareType==="winner_share";});
  for(const doc of entry){const row=doc.data();
    if(amount(row.netAmountCents)===0)continue;
    if(typeof row.sourceId!=="string"||row.sourceId.includes("/"))throw new LiveEventPolicyError("FINANCIAL_SOURCE_INVALID");
    const booking=await tx.get(db.collection("liveEventBookings").doc(row.sourceId)),value=booking.data();
    if(!value||value.eventId!==eventId||value.paymentConfirmed!==true||value.stripeDisputeRestricted||value.fraudReviewRequired||value.status!=="confirmed"||Number(value.refundReservedCents??0)>0||row.stripeDisputeRestricted||row.currency!=="USD"||row.direction!=="credit"||!["held","available"].includes(String(row.status)))throw new LiveEventPolicyError("FINANCIAL_RECONCILIATION_REQUIRED");
    if(row.liveEventSettlementId&&row.liveEventSettlementId!==allocatedSettlementId)throw new LiveEventPolicyError("FINANCIAL_SOURCE_ALREADY_ALLOCATED");
    sources.push({path:doc.ref.path,amountCents:amount(row.netAmountCents)});
  }
  sources.sort((a,b)=>a.path.localeCompare(b.path));
  if(sources.length>450)throw new LiveEventPolicyError("FINANCIAL_PARTITION_REVIEW_REQUIRED");
  const totalCents=amount(sources.reduce((sum,row)=>sum+row.amountCents,0));
  const allocations=liveEventWinnerShares(totalCents,count).map((amountCents,index)=>({...winners[index],amountCents}));
  const judgingEvidence=scores.docs.map(doc=>({path:doc.ref.path,userId:doc.data().userId,scores:doc.data().scores,attendanceCheckedInAt:doc.data().attendanceCheckedInAt})).sort((a,b)=>a.path.localeCompare(b.path));
  const snapshot={eventId,resultsPublishedAt:event.resultsPublishedAt,resultsVersion:event.physicalResultsVersion,judgingEvidence,sources,allocations,totalCents};
  return {...state,...snapshot,fingerprint:digest(snapshot)};
}

/** Internal clearance only: existing withdrawal/KYC/provider controls still apply independently. */
export async function clearLiveEventWinnerCredits(db:Firestore,input:{eventId:string;adminId:string;reason:string;confirmed:boolean}){
  if(!input.confirmed||!input.adminId||input.reason.trim().length<5||input.reason.length>1000)throw new LiveEventPolicyError("CONFIRMATION_REASON_REQUIRED",422);
  const settlementId=`live_event_${digest(input.eventId)}`,ref=db.collection("challengeSettlements").doc(settlementId);
  return financialAction(db,input.eventId,lease=>db.runTransaction(async tx=>{
    await verifyFinancialLease(tx,lease);
    const history=await settlementHistory(db,tx,input.eventId),stored=history.docs.find(row=>row.id===settlementId),settlement=stored?.data();
    if(!settlement||settlement.type!=="live_event_winner_settlement")throw new LiveEventPolicyError("FINANCIAL_APPROVAL_REQUIRED");
    if(settlement.status==="available"){
      const current=await evidence(db,tx,input.eventId,settlementId,history);
      if(current.fingerprint!==settlement.evidenceFingerprint)throw new LiveEventPolicyError("SETTLEMENT_CHANGED");
      return {settlementId,repeated:true,status:"available"};
    }
    const now=Date.now(),approved=Date.parse(settlement.approvedAt),hold=Date.parse(settlement.holdUntil);
    if(settlement.status!=="approved_pending_clearance"||!Number.isFinite(approved)||!Number.isFinite(hold)||now<Math.max(hold,approved+CASH_EARNING_HOLD_HOURS*3600000))throw new LiveEventPolicyError("CLEARANCE_PERIOD_PENDING");
    const value=await evidence(db,tx,input.eventId,settlementId,history);
    if(value.fingerprint!==settlement.evidenceFingerprint)throw new LiveEventPolicyError("SETTLEMENT_CHANGED");
    const allocations=value.allocations.filter(row=>row.amountCents>0);
    const creditRefs=allocations.map(row=>db.collection("cashLedger").doc(`${settlementId}_winner_${row.placement}`));
    const walletRefs=allocations.map(row=>db.collection("cashWallets").doc(row.userId));
    const credits=creditRefs.length?await tx.getAll(...creditRefs):[],wallets=walletRefs.length?await tx.getAll(...walletRefs):[];
    allocations.forEach((row,index)=>{
      const credit=credits[index].data(),wallet=wallets[index].data();
      if(!credit||credit.userId!==row.userId||credit.status!=="pending_hold"||credit.amountCents!==row.amountCents||credit.stripeDisputeRestricted||credit.disputeRestricted||credit.financialRestriction||!Number.isFinite(Date.parse(credit.holdUntil))||!Number.isFinite(Date.parse(credit.createdAt))||now<Math.max(Date.parse(credit.holdUntil),Date.parse(credit.createdAt)+CASH_EARNING_HOLD_HOURS*3600000)||!wallet||!Number.isSafeInteger(wallet.lockedBalanceCents)||wallet.lockedBalanceCents<row.amountCents||wallet.availableBalanceCents!=null&&(!Number.isSafeInteger(wallet.availableBalanceCents)||wallet.availableBalanceCents<0)||!Number.isSafeInteger(Number(wallet.availableBalanceCents??0)+row.amountCents))throw new LiveEventPolicyError("FINANCIAL_RECONCILIATION_REQUIRED");
    });
    const iso=new Date(now).toISOString();
    allocations.forEach((row,index)=>{
      tx.update(creditRefs[index],{status:"available",balanceBucket:"available",availableAmountCents:row.amountCents,reservedAmountCents:0,availableAt:iso,settlementRestricted:false,clearanceReviewRequired:false,updatedAt:iso});
      tx.update(walletRefs[index],{lockedBalanceCents:FieldValue.increment(-row.amountCents),availableBalanceCents:FieldValue.increment(row.amountCents),updatedAt:iso});
    });
    tx.update(ref,{status:"available",clearedBy:input.adminId,clearedAt:iso,clearanceReason:input.reason});
    const patch={eventPrizeSettlementStatus:"available",updatedAt:iso};tx.update(value.ref,patch);if(value.challengeExists)tx.update(value.challengeRef,patch);
    tx.create(db.collection("auditLogs").doc(`${settlementId}_clearance`),{actorId:input.adminId,actorType:"admin",action:"live_event.winner_credits_cleared",eventId:input.eventId,reason:input.reason,before:{status:settlement.status},after:{status:"available",creditIds:creditRefs.map(row=>row.id),externalPayoutExecuted:false},createdAt:iso});
    return {settlementId,repeated:false,status:"available"};
  }));
}

export async function previewLiveEventSettlement(db:Firestore,eventId:string){
  return db.runTransaction(async tx=>{
    const settlementId=`live_event_${digest(eventId)}`,history=await settlementHistory(db,tx,eventId),prior=history.docs.find(row=>row.id===settlementId);
    const value=await evidence(db,tx,eventId,prior?settlementId:undefined,history);
    if(prior&&prior.data().evidenceFingerprint!==value.fingerprint)throw new LiveEventPolicyError("SETTLEMENT_CHANGED");
    return {eventId,fingerprint:value.fingerprint,judgingEvidence:value.judgingEvidence,sources:value.sources,allocations:value.allocations,totalCents:value.totalCents,status:prior?String(prior.data().status):"pending_financial_review",approvalRecorded:Boolean(prior),walletCreditsCreated:Boolean(prior)&&value.totalCents>0};
  },{readOnly:true});
}

/** Only the recent-auth single-Admin endpoint may call this service. No provider payout is invoked. */
export async function approveLiveEventSettlement(db:Firestore,input:{eventId:string;adminId:string;reason:string;confirmed:boolean;fingerprint:string}){
  if(!input.confirmed||input.reason.trim().length<5||input.reason.length>1000||!input.adminId)throw new LiveEventPolicyError("CONFIRMATION_REASON_REQUIRED",422);
  const settlementId=`live_event_${digest(input.eventId)}`,settlement=db.collection("challengeSettlements").doc(settlementId);
  return financialAction(db,input.eventId,lease=>db.runTransaction(async tx=>{
    await verifyFinancialLease(tx,lease);
    // Read the settlement range once, before event/source locks. Re-reading that
    // same range after locking its absent document can create a lock-order cycle.
    const history=await settlementHistory(db,tx,input.eventId),prior=history.docs.find(row=>row.id===settlementId);
    if(history.docs.some(row=>row.id!==settlementId))throw new LiveEventPolicyError("FINANCIAL_SOURCE_ALREADY_ALLOCATED");
    if(prior){if(prior.data().evidenceFingerprint!==input.fingerprint)throw new LiveEventPolicyError("SETTLEMENT_CHANGED");return {settlementId,repeated:true,status:prior.data().status};}
    const value=await evidence(db,tx,input.eventId,undefined,history);
    if(value.fingerprint!==input.fingerprint)throw new LiveEventPolicyError("SETTLEMENT_CHANGED");
    const now=new Date().toISOString(),holdUntil=holdUntilFromApproval(now,CASH_EARNING_HOLD_HOURS);
    const credits=value.allocations.filter(row=>row.amountCents>0).map(row=>{
      const id=`${settlementId}_winner_${row.placement}`;
      return {...cashLedgerEntry({id,userId:row.userId,challengeId:input.eventId,proposalId:settlementId,settlementId,sourceType:"challenge_winner_prize",grossAmountCents:row.amountCents,feeRate:0,feeAmountCents:0,netAmountCents:row.amountCents,placement:row.placement,holdUntil,adminId:input.adminId,now,payoutStatus:"pending_hold"}),eventId:input.eventId,financialPolicyVersion:1,sourceReferences:value.sources,settlementRestricted:true,clearanceReviewRequired:true};
    });
    const walletSnaps=credits.length?await tx.getAll(...credits.map(credit=>db.collection("cashWallets").doc(credit.userId))):[];
    if(walletSnaps.some((snap,index)=>snap.exists&&(["lockedBalanceCents","pendingBalanceCents","availableBalanceCents","lifetimeEarningsCents"].some(key=>snap.data()?.[key]!=null&&(!Number.isSafeInteger(snap.data()?.[key])||snap.data()![key]<0))||["lockedBalanceCents","lifetimeEarningsCents"].some(key=>!Number.isSafeInteger(Number(snap.data()?.[key]??0)+credits[index].amountCents)))))throw new LiveEventPolicyError("FINANCIAL_RECONCILIATION_REQUIRED");
    for(const source of value.sources)tx.update(db.doc(source.path),{liveEventSettlementId:settlementId,liveEventAllocatedAt:now});
    for(const credit of credits){
      tx.create(db.collection("cashLedger").doc(credit.id),credit);
      tx.set(db.collection("cashWallets").doc(credit.userId),{userId:credit.userId,currency:"USD",lockedBalanceCents:FieldValue.increment(credit.amountCents),lifetimeEarningsCents:FieldValue.increment(credit.amountCents),pendingBalanceCents:FieldValue.increment(0),availableBalanceCents:FieldValue.increment(0),updatedAt:now},{merge:true});
    }
    tx.create(settlement,{id:settlementId,challengeId:input.eventId,eventId:input.eventId,type:"live_event_winner_settlement",status:"approved_pending_clearance",evidenceFingerprint:value.fingerprint,sources:value.sources,allocations:value.allocations,totalCents:value.totalCents,approvedBy:input.adminId,reason:input.reason,approvedAt:now,createdAt:now,holdUntil,creatorPlatformSharesReallocated:false,externalPayoutExecuted:false});
    const patch={eventPrizeSettlementStatus:"approved_pending_clearance",liveEventSettlementId:settlementId,updatedAt:now};
    tx.update(value.ref,patch);if(value.challengeExists)tx.update(value.challengeRef,patch);
    tx.create(db.collection("auditLogs").doc(settlementId),{actorId:input.adminId,actorType:"admin",action:"live_event.financial_settlement_approved",eventId:input.eventId,reason:input.reason,before:{walletCreditsCreated:false,evidenceFingerprint:value.fingerprint},after:{settlementId,creditIds:credits.map(row=>row.id),sources:value.sources,status:"approved_pending_clearance",externalPayoutExecuted:false},createdAt:now});
    return {settlementId,repeated:false,status:"approved_pending_clearance"};
  }));
}
