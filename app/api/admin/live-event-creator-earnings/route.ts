import {getAdminDb} from "@/lib/firebase/admin";
import {requireAdminPermission,requireRecentAdminAuthentication} from "@/lib/server/auth";
import {decideLiveEventCreatorEarnings,previewLiveEventCreatorEarnings} from "@/lib/server/live-event-creator-earnings";
import {fail,ok,readJson,serverUnavailable} from "@/lib/server/responses";

export async function GET(request:Request){
  const access=await requireAdminPermission(request,"finance.view");if(access.response)return access.response;
  const db=getAdminDb();if(!db)return serverUnavailable("Creator earnings review");
  const id=new URL(request.url).searchParams.get("eventId");
  try{
    if(!id){const events=await db.collection("liveEvents").where("status","==","completed").limit(51).get();const response=ok({events:events.docs.slice(0,50).map(row=>({id:row.id,title:String(row.data().title??"Live Event")})),hasMore:events.size>50});response.headers.set("Cache-Control","private, no-store");return response;}
    if(!/^[\w-]{1,150}$/.test(id))return fail("Choose a completed event.",422);
    const response=ok(await previewLiveEventCreatorEarnings(db,id));response.headers.set("Cache-Control","private, no-store");return response;
  }catch{return fail("Completed-event earnings evidence couldn't be verified. All existing holds remain in place.",409);}
}
export async function POST(request:Request){
  const access=await requireRecentAdminAuthentication(request,"settlements.approve");if(access.response)return access.response;
  const db=getAdminDb();if(!db)return serverUnavailable("Creator earnings approval");
  const parsed=await readJson(request);if(parsed.response)return parsed.response;const body=parsed.body??{};
  if(typeof body.eventId!=="string"||!/^[\w-]{1,150}$/.test(body.eventId)||!["approve","clear","hold","reject_approval","resume_review"].includes(body.action)||typeof body.reason!=="string"||body.confirmed!==true||typeof body.fingerprint!=="string"||!/^[a-f0-9]{64}$/.test(body.fingerprint)||typeof body.requestKey!=="string"||(body.sourceId!=null&&(typeof body.sourceId!=="string"||body.sourceId.includes("/"))))return fail("Review the earnings evidence, confirm the action and add a reason.",422);
  try{return ok(await decideLiveEventCreatorEarnings(db,{eventId:body.eventId,adminId:access.user!.uid,action:body.action,reason:body.reason,confirmed:true,requestKey:body.requestKey,fingerprint:body.fingerprint,sourceId:body.sourceId}));}
  catch{return fail("The evidence changed, clearance is incomplete or financial reconciliation is required. No unsafe release was made.",409);}
}
