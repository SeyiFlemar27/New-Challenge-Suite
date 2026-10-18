import {createHash,randomUUID} from "node:crypto";
import type {Firestore} from "firebase-admin/firestore";
import type Stripe from "stripe";
import {LiveEventPolicyError} from "@/lib/live-event-policy";
import {readLiveEvent} from "@/lib/server/live-event-admission";
import {readRestorableUpgrade,restoreLiveEventAdmission} from "@/lib/server/live-event-upgrades";

const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const id=(value:unknown):string|null=>typeof value==="string"?value:value&&typeof value==="object"&&"id" in value&&typeof value.id==="string"?value.id:null;

/** Verified provider success reconciles an unfulfilled charge, never a winner or revenue credit. */
export async function reconcileLiveEventUnfulfilledRefund(db:Firestore,input:{caseId:string;providerRefundId:string;paymentIntentId:string;amountCents:number;currency:string;status:string}){
  if(input.status!=="succeeded")return {reconciled:false};
  const ref=db.collection("refundCases").doc(input.caseId);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref),value=snap.data();
    if(!value||value.type!=="live_event_booking_reconciliation"||value.paymentCollection!=="liveEventBookings"||value.providerPaymentIntentId!==input.paymentIntentId||value.amountCents!==input.amountCents||value.currency!==input.currency||value.providerRefundId&&value.providerRefundId!==input.providerRefundId)throw new LiveEventPolicyError("REFUND_PROVIDER_MISMATCH");
    if(value.status==="refunded")return {reconciled:true,duplicate:true};
    const booking=await tx.get(db.collection("liveEventBookings").doc(String(value.paymentId))),source=booking.data();
    if(source?.refundCaseId!==input.caseId)throw new LiveEventPolicyError("REFUND_PROVIDER_MISMATCH");
    const [{event,ref:eventRef},ledger,lock]=await Promise.all([readLiveEvent(db,tx,String(value.eventId)),tx.get(db.collection("cashLedger").where("sourceId","==",value.paymentId).limit(1)),tx.get(db.collection("providerRefundLocks").doc(hash(input.providerRefundId)))]);
    if(!source||source.eventId!==value.eventId||source.providerPaymentIntentId!==input.paymentIntentId||source.amountCents!==input.amountCents||source.status!=="payment_review_required"||source.ticketIds?.length||!ledger.empty||lock.exists&&lock.data()?.refundCaseId!==input.caseId)throw new LiveEventPolicyError("UNFULFILLED_PAYMENT_RECONCILIATION_REQUIRED");
    if(source.currency!==input.currency||!["audience","competitor"].includes(String(source.kind))||!["reserved","released"].includes(String(source.capacityState)))throw new LiveEventPolicyError("UNFULFILLED_PAYMENT_RECONCILIATION_REQUIRED");
    const reserved=source.capacityState==="reserved",quantity=Number(source.quantity),counter=source.kind==="competitor"?"competitorReserved":"audienceReserved";
    if(reserved&&(!Number.isSafeInteger(quantity)||quantity<1||!Number.isSafeInteger(event[counter])||Number(event[counter])<quantity))throw new LiveEventPolicyError("CAPACITY_RECONCILIATION_REQUIRED");
    const upgrade=reserved?await readRestorableUpgrade(db,tx,source,booking.id):null;
    const now=new Date().toISOString();
    tx.update(ref,{status:"refunded",providerRefundId:input.providerRefundId,providerStatus:"succeeded",refundedAt:now,updatedAt:now});
    tx.update(booking.ref,{status:"refunded",providerRefundedCents:input.amountCents,capacityState:"released",refundCompletedAt:now,settlementRestricted:true,updatedAt:now});
    tx.set(db.collection("providerRefundLocks").doc(hash(input.providerRefundId)),{refundCaseId:input.caseId,providerRefundId:input.providerRefundId,paymentIntentId:input.paymentIntentId,updatedAt:now});
    if(reserved)tx.update(eventRef,{[counter]:Number(event[counter])-quantity,updatedAt:now});
    if(upgrade)restoreLiveEventAdmission(tx,upgrade,now);
    tx.create(db.collection("auditLogs").doc(`live_unfulfilled_refund_${hash(input.providerRefundId)}`),{actorId:"stripe_verified_refund",action:"live_event.unfulfilled_payment_returned",eventId:value.eventId,targetId:input.caseId,paymentId:booking.id,providerPaymentIntentId:input.paymentIntentId,providerRefundId:input.providerRefundId,amountCents:input.amountCents,before:{bookingStatus:source.status,capacityState:source.capacityState},after:{bookingStatus:"refunded",capacityState:"released",prizeOrRevenueCredited:false},createdAt:now});
    return {reconciled:true,duplicate:false};
  });
}

