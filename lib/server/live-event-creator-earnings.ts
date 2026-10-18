import {createHash} from "node:crypto";
import {FieldValue,type Firestore,type Transaction} from "firebase-admin/firestore";
import {allocateLiveEventRevenue,eventTime,LiveEventPolicyError} from "@/lib/live-event-policy";
import {readLiveEvent} from "@/lib/server/live-event-admission";
import {CASH_EARNING_HOLD_HOURS,holdUntilFromApproval} from "@/lib/server/payout-structure";
import {isKycRequiredForAction} from "@/lib/server/kyc-policy";
import {isLiveEventV2} from "@/lib/server/live-event-sponsor-cutoff";

const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const cents=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0;
type Action="approve"|"clear"|"hold"|"reject_approval"|"resume_review";
type Decision={eventId:string;adminId:string;reason:string;confirmed:boolean;requestKey:string;fingerprint:string;action:Action;sourceId?:string};

async function creatorEvidence(db:Firestore,tx:Transaction,eventId:string,ignoreManualHold=false){
  const state=await readLiveEvent(db,tx,eventId),event=state.event;
  if(!state.challengeExists||!isLiveEventV2(event)||event.eventApprovalStatus!=="approved"||event.status!=="completed"||!Number.isFinite(eventTime(event.completedAt))||eventTime(event.completedAt)>Date.now()||!Number.isFinite(eventTime(event.endsAt))||eventTime(event.endsAt)>Date.now())throw new LiveEventPolicyError("COMPLETED_EVENT_REQUIRED");
  const [ledger,refunds,disputes,winnerSettlement]=await Promise.all([
    tx.get(db.collection("cashLedger").where("eventId","==",eventId).limit(301)),
    tx.get(db.collection("refundCases").where("eventId","==",eventId).limit(101)),
    tx.get(db.collection("chargebackCases").where("eventId","==",eventId).limit(101)),
    typeof event.liveEventSettlementId==="string"&&!event.liveEventSettlementId.includes("/")?tx.get(db.collection("challengeSettlements").doc(event.liveEventSettlementId)):Promise.resolve(null),
  ]);
  if(ledger.size>300||refunds.size>100||disputes.size>100)throw new LiveEventPolicyError("FINANCIAL_PARTITION_REVIEW_REQUIRED");
  const owner=String(event.organizationOwnerId??event.creatorId??event.hostId??event.userId??"");
  if(!owner||owner.includes("/"))throw new LiveEventPolicyError("FINANCIAL_OWNER_REVIEW_REQUIRED");
  const [account,wallet]=await tx.getAll(db.collection("users").doc(owner),db.collection("cashWallets").doc(owner));
  const sources=ledger.docs.filter(doc=>doc.data().sourceType==="host_event_revenue"&&doc.data().shareType==="creator_host_share"&&doc.data().direction==="credit");
  const ids=[...new Set(sources.map(doc=>String(doc.data().sourceId??"")))];
  if(ids.some(id=>!id||id.includes("/")))throw new LiveEventPolicyError("FINANCIAL_SOURCE_INVALID");
  const bookings=ids.length?await tx.getAll(...ids.map(id=>db.collection("liveEventBookings").doc(id))):[];
  const rows=sources.map(doc=>{
    const row=doc.data(),booking=bookings.find(item=>item.id===row.sourceId)?.data(),user=account.data()??{};
    let blocked:string|null=null;
    if(!cents(row.netAmountCents)||!cents(row.amountCents)||row.netAmountCents>row.amountCents||row.currency!=="USD"||row.userId!==owner||!["admission","entry_fee"].includes(row.revenueType)||doc.id!==`live_event_${row.sourceId}_${row.revenueType==="admission"?"admission_creator":"entry_creator"}`)blocked="financial_source_requires_review";
    else if(!account.exists||user.disabled||user.suspended||["disabled","suspended","deleted","deactivated","banned","restricted"].includes(String(user.accountStatus)))blocked="financial_owner_requires_review";
    else if(event.financialRestriction||event.settlementRestricted||event.stripeDisputeRestricted||event.liveEventFinancialReviewRequired)blocked="event_financial_reconciliation_required";
    else if(!booking||booking.eventId!==eventId||booking.status!=="confirmed"||booking.paymentConfirmed!==true||!booking.providerPaymentIntentId||row.providerReference!==booking.providerPaymentIntentId||booking.currency!=="usd"||!cents(booking.amountCents)||!cents(booking.admissionCents)||!cents(booking.competitionEntryCents)||booking.admissionCents+booking.competitionEntryCents!==booking.amountCents||row.liveEventSettlementId||row.settlementId||booking.stripeDisputeRestricted||booking.fraudReviewRequired||Number(booking.refundReservedCents??0)>0||row.stripeDisputeRestricted||row.financialRestriction||row.externalPayoutExecuted||row.metadata?.externalPayoutExecuted)blocked="booking_financial_reconciliation_required";
    else if(refunds.docs.some(item=>item.data().paymentId===row.sourceId&&!["completed","refunded","succeeded","rejected","cancelled"].includes(String(item.data().status)))||disputes.docs.some(item=>item.data().paymentId===row.sourceId&&item.data().resolutionRequired!==false))blocked="refund_or_dispute_unresolved";
    else {
      const admission=Number(booking.admissionCents)-Number(booking.admissionRefundedCents??0),entry=Number(booking.competitionEntryCents)-Number(booking.entryRefundedCents??0);
      if(!cents(admission)||!cents(entry))blocked="booking_allocation_requires_review";
      else {const allocation=allocateLiveEventRevenue(admission,entry);if(row.netAmountCents!==(row.revenueType==="admission"?allocation.admission.creator:allocation.competition.creator))blocked="booking_allocation_requires_review";}
      if(!blocked){
        const allocation=allocateLiveEventRevenue(admission,entry),peers=ledger.docs.filter(item=>item.data().sourceType==="host_event_revenue"&&item.data().sourceId===row.sourceId&&item.data().direction==="credit");
        const expected=[["admission_creator",allocation.admission.creator],["admission_platform",allocation.admission.platform],["entry_creator",allocation.competition.creator],["entry_platform",allocation.competition.platform],["entry_winners",allocation.competition.winners]] as const;
        if(expected.some(([key,total])=>{const matches=peers.filter(item=>item.id===`live_event_${row.sourceId}_${key}`);return total>0?matches.length!==1||matches[0].data().netAmountCents!==total||matches[0].data().currency!=="USD":matches.some(item=>item.data().netAmountCents!==0);})||peers.some(item=>!expected.some(([key])=>item.id===`live_event_${row.sourceId}_${key}`)))blocked="booking_allocation_requires_review";
      }
      if(!blocked&&row.revenueType==="entry_fee"){
        const prize=ledger.docs.find(item=>item.id===`live_event_${row.sourceId}_entry_winners`)?.data();
        if(!winnerSettlement?.exists||winnerSettlement.data()?.type!=="live_event_winner_settlement"||!["approved_pending_clearance","available"].includes(String(winnerSettlement.data()?.status))||prize?.liveEventSettlementId!==winnerSettlement.id)blocked="competition_winner_allocation_unresolved";
      }
    }
    if(!blocked&&row.creatorEarningsAdminHold&&!ignoreManualHold)blocked="admin_review_hold";
    if(!blocked&&row.creatorEarningsApprovedAt&&row.creatorEarningsApprovedCents!==row.netAmountCents)blocked="approved_amount_changed";
    if(!blocked&&!["held","pending_hold","available"].includes(String(row.status)))blocked="ledger_state_requires_review";
    return {id:doc.id,path:doc.ref.path,revenueType:String(row.revenueType),amountCents:cents(row.netAmountCents)?Number(row.netAmountCents):0,status:String(row.status),approvedAt:row.creatorEarningsApprovedAt??null,holdUntil:row.holdUntil??null,blocked,ref:doc.ref,data:row};
  });
  const snapshot={eventId,completedAt:event.completedAt,owner,rows:rows.map(({id,revenueType,amountCents,status,approvedAt,holdUntil,blocked})=>({id,revenueType,amountCents,status,approvedAt,holdUntil,blocked}))};
  return {...state,rows,owner,account,wallet,fingerprint:hash(snapshot)};
}

