import { getAdminDb } from "@/lib/firebase/admin";
import { beginGuestVerification, finishGuestVerification } from "@/lib/server/live-event-guests";
import { fail,ok,readJson,serverUnavailable } from "@/lib/server/responses";
import { LiveEventPolicyError } from "@/lib/live-event-policy";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { readLiveEvent } from "@/lib/server/live-event-admission";
import { validLiveEventRequestOrigin } from "@/lib/server/live-event-request-origin";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!validLiveEventRequestOrigin(request))return fail("This request couldn't be verified.",403);
  const db=getAdminDb();if(!db)return serverUnavailable("Email verification");
  const {id}=await params,parsed=await readJson(request);if(parsed.response)return parsed.response;
  const body=parsed.body??{};
  if(typeof body.email!=="string"||body.email.length>254)return fail("Enter your email address.",422);
  if(!consumeRateLimit(`event_guest:${request.headers.get("x-forwarded-for")??"unknown"}:${id}`,{limit:15,windowMs:600000}).allowed)return fail("Please wait before trying again.",429);
  try{
    const {event}=await db.runTransaction(tx=>readLiveEvent(db,tx,id));
    if(event.eventApprovalStatus!=="approved"||event.visibility!=="public")return fail("Event not available.",404);
    if(body.action==="verify"){
      if(typeof body.code!=="string"||typeof body.requestId!=="string")return fail("Enter the code from your email.",422);
      const token=await finishGuestVerification(db,id,body.email,body.requestId,body.code),result=ok({verified:true},"Email verified. You can get your tickets now.");
      result.cookies.set("live_event_guest",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/api/live-events",maxAge:86400});return result;
    }
    if(body.action!=="send")return fail("Choose email verification.",422);
    return ok(await beginGuestVerification(db,id,body.email),"Check your email for your verification code.");
  }catch(error){if(error instanceof LiveEventPolicyError)return fail(error.code==="EMAIL_UNAVAILABLE"?"Email verification is temporarily unavailable. Please try again later.":"We couldn't verify that code. Please try again.",error.status,undefined,error.code);return fail("Email verification couldn't be completed.",500);}
}
