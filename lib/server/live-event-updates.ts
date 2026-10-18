import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { eventTime, LiveEventPolicyError } from "@/lib/live-event-policy";

/** Notification creation is not falsely equated with email delivery or customer acknowledgement. */
export async function expandLiveEventUpdate(db:Firestore,id:string){
  const ref=db.collection("liveEventUpdates").doc(id);
  return db.runTransaction(async tx=>{
    const snapshot=await tx.get(ref),update=snapshot.data()??{};
    if(!snapshot.exists||update.status==="notifications_queued")return{complete:true};
    let query=db.collection("liveEventBookings").where("eventId","==",update.eventId).orderBy(FieldPath.documentId()).limit(50);
    if(typeof update.cursor==="string")query=query.startAfter(update.cursor);
    const bookings=await tx.get(query);
    const recipients=bookings.docs.filter(row=>["confirmed","admission_revoked"].includes(String(row.data().status))&&eventTime(row.data().createdAt)<=eventTime(update.publishedAt));
    const targets=await Promise.all(recipients.map(async booking=>{const outbox=db.collection("liveEventEmailOutbox").doc(`update_${id}_${booking.id}`);return{booking,outbox,previous:await tx.get(outbox)};}));
    const now=new Date().toISOString();
    for(const target of targets){
      if(target.previous.exists)continue;
      const source=target.booking.data();
      if(eventTime(source.materialChangePublishedAt)>eventTime(update.publishedAt))continue;
      tx.create(target.outbox,{eventId:update.eventId,bookingId:target.booking.id,userId:source.userId,type:"material_event_update",title:update.title,message:`${String(update.message)} Open the event to review the changes and refund options. Material-change refunds can be requested within seven days of notification or before the revised event begins, whichever is earlier.`,status:"pending",createdAt:now});
      if(source.materialChangeUpdateId!==id||!source.materialChangeNotifiedAt)tx.update(target.booking.ref,{materialChangeUpdateId:id,materialChangePublishedAt:update.publishedAt,materialChangeNoticeStatus:"queued",materialChangeNotifiedAt:null,updatedAt:now});
      if(!source.guestSession)tx.set(db.collection("notifications").doc(`live_update_${id}_${source.userId}`),{userId:source.userId,type:"live_event_material_change",title:update.title,message:update.message,actionUrl:`/live-events/${update.eventId}`,read:false,createdAt:now});
    }
    const complete=bookings.size<50;
    tx.update(ref,{cursor:bookings.docs.at(-1)?.id??update.cursor??null,status:complete?"notifications_queued":"pending_notification",updatedAt:now});
    return{complete};
  });
}

/** Explicit authenticated/verified-guest acknowledgement provides a real server-recorded notice timestamp. */
export async function acknowledgeLiveEventUpdate(db:Firestore,input:{eventId:string;userId:string;updateId:string;now?:number}){
  return db.runTransaction(async tx=>{
    const [update,bookings]=await Promise.all([tx.get(db.collection("liveEventUpdates").doc(input.updateId)),tx.get(db.collection("liveEventBookings").where("eventId","==",input.eventId).where("userId","==",input.userId).limit(101))]);
    const value=update.data()??{};
    if(!update.exists||value.eventId!==input.eventId)throw new LiveEventPolicyError("EVENT_UPDATE_NOT_FOUND",404);
    if(bookings.size>100)throw new LiveEventPolicyError("BOOKING_NOTICE_REVIEW_REQUIRED");
    const now=new Date(input.now??Date.now()).toISOString();let acknowledged=0;
    for(const booking of bookings.docs){
      const source=booking.data();
      if(eventTime(source.materialChangePublishedAt)>eventTime(value.publishedAt))continue;
      if(!["confirmed","admission_revoked"].includes(String(source.status))||eventTime(source.createdAt)>eventTime(value.publishedAt)||source.materialChangeUpdateId===input.updateId&&source.materialChangeNotifiedAt)continue;
      tx.update(booking.ref,{materialChangeUpdateId:input.updateId,materialChangePublishedAt:value.publishedAt,materialChangeNoticeStatus:"acknowledged",materialChangeNotifiedAt:now,updatedAt:now});acknowledged++;
    }
    tx.create(db.collection("auditLogs").doc(),{actorId:input.userId,action:"live_event.material_change_acknowledged",eventId:input.eventId,targetId:input.updateId,bookingsAcknowledged:acknowledged,createdAt:now});
    return{acknowledged,notifiedAt:now};
  });
}
