import type {Firestore} from "firebase-admin/firestore";
import type Stripe from "stripe";
import {deterministicId} from "@/lib/server/idempotency";
import {readLiveEvent} from "@/lib/server/live-event-admission";

const providerId=(value:unknown):string|null=>typeof value==="string"?value:value&&typeof value==="object"&&"id" in value&&typeof value.id==="string"?value.id:null;
/** Uses existing chargeback cases and cash ledger; never reverses completed payouts or invents recovery funds. */
export async function recordLiveEventBookingDispute(db:Firestore,input:{dispute:Stripe.Dispute;charge:Stripe.Charge;paymentIntent:Stripe.PaymentIntent;eventId:string;eventType:string}){
  const {dispute,charge,paymentIntent}=input,bookingId=paymentIntent.metadata?.bookingId,eventId=paymentIntent.metadata?.eventId;
  if(paymentIntent.metadata?.paymentPurpose!=="live_event_booking"||!bookingId||!/^[a-f0-9]{64}$/.test(bookingId)||!eventId||providerId(dispute.charge)!==charge.id||providerId(charge.payment_intent)!==paymentIntent.id||providerId(paymentIntent.latest_charge)!==charge.id||dispute.payment_intent&&providerId(dispute.payment_intent)!==paymentIntent.id||!Number.isSafeInteger(dispute.amount)||dispute.amount<=0||dispute.amount>charge.amount||dispute.currency!==charge.currency||charge.currency!==paymentIntent.currency)throw new Error("LIVE_EVENT_DISPUTE_REFERENCE_MISMATCH");
  const caseId=deterministicId("stripe_chargeback",dispute.id),caseRef=db.collection("chargebackCases").doc(caseId),audit=db.collection("auditLogs").doc(deterministicId("live_event_dispute",input.eventId));
  return db.runTransaction(async tx=>{
    // Acquire the canonical booking first, then use one consistent read order.
    // Duplicate callbacks must not contend on the whole event/ledger before
    // observing the already committed event receipt.
    const booking=await tx.get(db.collection("liveEventBookings").doc(bookingId));
    const previous=await tx.get(audit);
    if(previous.exists)return{handled:true,duplicate:true,caseId};
    const priorCase=await tx.get(caseRef);
    const {ref,challengeRef,challengeExists}=await readLiveEvent(db,tx,eventId);
    const ledger=await tx.get(db.collection("cashLedger").where("sourceId","==",bookingId).limit(101));
    const value=booking.data()??{};
    if(!booking.exists||value.eventId!==eventId||value.providerPaymentIntentId!==paymentIntent.id||value.providerChargeId!==charge.id||value.amountCents!==charge.amount||String(value.currency).toLowerCase()!==charge.currency||ledger.size>100)throw new Error("LIVE_EVENT_DISPUTE_SOURCE_MISMATCH");
    const now=new Date().toISOString();
    const completed=ledger.docs.filter(row=>row.data().externalPayoutExecuted===true||row.data().metadata?.externalPayoutExecuted===true||["paid","paid_out"].includes(String(row.data().status)));
    tx.set(caseRef,{id:caseId,type:"live_event_booking_dispute",eventId,challengeId:eventId,paymentCollection:"liveEventBookings",paymentId:bookingId,userId:value.userId,provider:"stripe",providerDisputeId:dispute.id,providerChargeId:charge.id,providerPaymentIntentId:paymentIntent.id,providerEventId:input.eventId,providerDisputeStatus:dispute.status,amountCents:dispute.amount,currency:dispute.currency.toUpperCase(),status:"financial_hold",resolutionRequired:true,completedPayoutsPreserved:true,completedLedgerIds:completed.map(row=>row.id),reason:"Verified Live Event payment dispute requires audited financial reconciliation; no automatic debit or refund.",createdAt:priorCase.data()?.createdAt??now,updatedAt:now},{merge:true});
    tx.update(booking.ref,{stripeDisputeRestricted:true,settlementRestricted:true,chargebackCaseId:caseId,updatedAt:now});
    for(const row of ledger.docs){
      if(row.data().eventId!==eventId)throw new Error("LIVE_EVENT_DISPUTE_LEDGER_MISMATCH");
      tx.update(row.ref,{settlementRestricted:true,stripeDisputeRestricted:true,chargebackCaseId:caseId,updatedAt:now});
    }
    const restriction={settlementRestricted:true,liveEventFinancialReviewRequired:true,eventPrizeSettlementStatus:"on_hold",updatedAt:now};
    tx.update(ref,restriction);if(challengeExists)tx.update(challengeRef,restriction);
    tx.set(db.collection("adminActionTasks").doc(caseId),{id:caseId,type:"live_event_payment_dispute",eventId,chargebackCaseId:caseId,status:"open",reason:"Review the verified provider dispute and reconcile unpaid funds. Completed payouts must remain unchanged.",createdAt:priorCase.data()?.createdAt??now,updatedAt:now},{merge:true});
    tx.create(audit,{actorId:"stripe_verified_webhook",action:"live_event.payment_disputed",eventId,targetId:caseId,providerEventId:input.eventId,providerEventType:input.eventType,before:{disputeStatus:priorCase.data()?.providerDisputeStatus??null},after:{disputeStatus:dispute.status,settlementRestricted:true,completedPayoutsPreserved:true},createdAt:now});
    return{handled:true,duplicate:false,caseId,settlementRestricted:true};
  });
}
