import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { eventOptions, eventTime, LiveEventPolicyError } from "@/lib/live-event-policy";
import { readLiveEvent } from "@/lib/server/live-event-admission";
import { liveEventSponsorCutoff } from "@/lib/server/live-event-sponsor-cutoff";
import { seedLiveEventJobs, wakeLiveEventJob } from "@/lib/server/live-event-job-outbox";

const changesSchema = z.object({ checkInStartAt:z.string().datetime().optional(),checkInEndAt:z.string().datetime().optional(),startsAt:z.string().datetime().optional(),endsAt:z.string().datetime().optional(),venueName:z.string().trim().min(1).max(200).optional(),eventAddress:z.string().trim().min(1).max(500).optional(),eventCity:z.string().trim().min(1).max(120).optional(),eventState:z.string().trim().max(120).optional(),eventCountry:z.string().trim().min(1).max(120).optional() }).strict().refine(value=>Object.keys(value).length>0);
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const checkInFields=new Set(["checkInStartAt","checkInEndAt"]);
const currentValue=(event:Record<string,unknown>,key:string)=>checkInFields.has(key)?eventOptions(event)[key]??event[key]??null:event[key]??null;
function changedEvent(event:Record<string,unknown>,changes:Record<string,unknown>):Record<string,unknown>{
  const root=Object.fromEntries(Object.entries(changes).filter(([key])=>!checkInFields.has(key)));
  const arrival=Object.fromEntries(Object.entries(changes).filter(([key])=>checkInFields.has(key)));
  return {...event,...root,...(Object.keys(arrival).length?{hostOperations:{...eventOptions(event),...arrival}}:{})};
}
function validate(event:Record<string,unknown>,changes:Record<string,unknown>,now:number){
  const next=changedEvent(event,changes);
  if(event.eventApprovalStatus!=="approved"||["draft","rejected","completed","cancelled","deleted"].includes(String(event.status))||event.resultsPublishedAt||event.liveEventStartedAt||now>=eventTime(event.startsAt))throw new LiveEventPolicyError("EVENT_CHANGE_REVIEW_REQUIRED");
  if(!Number.isFinite(eventTime(next.startsAt))||eventTime(next.startsAt)<=now||!Number.isFinite(eventTime(next.endsAt))||eventTime(next.startsAt)>=eventTime(next.endsAt))throw new LiveEventPolicyError("EVENT_TIMELINE_INVALID",422);
  if(!Object.keys(changes).some(key=>JSON.stringify(currentValue(event,key))!==JSON.stringify(changes[key])))throw new LiveEventPolicyError("NO_EVENT_CHANGE",422);
  if(eventOptions(event).schemaVersion===2){
    if((changes.startsAt||changes.endsAt)&&(!changes.checkInStartAt||!changes.checkInEndAt))throw new LiveEventPolicyError("CHECK_IN_REVIEW_REQUIRED",422);
    const options=eventOptions(next),opening=eventTime(options.registrationOpensAt),closing=eventTime(options.registrationClosesAt),arrival=eventTime(options.checkInStartAt),arrivalEnd=eventTime(options.checkInEndAt);
    if(![opening,closing,arrival,arrivalEnd].every(Number.isFinite)||opening>=closing||closing>eventTime(next.endsAt)||arrival>=arrivalEnd||arrivalEnd>eventTime(next.endsAt))throw new LiveEventPolicyError("EVENT_TIMELINE_INVALID",422);
  }else if(Object.keys(changes).some(key=>checkInFields.has(key)))throw new LiveEventPolicyError("CHECK_IN_REVIEW_REQUIRED",422);
  return next;
}
export async function proposeLiveEventChange(db:Firestore,input:{eventId:string;actorId:string;changes:Record<string,unknown>;expectedVersion:number;reason:string;requestKey:string;now?:number}){
  const changes=changesSchema.parse(input.changes);
  if(input.reason.trim().length<8||input.reason.length>1000||!/^[A-Za-z0-9_-]{8,100}$/.test(input.requestKey))throw new LiveEventPolicyError("EVENT_CHANGE_REASON_REQUIRED",422);
  const id=hash(`${input.eventId}:${input.requestKey}`),ref=db.collection("liveEventChangeRequests").doc(id),fingerprint=hash(JSON.stringify({changes,actorId:input.actorId,reason:input.reason}));
  return db.runTransaction(async tx=>{
    const [{event},previous]=await Promise.all([readLiveEvent(db,tx,input.eventId),tx.get(ref)]);
    if(previous.exists){if(previous.data()?.fingerprint!==fingerprint)throw new LiveEventPolicyError("EVENT_CHANGE_REFERENCE_REUSED");return{id,repeated:true};}
    if(Number(event.liveEventContentVersion??0)!==input.expectedVersion)throw new LiveEventPolicyError("EVENT_DETAILS_CHANGED");
    const now=input.now??Date.now();validate(event,changes,now);
    const before=Object.fromEntries(Object.keys(changes).map(key=>[key,currentValue(event,key)]));
    tx.create(ref,{id,eventId:input.eventId,challengeId:input.eventId,actorId:input.actorId,before,proposed:changes,expectedVersion:input.expectedVersion,fingerprint,reason:input.reason,status:"pending_review",createdAt:new Date(now).toISOString()});
    tx.create(db.collection("auditLogs").doc(),{actorId:input.actorId,action:"live_event.change_requested",eventId:input.eventId,targetId:id,before,proposed:changes,reason:input.reason,createdAt:new Date(now).toISOString()});
    return{id,repeated:false};
  });
}
/** Invoked only by the existing single-Admin review/step-up boundary. */
export async function decideLiveEventChange(db:Firestore,input:{id:string;actorId:string;decision:"approve"|"reject";reason:string;now?:number}){
  if(!/^[a-f0-9]{64}$/.test(input.id)||input.reason.trim().length<8||input.reason.length>1000)throw new LiveEventPolicyError("EVENT_CHANGE_REASON_REQUIRED",422);
  const ref=db.collection("liveEventChangeRequests").doc(input.id);
  return db.runTransaction(async tx=>{
    const proposalSnap=await tx.get(ref),proposal=proposalSnap.data()??{};
    if(!proposalSnap.exists)throw new LiveEventPolicyError("EVENT_CHANGE_NOT_FOUND",404);
    if(proposal.status!=="pending_review"){if(proposal.decision!==input.decision)throw new LiveEventPolicyError("EVENT_CHANGE_ALREADY_REVIEWED");return{status:proposal.status,repeated:true};}
    const {event,ref:eventRef,challengeRef,challengeExists}=await readLiveEvent(db,tx,String(proposal.eventId));
    const now=input.now??Date.now(),iso=new Date(now).toISOString();
    if(input.decision==="approve"){
      const proposed=changesSchema.parse(proposal.proposed);
      if(Number(event.liveEventContentVersion??0)!==proposal.expectedVersion||Object.keys(proposed).some(key=>JSON.stringify(currentValue(event,key))!==JSON.stringify(proposal.before[key])))throw new LiveEventPolicyError("EVENT_DETAILS_CHANGED");
      const next=validate(event,proposed,now),cutoff=liveEventSponsorCutoff(event);
      const fundingOpen=!event.sponsorFundingClosedAt&&Number.isFinite(cutoff)&&now<cutoff;
      const root=Object.fromEntries(Object.entries(proposed).filter(([key])=>!checkInFields.has(key)));
      const patch={...root,...(Object.keys(proposed).some(key=>checkInFields.has(key))?{hostOperations:next.hostOperations}:{}),liveEventContentVersion:Number(event.liveEventContentVersion??0)+1,updatedAt:iso,...(proposed.startsAt&&fundingOpen?{sponsorFundingCutoffAt:proposed.startsAt}:{}),...(!fundingOpen&&!event.sponsorFundingClosedAt&&Number.isFinite(cutoff)?{sponsorFundingClosedAt:new Date(cutoff).toISOString()}:{}),latestEventUpdateId:input.id};
      tx.update(eventRef,patch);if(challengeExists)tx.update(challengeRef,patch);
      tx.create(db.collection("liveEventUpdates").doc(input.id),{eventId:proposal.eventId,changeRequestId:input.id,before:proposal.before,after:proposed,title:"Important event information changed",message:"The event date, time or venue changed after review. Check the updated details and your refund rights before attending.",publishedAt:iso,status:"pending_notification",cursor:null});
      seedLiveEventJobs(db,tx,String(proposal.eventId),next,now);
    }
    tx.update(ref,{status:input.decision==="approve"?"approved":"rejected",decision:input.decision,decisionReason:input.reason,decidedBy:input.actorId,decidedAt:iso});
    tx.create(db.collection("auditLogs").doc(),{actorId:input.actorId,action:`live_event.change_${input.decision}`,eventId:proposal.eventId,targetId:input.id,before:proposal.before,proposed:proposal.proposed,reason:input.reason,createdAt:iso});
    return{status:input.decision==="approve"?"approved":"rejected",repeated:false};
  });
}

