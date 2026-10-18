import {getAdminDb} from "@/lib/firebase/admin";
import {requireAdminPermission, requireRecentAdminAuthentication} from "@/lib/server/auth";
import {approveLiveEventSettlement, clearLiveEventWinnerCredits, previewLiveEventSettlement} from "@/lib/server/live-event-settlement";
import {fail,ok,readJson,serverUnavailable} from "@/lib/server/responses";

export async function GET(request:Request){
  const access=await requireAdminPermission(request,"finance.view");if(access.response)return access.response;
  const db=getAdminDb();if(!db)return serverUnavailable("Live Event financial review");
  const eventId=new URL(request.url).searchParams.get("eventId");
  if(!eventId){
    const rows=await db.collection("liveEvents").where("eventPrizeSettlementStatus","in",["awaiting_financial_verification","approved_pending_clearance","on_hold"]).limit(51).get();
    const response=ok({events:rows.docs.slice(0,50).map(row=>({id:row.id,title:String(row.data().title??"Live Event"),status:row.data().settlementRestricted||row.data().stripeDisputeRestricted||row.data().liveEventFinancialReviewRequired||row.data().financialRestriction?"on_hold":String(row.data().eventPrizeSettlementStatus)})),hasMore:rows.size>50});response.headers.set("Cache-Control","private, no-store");return response;
  }
  if(!/^[\w-]{1,150}$/.test(eventId))return fail("Choose an event to review.",422);
  try{const response=ok(await previewLiveEventSettlement(db,eventId));response.headers.set("Cache-Control","private, no-store");return response;}
  catch{return fail("This event needs financial or judging reconciliation before approval. No credits were created.",409);}
}
export async function POST(request:Request){
  const access=await requireRecentAdminAuthentication(request,"settlements.approve");if(access.response)return access.response;
  const db=getAdminDb();if(!db)return serverUnavailable("Live Event financial approval");
  const parsed=await readJson(request);if(parsed.response)return parsed.response;const body=parsed.body??{};
  if(typeof body.eventId!=="string"||!/^[\w-]{1,150}$/.test(body.eventId)||typeof body.fingerprint!=="string"||!/^[a-f0-9]{64}$/.test(body.fingerprint)||typeof body.reason!=="string"||body.confirmed!==true)return fail("Review the current evidence, confirm approval and provide a reason.",422);
  try{return ok(await approveLiveEventSettlement(db,{eventId:body.eventId,fingerprint:body.fingerprint,reason:body.reason,confirmed:true,adminId:access.user!.uid}));}
  catch{return fail("The evidence changed or funds require reconciliation. Refresh the financial review; no unsafe credit was created.",409);}
}
export async function PATCH(request:Request){
  const access=await requireRecentAdminAuthentication(request,"settlements.approve");if(access.response)return access.response;
  const db=getAdminDb();if(!db)return serverUnavailable("Live Event financial clearance");
  const parsed=await readJson(request);if(parsed.response)return parsed.response;const body=parsed.body??{};
  if(typeof body.eventId!=="string"||!/^[\w-]{1,150}$/.test(body.eventId)||typeof body.reason!=="string"||body.confirmed!==true)return fail("Confirm clearance and provide a reason.",422);
  try{return ok(await clearLiveEventWinnerCredits(db,{eventId:body.eventId,adminId:access.user!.uid,reason:body.reason,confirmed:true}));}
  catch{return fail("The clearance period or financial reconciliation is incomplete. Funds remain held.",409);}
}