export async function previewLiveEventCreatorEarnings(db:Firestore,eventId:string){
  return db.runTransaction(async tx=>{
    const value=await creatorEvidence(db,tx,eventId);
    return {eventId,fingerprint:value.fingerprint,rows:value.rows.map(({id,revenueType,amountCents,status,approvedAt,holdUntil,blocked})=>({id,revenueType,amountCents,status,approvedAt,holdUntil,blocked})),externalPayoutExecuted:false};
  });
}

/** Releases original ledger shares only. No second revenue allocation or provider call. */
export async function decideLiveEventCreatorEarnings(db:Firestore,input:Decision){
  if(!input.confirmed||!input.adminId||input.reason.trim().length<5||input.reason.length>1000||!/^[\w-]{8,100}$/.test(input.requestKey))throw new LiveEventPolicyError("CONFIRMATION_REASON_REQUIRED",422);
  const audit=db.collection("auditLogs").doc(`live_creator_${hash([input.eventId,input.requestKey])}`),decisionFingerprint=hash(input);
  return db.runTransaction(async tx=>{
    const prior=await tx.get(audit);
    if(prior.exists){if(prior.data()?.decisionFingerprint!==decisionFingerprint)throw new LiveEventPolicyError("FINANCIAL_REFERENCE_REUSED");return {repeated:true,action:input.action,sourceIds:prior.data()?.sourceIds??[]};}
    const value=await creatorEvidence(db,tx,input.eventId);
    if(value.fingerprint!==input.fingerprint)throw new LiveEventPolicyError("FINANCIAL_EVIDENCE_CHANGED");
    const now=new Date().toISOString();
    if(["hold","reject_approval","resume_review"].includes(input.action)){
      const row=value.rows.find(row=>row.id===input.sourceId);
      if(!row||row.status==="available"||row.data.externalPayoutExecuted)throw new LiveEventPolicyError("FINANCIAL_RECONCILIATION_REQUIRED");
      if(input.action==="resume_review"){
        const fresh=await creatorEvidence(db,tx,input.eventId,true),current=fresh.rows.find(item=>item.id===row.id);
        if(!current||current.blocked)throw new LiveEventPolicyError("FINANCIAL_RECONCILIATION_REQUIRED");
      }
      tx.update(row.ref,{creatorEarningsAdminHold:input.action!=="resume_review",creatorEarningsReviewDecision:input.action,creatorEarningsReviewReason:input.reason,creatorEarningsReviewedBy:input.adminId,updatedAt:now});
      tx.create(audit,{actorId:input.adminId,actorType:"admin",action:`live_event.creator_earnings_${input.action}`,eventId:input.eventId,decisionFingerprint,sourceIds:[row.id],reason:input.reason,before:{status:row.status,adminHold:Boolean(row.data.creatorEarningsAdminHold)},after:{adminHold:input.action!=="resume_review",financialEntitlementRemoved:false},createdAt:now});
      return {repeated:false,action:input.action,sourceIds:[row.id]};
    }
    const selected=value.rows.filter(row=>!row.blocked&&row.amountCents>0&&(input.action==="approve"?row.status==="held"&&!row.approvedAt:row.status==="pending_hold"&&row.approvedAt&&Number.isFinite(eventTime(row.holdUntil))&&Date.now()>=Math.max(eventTime(row.holdUntil),eventTime(row.approvedAt)+CASH_EARNING_HOLD_HOURS*3600000)));
    if(!selected.length)throw new LiveEventPolicyError(input.action==="clear"?"CLEARANCE_OR_RECONCILIATION_PENDING":"NO_ELIGIBLE_CREATOR_EARNINGS");
    const total=selected.reduce((sum,row)=>sum+row.amountCents,0),wallet=value.wallet.data()??{};
    if(!cents(total)||["lockedBalanceCents","availableBalanceCents","lifetimeEarningsCents","pendingBalanceCents"].some(key=>wallet[key]!=null&&!cents(wallet[key])))throw new LiveEventPolicyError("WALLET_RECONCILIATION_REQUIRED");
    if(input.action==="clear"&&(Number(wallet.lockedBalanceCents??0)<total||!Number.isSafeInteger(Number(wallet.availableBalanceCents??0)+total)))throw new LiveEventPolicyError("WALLET_RECONCILIATION_REQUIRED");
    if(input.action==="approve"&&(!Number.isSafeInteger(Number(wallet.lockedBalanceCents??0)+total)||!Number.isSafeInteger(Number(wallet.lifetimeEarningsCents??0)+total)))throw new LiveEventPolicyError("WALLET_RECONCILIATION_REQUIRED");
    if(input.action==="clear"&&isKycRequiredForAction("creatorEarningCredit")&&!["approved","verified"].includes(String(value.account.data()?.kycStatus)))throw new LiveEventPolicyError("KYC_REQUIRED");
    for(const row of selected)tx.update(row.ref,input.action==="approve"?{status:"pending_hold",balanceBucket:"held",creatorEarningsApprovalId:audit.id,creatorEarningsApprovedBy:input.adminId,creatorEarningsApprovalReason:input.reason,creatorEarningsApprovedAt:now,creatorEarningsApprovedCents:row.amountCents,holdUntil:holdUntilFromApproval(now,CASH_EARNING_HOLD_HOURS),settlementRestricted:true,clearanceReviewRequired:true,updatedAt:now}:{status:"available",balanceBucket:"available",settlementRestricted:false,clearanceReviewRequired:false,creatorEarningsClearedAt:now,creatorEarningsClearedBy:input.adminId,updatedAt:now});
    tx.set(value.wallet.ref,{userId:value.owner,currency:"USD",lockedBalanceCents:FieldValue.increment(input.action==="approve"?total:-total),availableBalanceCents:FieldValue.increment(input.action==="clear"?total:0),lifetimeEarningsCents:FieldValue.increment(input.action==="approve"?total:0),updatedAt:now},{merge:true});
    tx.create(audit,{actorId:input.adminId,actorType:"admin",action:`live_event.creator_earnings_${input.action}`,eventId:input.eventId,decisionFingerprint,sourceIds:selected.map(row=>row.id),reason:input.reason,before:{sources:selected.map(row=>({path:row.path,status:row.status,amountCents:row.amountCents}))},after:{status:input.action==="approve"?"pending_hold":"available",totalCents:total,externalPayoutExecuted:false,revenueReallocated:false},createdAt:now});
    return {repeated:false,action:input.action,sourceIds:selected.map(row=>row.id),totalCents:total};
  });
}