export async function cancelLiveEvent(db:Firestore,input:{eventId:string;actorId:string;expectedVersion:number;reason:string;requestKey:string;now?:number}){
  if(input.reason.trim().length<8||input.reason.length>1000||!/^[A-Za-z0-9_-]{8,100}$/.test(input.requestKey))throw new LiveEventPolicyError("CANCELLATION_REASON_REQUIRED",422);
  const action=db.collection("auditLogs").doc(hash(`live-cancel:${input.eventId}:${input.requestKey}`));
  return db.runTransaction(async tx=>{
    const [{event,ref,challengeRef,challengeExists},previous]=await Promise.all([readLiveEvent(db,tx,input.eventId),tx.get(action)]);
    if(previous.exists){if(previous.data()?.actorId!==input.actorId)throw new LiveEventPolicyError("CANCELLATION_REFERENCE_REUSED");return{repeated:true};}
    if(Number(event.liveEventContentVersion??0)!==input.expectedVersion||event.resultsPublishedAt||["completed","deleted","cancelled"].includes(String(event.status)))throw new LiveEventPolicyError("CANCELLATION_REVIEW_REQUIRED");
    const now=new Date(input.now??Date.now()).toISOString(),patch={status:"cancelled",cancelledAt:now,cancelledBy:input.actorId,cancellationReason:input.reason,sponsorFundingClosedAt:event.sponsorFundingClosedAt??now,cancellationReconciliationStatus:"pending",liveEventContentVersion:Number(event.liveEventContentVersion??0)+1,updatedAt:now};
    tx.update(ref,patch);if(challengeExists)tx.update(challengeRef,patch);
    tx.create(action,{actorId:input.actorId,action:"live_event.cancelled",eventId:input.eventId,before:{status:event.status},after:patch,reason:input.reason,createdAt:now});
    wakeLiveEventJob(db,tx,input.eventId,now);
    return{repeated:false};
  });
}

