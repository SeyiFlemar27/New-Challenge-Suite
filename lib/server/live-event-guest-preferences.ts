import type {Firestore} from "firebase-admin/firestore";
import type {EventActor} from "@/lib/server/live-event-admission";
import {LiveEventPolicyError} from "@/lib/live-event-policy";
import {createHash} from "node:crypto";

export const guestEventPreferenceId=(eventId:string,userId:string)=>`live_event_guest_${createHash("sha256").update(JSON.stringify([eventId,userId])).digest("hex")}`;

export function guestEventEmailAllowed(booking:Record<string,unknown>,preferences:Record<string,unknown>|undefined,eventId:string){
  if(!preferences)return booking.announcementEmailConsent===true;
  return preferences.guestSession===true&&preferences.eventId===eventId&&preferences.userId===booking.userId&&preferences.email===true&&preferences.events!==false;
}
/** The actor comes from the verified event-scoped guest session, never the body. */
export async function guestLiveEventEmailPreferences(db:Firestore,input:{eventId:string;actor:EventActor;enabled?:boolean}){
  if(!input.actor.guestSession||!input.actor.emailVerified)throw new LiveEventPolicyError("VERIFIED_GUEST_REQUIRED",403);
  return db.runTransaction(async tx=>{
    const ref=db.collection("notificationPreferences").doc(guestEventPreferenceId(input.eventId,input.actor.uid));
    const [preferences,bookings]=await Promise.all([tx.get(ref),tx.get(db.collection("liveEventBookings").where("userId","==",input.actor.uid).where("eventId","==",input.eventId).limit(101))]);
    if(bookings.size>100)throw new LiveEventPolicyError("PREFERENCES_REVIEW_REQUIRED");
    const owned=bookings.docs.filter(row=>row.data().guestSession===true&&row.data().eventId===input.eventId);
    if(!owned.length)throw new LiveEventPolicyError("BOOKING_NOT_FOUND",404);
    const value=preferences.data();
    if(value&&(value.guestSession!==true||value.eventId!==input.eventId||value.userId!==input.actor.uid))throw new LiveEventPolicyError("PREFERENCES_REVIEW_REQUIRED");
    const before=owned.some(row=>guestEventEmailAllowed(row.data(),value,input.eventId));
    if(input.enabled===undefined)return {enabled:before};
    if(value&&value.email===input.enabled&&value.events===input.enabled)return {enabled:input.enabled,changed:false};
    const now=new Date().toISOString();
    tx.set(ref,{userId:input.actor.uid,eventId:input.eventId,guestSession:true,email:input.enabled,events:input.enabled,updatedAt:now});
    tx.create(db.collection("auditLogs").doc(),{actorId:input.actor.uid,action:"live_event.guest_email_preference_changed",eventId:input.eventId,before:{enabled:before},after:{enabled:input.enabled},createdAt:now});
    return {enabled:input.enabled,changed:true};
  });
}
