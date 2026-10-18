import {requireChallengeManagementAccess} from "@/lib/server/challenge-management-access";
import {proposeLiveEventChange,cancelLiveEvent,startLiveEvent} from "@/lib/server/live-event-changes";
import {validLiveEventRequestOrigin} from "@/lib/server/live-event-request-origin";
import {LiveEventPolicyError} from "@/lib/live-event-policy";
import {fail,ok,readJson} from "@/lib/server/responses";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!validLiveEventRequestOrigin(request))return fail("This request couldn't be verified.",403);
  const {id}=await params,access=await requireChallengeManagementAccess(request,id,"challenge.edit");
  if(access.response||!access.db||!access.user)return access.response;
  const parsed=await readJson(request);if(parsed.response)return parsed.response;const body=parsed.body??{};
  if(body.confirmed!==true||typeof body.reason!=="string"||typeof body.requestKey!=="string"||!Number.isSafeInteger(body.expectedVersion))return fail("Confirm your request, explain the reason and refresh the event details.",422);
  const base={eventId:id,actorId:access.user.uid,reason:body.reason,requestKey:body.requestKey,expectedVersion:body.expectedVersion};
  try{
    if(body.action==="start")return ok(await startLiveEvent(access.db,base),"The physical event start is recorded. Sponsor prize funding is now closed and cannot be reopened automatically.");
    if(body.action==="cancel")return ok(await cancelLiveEvent(access.db,base),"Event cancelled. Confirmed payments must be returned through the verified refund process; pending returns are not completed refunds.");
    if(body.action!=="propose"||!body.changes||typeof body.changes!=="object"||Array.isArray(body.changes))return fail("Choose the event details to request for review.",422);
    return ok(await proposeLiveEventChange(access.db,{...base,changes:body.changes}),"Your request is awaiting Admin review. Published event details have not changed.");
  }catch(error){return fail(error instanceof LiveEventPolicyError&&error.code==="CHECK_IN_REVIEW_REQUIRED"?"Include both check-in times when requesting a reschedule. They are not shifted automatically.":"This event change requires review or the event has changed. Refresh and check the permitted details.",error instanceof LiveEventPolicyError?error.status:422);}
}