export async function startLiveEvent(db:Firestore,input:{eventId:string;actorId:string;expectedVersion:number;reason:string;requestKey:string;now?:number}){
  if(input.reason.trim().length<8||input.reason.length>1000||!/^[A-Za-z0-9_-]{8,100}$/.test(input.requestKey))throw new LiveEventPolicyError("EVENT_START_CONFIRMATION_REQUIRED",422);
  const audit=db.collection("auditLogs").doc(hash(`live-start:${input.eventId}:${input.requestKey}`));
  return db.runTransaction(async tx=>{
    const [{event,ref,challengeRef,challengeExists},previous]=await Promise.all([readLiveEvent(db,tx,input.eventId),tx.get(audit)]);
    if(previous.exists){if(previous.data()?.actorId!==input.actorId)throw new LiveEventPolicyError("EVENT_START_REFERENCE_REUSED");return{repeated:true};}
    const now=input.now??Date.now();
    if(event.eventApprovalStatus!=="approved"||event.liveEventStartedAt||eventTime(event.endsAt)<=now||["cancelled","completed","rejected","draft"].includes(String(event.status))||Number(event.liveEventContentVersion??0)!==input.expectedVersion)throw new LiveEventPolicyError("EVENT_START_UNAVAILABLE");
    const cutoff=liveEventSponsorCutoff(event);if(!Number.isFinite(cutoff))throw new LiveEventPolicyError("EVENT_FUNDING_REVIEW_REQUIRED");
    const iso=new Date(now).toISOString(),patch={status:"in_progress",liveEventStartedAt:iso,liveEventStartedBy:input.actorId,sponsorFundingCutoffAt:new Date(Math.min(now,cutoff)).toISOString(),sponsorFundingClosedAt:event.sponsorFundingClosedAt??new Date(Math.min(now,cutoff)).toISOString(),liveEventContentVersion:Number(event.liveEventContentVersion??0)+1,updatedAt:iso};
    tx.update(ref,patch);if(challengeExists)tx.update(challengeRef,patch);
    tx.create(audit,{actorId:input.actorId,action:"live_event.physical_start_confirmed",eventId:input.eventId,before:{status:event.status,cutoff:new Date(cutoff).toISOString()},after:patch,reason:input.reason,createdAt:iso});
    wakeLiveEventJob(db,tx,input.eventId,iso);return{repeated:false};
  });
}
