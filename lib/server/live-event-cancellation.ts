import { createHash } from "node:crypto";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { readLiveEvent } from "@/lib/server/live-event-admission";
import { queueLiveEventTicketRefund } from "@/lib/server/live-event-refunds";
import { LiveEventPolicyError } from "@/lib/live-event-policy";

const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
/** Preserve each original prize-funding source in the existing financial review system.
 * Cancellation alone is not provider proof or authority to reverse completed payouts.
 */
async function queueCancelledPrizeFunding(db:Firestore,eventId:string){
  return db.runTransaction(async tx=>{
    const {event,ref,challengeRef,challengeExists}=await readLiveEvent(db,tx,eventId);
    if(event.status!=="cancelled"||!event.cancelledAt)return{complete:false};
    if(event.cancellationFundingReviewStatus==="queued")return{complete:true};
    const collections=["creatorPrizeFundingPayments","sponsorContributions"] as const;
    const cursors=(event.cancellationFundingCursors??{}) as Record<string,string>;
    const pages=await Promise.all(collections.map(collection=>{let query=db.collection(collection).where("challengeId","==",eventId).orderBy(FieldPath.documentId());if(cursors[collection])query=query.startAfter(cursors[collection]);return query.limit(15).get();}));
    const sources=pages.flatMap((page,index)=>page.docs.map(source=>({source,collection:collections[index]})));
    const cases=await Promise.all(sources.map(({source,collection})=>tx.get(db.collection("refundCases").where("paymentCollection","==",collection).where("paymentId","==",source.id).limit(3))));
    const now=new Date().toISOString();
    sources.forEach(({source,collection},index)=>{
      const value=source.data(),existing=cases[index],caseId=`live_event_cancel_funding_${hash(source.ref.path)}`,taskId=`live_event_cancel_funding_${hash(source.ref.path)}`;
      const reason="Organizer cancellation requires original prize-funding, agreement, provider and payout reconciliation. No completed return is assumed.";
      if(existing.empty)tx.create(db.collection("refundCases").doc(caseId),{id:caseId,type:"live_event_funding_reconciliation",liveEventFinancialPolicyVersion:1,eventId,paymentCollection:collection,paymentId:source.id,userId:value.userId??value.sponsorId??null,provider:"stripe",providerPaymentIntentId:value.providerPaymentIntentId??value.stripePaymentIntentId??null,providerChargeId:value.providerChargeId??null,amountCents:value.amountCents??null,currency:value.currency??null,status:"financial_hold",automaticPolicyEligible:false,reason,cause:"organizer_cancellation",sourceStatusAtCancellation:value.status??null,createdAt:now,updatedAt:now});
      // Existing liabilities retain their outcomes and identifiers, rather than creating a second refund case.
      tx.set(db.collection("adminActionTasks").doc(taskId),{type:"live_event_funding_reconciliation",eventId,paymentCollection:collection,paymentId:source.id,refundCaseIds:existing.empty?[caseId]:existing.docs.map(row=>row.id),existingCaseReferencesIncomplete:existing.size===3,status:"open",reason,createdAt:now,updatedAt:now});
      tx.update(source.ref,{settlementRestricted:true,cancellationReconciliationRequired:true,cancellationReconciliationTaskId:taskId,updatedAt:now});
      tx.create(db.collection("auditLogs").doc(`cancel_funding_${hash(source.ref.path)}`),{actorId:"event_cancellation",action:"live_event.cancelled_funding_review_queued",eventId,targetType:collection,targetId:source.id,reason,before:{status:value.status??null},after:{settlementRestricted:true,taskId},createdAt:now});
    });
    const complete=pages.every(page=>page.size<15);
    const next={...cursors};pages.forEach((page,index)=>{if(page.docs.length)next[collections[index]]=page.docs.at(-1)!.id;});
    const patch={cancellationFundingCursors:next,cancellationFundingReviewStatus:complete?"queued":"pending",updatedAt:now};
    tx.update(ref,patch);if(challengeExists)tx.update(challengeRef,patch);
    return{complete};
  });
}
/** Bounded cancellation fanout. A pending refund never masquerades as a completed return. */
export async function processLiveEventCancellation(db:Firestore,eventId:string){
  const {event}=await db.runTransaction(tx=>readLiveEvent(db,tx,eventId));
  if(event.status!=="cancelled"||!event.cancelledAt)return{processed:0,complete:false};
  const funding=await queueCancelledPrizeFunding(db,eventId);
  if(event.cancellationReconciliationStatus==="queued_for_reconciliation")return{processed:0,complete:funding.complete};
  let query=db.collection("liveEventTickets").where("eventId","==",eventId).orderBy(FieldPath.documentId()).limit(40);
  if(typeof event.cancellationCursor==="string")query=query.startAfter(event.cancellationCursor);
  const tickets=await query.get();
  if(tickets.docs.some(row=>row.data().status==="upgrade_pending"))return{processed:0,complete:false};
  for(const row of tickets.docs){
    const ticket=row.data(),bookingRef=db.collection("liveEventBookings").doc(String(ticket.bookingId)),booking=(await bookingRef.get()).data()??{};
    if(booking.paymentConfirmed===true){
      try{await queueLiveEventTicketRefund(db,{eventId,ticketId:row.id,actorId:"event_cancellation",managementAuthorized:true,reason:"Organizer cancelled the event; return the full eligible original payment.",requestKey:hash(`cancel:${eventId}:${row.id}`)});}
      catch(error){if(!(error instanceof LiveEventPolicyError&&error.code==="VOLUNTARY_REFUND_UNAVAILABLE"))throw error;}
    }else if(Number(booking.amountCents)===0){
      await db.runTransaction(async tx=>{
        const [latest,currentBooking,{event:current,ref:eventRef}]=await Promise.all([tx.get(row.ref),tx.get(bookingRef),readLiveEvent(db,tx,eventId)]),value=latest.data()??{},source=currentBooking.data()??{};
        const registration=value.kind==="competitor"?await tx.get(db.collection("liveEventRegistrations").doc(`${eventId}_${value.userId}`)):null;
        if(current.status!=="cancelled"||!latest.exists||value.capacityReleased===true)return;
        const field=value.kind==="competitor"?"competitorCount":"audienceCount";
        if(Number(current[field])<1)throw new LiveEventPolicyError("CAPACITY_RECONCILIATION_REQUIRED");
        const now=new Date().toISOString(),active=Math.max(0,Number(source.activeTicketCount??source.ticketIds?.length??1)-1);
        tx.update(row.ref,{status:"cancelled",capacityReleased:true,cancelledAt:now,updatedAt:now});
        tx.update(bookingRef,{activeTicketCount:active,status:active===0?"cancelled":source.status,updatedAt:now});
        tx.update(eventRef,{[field]:Number(current[field])-1,updatedAt:now});
        if(registration?.exists)tx.update(registration.ref,{status:"cancelled",eligible:false,updatedAt:now});
        tx.create(db.collection("auditLogs").doc(),{actorId:"event_cancellation",action:"live_event.free_admission_cancelled",eventId,targetId:row.id,createdAt:now});
      });
    }else{
      await db.collection("adminActionTasks").doc(`event_cancel_payment_${row.id}`).set({type:"live_event_payment_reconciliation",eventId,ticketId:row.id,bookingId:ticket.bookingId,status:"open",reason:"Payment evidence is unavailable; do not invent a completed refund.",updatedAt:new Date().toISOString()},{merge:true});
    }
    await db.runTransaction(async tx=>{
      const outbox=db.collection("liveEventEmailOutbox").doc(`cancel_${ticket.bookingId}`),previous=await tx.get(outbox);
      if(previous.exists)return;
      const now=new Date().toISOString();
      tx.create(outbox,{eventId,bookingId:ticket.bookingId,userId:ticket.userId,type:"event_cancellation",title:`${String(event.title)} has been cancelled`,message:"The organizer cancelled this event. Your tickets cannot be used. Confirmed refundable payments are queued for return through the original payment method where supported. A pending or reviewed refund is not a completed refund; check your booking or contact Support for its status.",status:"pending",createdAt:now});
      if(!booking.guestSession)tx.set(db.collection("notifications").doc(`live_cancel_${eventId}_${ticket.userId}`),{userId:ticket.userId,type:"live_event_cancelled",title:"Your event has been cancelled",message:"Check your booking and any refund status before making further arrangements.",actionUrl:`/live-events/${eventId}`,read:false,createdAt:now});
    });
  }
  const complete=tickets.size<40&&funding.complete;
  await db.runTransaction(async tx=>{const {event:latest,ref,challengeRef,challengeExists}=await readLiveEvent(db,tx,eventId);if(latest.cancellationCursor!==event.cancellationCursor)return;const patch={cancellationCursor:tickets.docs.at(-1)?.id??event.cancellationCursor??null,cancellationReconciliationStatus:complete?"queued_for_reconciliation":"pending",updatedAt:new Date().toISOString()};tx.update(ref,patch);if(challengeExists)tx.update(challengeRef,patch);});
  return{processed:tickets.size,complete};
}