/** Recent-auth Admin approval is required by the existing refund endpoint.
 * No timing inference, arbitrary financial mutation or new refund policy is introduced.
 */
export async function returnLiveEventUnfulfilledPayment(db:Firestore,stripe:Stripe,input:{caseId:string;adminId:string;reason:string;confirmed:boolean}){
  if(!input.confirmed||!input.adminId||input.reason.trim().length<8||input.reason.length>1000)throw new LiveEventPolicyError("REFUND_CONFIRMATION_REQUIRED",422);
  const ref=db.collection("refundCases").doc(input.caseId),token=randomUUID(),now=Date.now();
  const claim=await db.runTransaction(async tx=>{
    const snap=await tx.get(ref),value=snap.data();
    if(!value||value.type!=="live_event_booking_reconciliation"||value.paymentCollection!=="liveEventBookings")throw new LiveEventPolicyError("REFUND_PAYMENT_REVIEW_REQUIRED");
    if(value.status==="refunded"||value.status==="executing"&&Date.parse(String(value.leaseUntil))>now)return {ready:false as const,status:String(value.status)};
    if(!["financial_hold","approved","executing","processing"].includes(String(value.status)))throw new LiveEventPolicyError("REFUND_PAYMENT_REVIEW_REQUIRED");
    if(!value.providerRefundId&&value.firstExecutionAttemptAt&&(!Number.isFinite(Date.parse(String(value.firstExecutionAttemptAt)))||now-Date.parse(String(value.firstExecutionAttemptAt))>=23*3600000))throw new LiveEventPolicyError("PROVIDER_IDEMPOTENCY_REVIEW_REQUIRED");
    const booking=await tx.get(db.collection("liveEventBookings").doc(String(value.paymentId))),source=booking.data();
    if(source?.refundCaseId!==input.caseId)throw new LiveEventPolicyError("UNFULFILLED_PAYMENT_RECONCILIATION_REQUIRED");
    const issuedTickets=await tx.get(db.collection("liveEventTickets").where("bookingId","==",booking.id).limit(1));
    if(!issuedTickets.empty)throw new LiveEventPolicyError("UNFULFILLED_PAYMENT_RECONCILIATION_REQUIRED");
    const [ledger,providerLock]=await Promise.all([tx.get(db.collection("cashLedger").where("sourceId","==",value.paymentId).limit(1)),tx.get(db.collection("paymentProviderLocks").doc(hash(`live_event:${value.providerPaymentIntentId}`)))]);
    if(!source||source.eventId!==value.eventId||source.status!=="payment_review_required"||source.ticketIds?.length||!ledger.empty||source.providerPaymentIntentId!==value.providerPaymentIntentId||source.amountCents!==value.amountCents||source.currency!==value.currency||!Number.isSafeInteger(value.amountCents)||value.amountCents<=0||source.stripeDisputeRestricted||source.fraudReviewRequired||source.financialRestriction||!providerLock.exists||providerLock.data()?.bookingId!==booking.id)throw new LiveEventPolicyError("UNFULFILLED_PAYMENT_RECONCILIATION_REQUIRED");
    tx.update(ref,{status:"executing",leaseToken:token,leaseUntil:new Date(now+300000).toISOString(),firstExecutionAttemptAt:value.firstExecutionAttemptAt??new Date(now).toISOString(),reviewedBy:input.adminId,reviewReason:input.reason,updatedAt:new Date(now).toISOString()});
    tx.create(db.collection("auditLogs").doc(),{actorId:input.adminId,actorType:"admin",action:"live_event.unfulfilled_return_authorized",eventId:value.eventId,targetId:input.caseId,reason:input.reason,before:{status:value.status,paymentId:value.paymentId,amountCents:value.amountCents},after:{status:"executing",providerConfirmationRequired:true},createdAt:new Date(now).toISOString()});
    return {ready:true as const,value,source};
  });
  if(!claim.ready)return {status:claim.status,repeated:true};
  try{
    const {value,source}=claim;
    const [intent,session]=await Promise.all([stripe.paymentIntents.retrieve(String(value.providerPaymentIntentId),{expand:["latest_charge"]}),stripe.checkout.sessions.retrieve(String(source.stripeCheckoutSessionId))]);
    const charge=typeof intent.latest_charge==="object"?intent.latest_charge:null;
    if(intent.id!==value.providerPaymentIntentId||intent.metadata?.paymentPurpose!=="live_event_booking"||intent.metadata?.bookingId!==value.paymentId||intent.metadata?.eventId!==value.eventId||charge?.amount!==value.amountCents||session.metadata?.paymentPurpose!=="live_event_booking"||session.payment_method_types?.length!==1||session.payment_method_types[0]!=="card")throw new Error("PROVIDER_REFUND_REVIEW_REQUIRED");
    if(intent.status!=="succeeded"||intent.capture_method!=="automatic"||intent.amount_received!==value.amountCents||intent.currency!==value.currency||!charge||charge.status!=="succeeded"||!charge.paid||!charge.captured||charge.amount_captured!==value.amountCents||charge.currency!==value.currency||charge.payment_method_details?.type!=="card"||charge.disputed||charge.review||charge.fraud_details?.user_report==="fraudulent"||id(charge.payment_intent)!==intent.id||value.providerChargeId&&charge.id!==value.providerChargeId||session.id!==source.stripeCheckoutSessionId||session.mode!=="payment"||session.status!=="complete"||session.payment_status!=="paid"||id(session.payment_intent)!==intent.id||session.amount_total!==value.amountCents||session.currency!==value.currency||session.metadata?.bookingId!==value.paymentId||session.metadata?.eventId!==value.eventId||!value.providerRefundId&&(charge.refunded||charge.amount_refunded!==0))throw new Error("PROVIDER_REFUND_REVIEW_REQUIRED");
    const refund=value.providerRefundId?await stripe.refunds.retrieve(String(value.providerRefundId)):await stripe.refunds.create({payment_intent:intent.id,amount:Number(value.amountCents),reason:"requested_by_customer",metadata:{refundCaseId:input.caseId}},{idempotencyKey:`live-event-unfulfilled-${input.caseId}`});
    if(id(refund.payment_intent)!==intent.id||refund.amount!==value.amountCents||refund.currency!==value.currency||refund.metadata?.refundCaseId!==input.caseId)throw new Error("PROVIDER_REFUND_MISMATCH");
    await db.runTransaction(async tx=>{const current=await tx.get(ref);if(current.data()?.status!=="refunded"&&current.data()?.leaseToken===token)tx.update(ref,{providerRefundId:refund.id,providerStatus:refund.status,status:["failed","canceled"].includes(String(refund.status))?"financial_hold":"processing",updatedAt:new Date().toISOString()});});
    if(refund.status==="succeeded")await reconcileLiveEventUnfulfilledRefund(db,{caseId:input.caseId,providerRefundId:refund.id,paymentIntentId:intent.id,amountCents:refund.amount,currency:refund.currency,status:refund.status});
    return {status:(await ref.get()).data()?.status,providerRefundId:refund.id};
  }catch{
    await db.runTransaction(async tx=>{const current=await tx.get(ref);if(current.data()?.status!=="refunded"&&current.data()?.leaseToken===token)tx.update(ref,{status:"financial_hold",reconciliationReason:"provider_outcome_or_source_requires_review",leaseUntil:null,updatedAt:new Date().toISOString()});});
    return {status:(await ref.get()).data()?.status,reviewRequired:true};
  }
}
