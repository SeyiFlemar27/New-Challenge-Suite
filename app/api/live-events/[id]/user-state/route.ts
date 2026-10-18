import {getAdminDb} from "@/lib/firebase/admin";
import {requireRequestUser} from "@/lib/server/auth";
import {readLiveEvent} from "@/lib/server/live-event-admission";
import {fail,ok,serverUnavailable} from "@/lib/server/responses";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await requireRequestUser(request);if(auth.response)return auth.response;
  const db=getAdminDb();if(!db)return serverUnavailable("Saved event");
  const {id}=await params;
  try{const {event}=await db.runTransaction(tx=>readLiveEvent(db,tx,id));if(event.visibility!=="public"||event.eventApprovalStatus!=="approved")return fail("Event not found.",404);const engagement=await db.collection("challengeEngagements").doc(`${id}_${auth.user.uid}`).get();const response=ok({saved:engagement.data()?.saved===true});response.headers.set("Cache-Control","private, no-store");return response;}catch{return fail("Saved event status couldn't be verified.",503);}
}
