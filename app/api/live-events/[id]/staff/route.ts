import {getAdminDb,getAdminAuth} from "@/lib/firebase/admin";
import {requireRequestUser} from "@/lib/server/auth";
import {requireChallengeManagementAccess} from "@/lib/server/challenge-management-access";
import {manageLiveEventStaff,correctLiveEventArrival} from "@/lib/server/live-event-staff";
import {LiveEventPolicyError} from "@/lib/live-event-policy";
import {fail,ok,readJson,serverUnavailable} from "@/lib/server/responses";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params,access=await requireChallengeManagementAccess(request,id,"challenge.edit");
  if(access.response||!access.db)return access.response;
  const staff=await access.db.collection("liveEventStaff").where("eventId","==",id).limit(101).get();
  const response=ok({staff:staff.docs.slice(0,100).map(row=>({userId:row.data().userId,status:row.data().status,expiresAt:row.data().expiresAt})),hasMore:staff.size>100});
  response.headers.set("Cache-Control","private, no-store");return response;
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await requireRequestUser(request);if(auth.response)return auth.response;
  const db=getAdminDb();if(!db)return serverUnavailable("Event staff");
  const {id}=await params,parsed=await readJson(request);if(parsed.response)return parsed.response;const body=parsed.body??{};
  if(!["invite","accept","revoke","correct_arrival"].includes(body.action)||body.confirmed!==true||typeof body.reason!=="string"||typeof body.requestKey!=="string")return fail("Confirm this action and add a reason.",422);
  if(body.action!=="accept"){const access=await requireChallengeManagementAccess(request,id,"challenge.edit");if(access.response)return access.response;}
  try{
    if(body.action==="correct_arrival"){
      if(typeof body.ticketId!=="string"||typeof body.expectedCheckedInAt!=="string")return fail("Choose the recorded arrival to correct.",422);
      return ok(await correctLiveEventArrival(db,{eventId:id,ticketId:body.ticketId,actorId:auth.user.uid,expectedCheckedInAt:body.expectedCheckedInAt,reason:body.reason,requestKey:body.requestKey}),"Arrival corrected. The ticket can be verified again.");
    }
    let target=body.action==="accept"?auth.user.uid:body.userId;
    if(body.action==="invite"&&typeof body.email==="string"){
      if(body.email.length>254)return fail("Enter the staff member's registered email.",422);
      try{target=(await getAdminAuth()?.getUserByEmail(body.email.trim().toLowerCase()))?.uid;}catch{return fail("The invitation couldn't be sent. Ask the staff member to confirm their registered email.",422);}
    }
    if(typeof target!=="string"||!target||target.includes("/")||target.length>150)return fail("Choose a registered staff member.",422);
    return ok(await manageLiveEventStaff(db,{eventId:id,actorId:auth.user.uid,userId:target,action:body.action,reason:body.reason,requestKey:body.requestKey}),body.action==="accept"?"Check-in invitation accepted.":body.action==="revoke"?"Check-in access revoked.":"Check-in invitation sent.");
  }catch(error){if(error instanceof LiveEventPolicyError)return fail("This staff or attendance action couldn't be completed. Refresh the event and check the invitation or arrival state.",error.status,undefined,error.code);return fail("The event action couldn't be completed.",500);}
}
