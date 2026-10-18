import {createHash} from "node:crypto";
import type {Firestore} from "firebase-admin/firestore";
import {eventKind, eventTime, LiveEventPolicyError} from "@/lib/live-event-policy";
import {readLiveEvent} from "@/lib/server/live-event-admission";

/** Withdraws competition eligibility only. Admission and paid-entry liability remain separate. */
export async function withdrawLiveEventCompetition(db:Firestore,input:{eventId:string;userId:string;reason:string;requestKey:string;now?:number}){
  if(input.reason.trim().length<5||input.reason.length>1000||!/^[A-Za-z0-9_-]{8,100}$/.test(input.requestKey))throw new LiveEventPolicyError("WITHDRAWAL_CONFIRMATION_REQUIRED",422);
  const audit=db.collection("auditLogs").doc(createHash("sha256").update(`live-withdraw:${input.eventId}:${input.userId}:${input.requestKey}`).digest("hex"));
  return db.runTransaction(async tx=>{
    const [{event},registration,previous]=await Promise.all([readLiveEvent(db,tx,input.eventId),tx.get(db.collection("liveEventRegistrations").doc(`${input.eventId}_${input.userId}`)),tx.get(audit)]);
    if(previous.exists)return{repeated:true,admissionRetained:true,entryRefunded:false};
    const value=registration.data()??{},now=input.now??Date.now();
    if(!registration.exists||value.userId!==input.userId||value.eventId!==input.eventId||value.kind!=="competitor")throw new LiveEventPolicyError("COMPETITOR_NOT_FOUND",404);
    if(eventKind(event)!=="physical_competition"||event.resultsPublishedAt||["completed","cancelled","deleted"].includes(String(event.status))||now>=eventTime(event.endsAt))throw new LiveEventPolicyError("WITHDRAWAL_REVIEW_REQUIRED");
    if(value.status==="withdrawn"&&value.withdrawnAt)return{repeated:true,admissionRetained:true,entryRefunded:false};
    if(value.eligible!==true||!["confirmed","checked_in"].includes(String(value.status))||typeof value.ticketId!=="string"||!/^[a-f0-9]{64}$/.test(value.ticketId))throw new LiveEventPolicyError("WITHDRAWAL_REVIEW_REQUIRED");
    const ticket=await tx.get(db.collection("liveEventTickets").doc(value.ticketId)),data=ticket.data()??{};
    if(!ticket.exists||data.eventId!==input.eventId||data.userId!==input.userId||data.kind!=="competitor"||!["confirmed","checked_in"].includes(String(data.status)))throw new LiveEventPolicyError("WITHDRAWAL_REVIEW_REQUIRED");
    const iso=new Date(now).toISOString();
    tx.update(registration.ref,{eligible:false,status:"withdrawn",withdrawnAt:iso,withdrawalReason:input.reason,updatedAt:iso});
    tx.update(ticket.ref,{competitionWithdrawnAt:iso,admissionRetained:true,updatedAt:iso});
    // Keep the competitor admission place reserved. Never transfer it into audience inventory.
    tx.create(audit,{actorId:input.userId,action:"live_event.competitor_withdrawn",eventId:input.eventId,targetId:registration.id,before:{status:value.status,eligible:true},after:{status:"withdrawn",eligible:false,admissionRetained:true,entryRefunded:false},reason:input.reason,createdAt:iso});
    return{repeated:false,admissionRetained:true,entryRefunded:false};
  });
}
