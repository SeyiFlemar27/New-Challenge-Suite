import { createHash, randomBytes, randomInt } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { getEmailConfigStatus, sendEmail } from "@/lib/server/email";
import { LiveEventPolicyError } from "@/lib/live-event-policy";
import type { EventActor } from "@/lib/server/live-event-admission";

const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
/** No account is created. The one-event guest session only authorizes ticket access/booking. */
export async function beginGuestVerification(db:Firestore,eventId:string,email:string,deliver=sendEmail,now=Date.now()){
  const normalized=email.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)||normalized.length>254)throw new LiveEventPolicyError("EMAIL_INVALID",422);
  if(deliver===sendEmail&&!getEmailConfigStatus().configured)throw new LiveEventPolicyError("EMAIL_UNAVAILABLE",503);
  const key=hash(`${eventId}:${normalized}`),ref=db.collection("liveEventGuestVerifications").doc(key);
  const code=String(randomInt(100000,1000000)),salt=randomBytes(16).toString("hex"),requestId=randomBytes(24).toString("hex");
  await db.runTransaction(async tx=>{
    const previous=await tx.get(ref),value=previous.data()??{};
    if(Number(value.nextSendAt)>now)throw new LiveEventPolicyError("EMAIL_RETRY_LATER",429);
    const count=Number(value.windowStartedAt)>now-3600000?Number(value.sentCount??0):0;
    if(count>=5)throw new LiveEventPolicyError("EMAIL_RETRY_LATER",429);
    tx.set(ref,{eventId,email:normalized,requestId,salt,codeHash:hash(`${salt}:${code}`),attempts:0,expiresAt:now+600000,nextSendAt:now+60000,sentCount:count+1,windowStartedAt:count?value.windowStartedAt:now,status:"pending",createdAt:new Date(now).toISOString()});
  });
  try{await deliver({to:normalized,subject:"Your Challenge Suite ticket verification code",text:`Your code is ${code}. It expires in 10 minutes. If you didn't request tickets, ignore this message.`,html:`<p>Your Challenge Suite verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you didn't request tickets, ignore this message.</p>`,idempotencyKey:`live-guest-${requestId}`});}
  catch{await db.runTransaction(async tx=>{const current=await tx.get(ref);if(current.data()?.requestId===requestId)tx.update(ref,{status:"delivery_failed"});});throw new LiveEventPolicyError("EMAIL_UNAVAILABLE",503);}
  return {requestId};
}
export async function finishGuestVerification(db:Firestore,eventId:string,email:string,requestId:string,code:string,now=Date.now()){
  const normalized=email.trim().toLowerCase(),ref=db.collection("liveEventGuestVerifications").doc(hash(`${eventId}:${normalized}`));
  const token=randomBytes(32).toString("base64url");
  const result=await db.runTransaction(async tx=>{
    const snap=await tx.get(ref),data=snap.data()??{};
    if(!snap.exists||data.eventId!==eventId||data.requestId!==requestId||data.status!=="pending"||Number(data.expiresAt)<=now||Number(data.attempts)>=5)return false;
    if(hash(`${data.salt}:${code}`)!==data.codeHash){tx.update(ref,{attempts:Number(data.attempts)+1});return false;}
    tx.update(ref,{status:"verified",verifiedAt:new Date(now).toISOString(),codeHash:null});
    tx.create(db.collection("liveEventGuestSessions").doc(hash(token)),{eventId,email:normalized,guestId:`guest_${hash(normalized)}`,expiresAt:now+86400000,createdAt:new Date(now).toISOString()});return true;
  });
  if(!result)throw new LiveEventPolicyError("EMAIL_CODE_NOT_VERIFIED",422);
  return token;
}
export async function eventGuestActor(db:Firestore,request:Request,eventId:string):Promise<EventActor|null>{
  const token=(request.headers.get("cookie")??"").split(";").map(value=>value.trim()).find(value=>value.startsWith("live_event_guest="))?.slice("live_event_guest=".length);
  if(!token||!/^[a-zA-Z0-9_-]{43}$/.test(token))return null;
  const session=await db.collection("liveEventGuestSessions").doc(hash(token)).get(),data=session.data();
  if(!session.exists||data?.eventId!==eventId||Number(data?.expiresAt)<=Date.now())return null;
  return {uid:String(data.guestId),email:String(data.email),emailVerified:true,guestSession:true};
}
