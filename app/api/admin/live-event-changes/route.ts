import {getAdminDb} from "@/lib/firebase/admin";
import {requireAdminPermission,requireRecentAdminAuthentication} from "@/lib/server/auth";
import {decideLiveEventChange} from "@/lib/server/live-event-changes";
import {fail,ok,readJson,serverUnavailable} from "@/lib/server/responses";
export async function GET(request:Request){
  const access=await requireAdminPermission(request,"challenges.review");if(access.response)return access.response;
  const db=getAdminDb();if(!db)return serverUnavailable("Event change review");
  const rows=await db.collection("liveEventChangeRequests").where("status","==","pending_review").limit(100).get();
  const response=ok({requests:rows.docs.map(row=>({id:row.id,...row.data()}))});response.headers.set("Cache-Control","private, no-store");return response;
}
export async function POST(request:Request){
  const access=await requireRecentAdminAuthentication(request,"challenges.review");if(access.response)return access.response;
  const db=getAdminDb();if(!db)return serverUnavailable("Event change review");
  const parsed=await readJson(request);if(parsed.response)return parsed.response;const body=parsed.body??{};
  if(body.confirmed!==true||typeof body.id!=="string"||typeof body.reason!=="string"||!["approve","reject"].includes(body.decision))return fail("Confirm the review decision and add a reason.",422);
  try{return ok(await decideLiveEventChange(db,{id:body.id,actorId:access.user!.uid,decision:body.decision,reason:body.reason}));}
  catch{return fail("This event request changed or can no longer be applied. No unsafe change was made.",409);}
}
