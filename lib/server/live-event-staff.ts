import {createHash} from "node:crypto";
import type {Firestore} from "firebase-admin/firestore";
import {LiveEventPolicyError,eventTime} from "@/lib/live-event-policy";
import {readLiveEvent} from "@/lib/server/live-event-admission";
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");

export async function manageLiveEventStaff(db:Firestore,input:{eventId:string;actorId:string;userId:string;action:"invite"|"accept"|"revoke";reason:string;requestKey:string;now?:number}){
  if(!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestKey)||input.reason.trim().length<5||input.reason.length>1000)throw new LiveEventPolicyError("CONFIRMATION_REASON_REQUIRED",422);
  const ref=db.collection("liveEventStaff").doc(hash(`${input.eventId}:${input.userId}`)),audit=db.collection("auditLogs").doc(hash(`live-staff:${input.eventId}:${input.requestKey}`));
  return db.runTransaction(async tx=>{
    const [{event},current,target,previous]=await Promise.all([readLiveEvent(db,tx,input.eventId),tx.get(ref),tx.get(db.collection("users").doc(input.userId)),tx.get(audit)]);
    const now=input.now??Date.now(),iso=new Date(now).toISOString(),existing=current.data()??{};
    if(previous.exists){if(previous.data()?.actorId!==input.actorId||previous.data()?.targetId!==input.userId||previous.data()?.action!==`live_event.staff_${input.action}`)throw new LiveEventPolicyError("STAFF_REFERENCE_REUSED");return {status:String(previous.data()?.after),repeated:true};}
    if(!target.exists||["disabled","deleted","suspended","banned"].includes(String(target.data()?.accountStatus))||event.status==="cancelled"||!Number.isFinite(eventTime(event.endsAt))||now>=eventTime(event.endsAt))throw new LiveEventPolicyError("STAFF_INVITATION_UNAVAILABLE");
    if(input.action==="accept"&&(input.actorId!==input.userId||existing.status!=="invited"))throw new LiveEventPolicyError("STAFF_INVITATION_REQUIRED",403);
    const status=input.action==="invite"?"invited":input.action==="accept"?"active":"revoked";
    if(input.action==="invite"&&existing.status==="active")throw new LiveEventPolicyError("STAFF_ALREADY_ACTIVE");
    tx.set(ref,{eventId:input.eventId,userId:input.userId,permission:"check_in",status,updatedAt:iso,updatedBy:input.actorId,expiresAt:event.endsAt},{merge:true});
    tx.create(audit,{actorId:input.actorId,action:`live_event.staff_${input.action}`,eventId:input.eventId,targetId:input.userId,before:existing.status??null,after:status,reason:input.reason,createdAt:iso});
    if(input.action==="invite")tx.set(db.collection("notifications").doc(`event_staff_${ref.id}`),{userId:input.userId,type:"live_event_staff_invitation",title:"You're invited to help with event check-in",message:"Accept the invitation to verify tickets and confirm arrivals for this event only.",actionUrl:`/live-events/${input.eventId}/check-in`,read:false,createdAt:iso});
    return {status,repeated:false};
  });
}

export async function correctLiveEventArrival(db:Firestore,input:{eventId:string;ticketId:string;actorId:string;expectedCheckedInAt:string;reason:string;requestKey:string}){
  if(!/^[a-f0-9]{64}$/.test(input.ticketId)||input.reason.trim().length<5||!input.expectedCheckedInAt||!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestKey))throw new LiveEventPolicyError("ARRIVAL_CORRECTION_INVALID",422);
  const ticketRef=db.collection("liveEventTickets").doc(input.ticketId),audit=db.collection("auditLogs").doc(hash(`arrival-correction:${input.eventId}:${input.requestKey}`));
  return db.runTransaction(async tx=>{
    const [{event,ref},ticket,previous]=await Promise.all([readLiveEvent(db,tx,input.eventId),tx.get(ticketRef),tx.get(audit)]);
    if(previous.exists){if(previous.data()?.targetId!==input.ticketId||previous.data()?.actorId!==input.actorId)throw new LiveEventPolicyError("ARRIVAL_REFERENCE_REUSED");return {repeated:true};}
    const value=ticket.data()??{};
    if(!ticket.exists||value.eventId!==input.eventId||value.status!=="checked_in"||value.checkedInAt!==input.expectedCheckedInAt||Number(event.checkInCount)<1)throw new LiveEventPolicyError("ARRIVAL_CHANGED");
    if(event.resultsPublishedAt)throw new LiveEventPolicyError("FINALIZED_RESULTS_REVIEW_REQUIRED");
    const registrationRef=db.collection("liveEventRegistrations").doc(`${input.eventId}_${value.userId}`),registration=value.kind==="competitor"?await tx.get(registrationRef):null;
    if(value.kind==="competitor"&&(!registration?.exists||registration.data()?.ticketId!==ticket.id))throw new LiveEventPolicyError("COMPETITOR_NOT_ELIGIBLE");
    const now=new Date().toISOString();
    tx.update(ticketRef,{status:"confirmed",checkedInAt:null,checkedInBy:null,updatedAt:now});
    if(registration)tx.update(registrationRef,{status:registration.data()?.status==="withdrawn"?"withdrawn":"confirmed",checkedInAt:null,updatedAt:now});
    tx.update(ref,{checkInCount:Number(event.checkInCount)-1,updatedAt:now});
    tx.create(audit,{actorId:input.actorId,action:"live_event.arrival_corrected",eventId:input.eventId,targetId:input.ticketId,before:{checkedInAt:value.checkedInAt},after:{checkedInAt:null},reason:input.reason,createdAt:now});
    return {repeated:false};
  });
}
