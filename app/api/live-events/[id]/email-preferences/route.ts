import {getAdminDb} from "@/lib/firebase/admin";
import {eventGuestActor} from "@/lib/server/live-event-guests";
import {guestLiveEventEmailPreferences} from "@/lib/server/live-event-guest-preferences";
import {validLiveEventRequestOrigin} from "@/lib/server/live-event-request-origin";
import {LiveEventPolicyError} from "@/lib/live-event-policy";
import {fail,ok,readJson,serverUnavailable} from "@/lib/server/responses";

async function handle(request:Request,params:Promise<{id:string}>,update:boolean){
  if(update&&!validLiveEventRequestOrigin(request))return fail("This request couldn't be verified.",403);
  const db=getAdminDb();if(!db)return serverUnavailable("Guest email preferences");
  const {id}=await params,actor=await eventGuestActor(db,request,id);
  if(!actor)return fail("Verify your booking email to manage optional event messages.",401);
  let enabled:boolean|undefined;
  if(update){const parsed=await readJson(request);if(parsed.response)return parsed.response;if(typeof parsed.body?.enabled!=="boolean")return fail("Choose whether to receive optional messages.",422);enabled=parsed.body.enabled;}
  try{const response=ok(await guestLiveEventEmailPreferences(db,{eventId:id,actor,enabled}));response.headers.set("Cache-Control","private, no-store");return response;}
  catch(error){return fail("Your event email preferences could not be updated. Please verify your booking and try again.",error instanceof LiveEventPolicyError?error.status:503);}
}
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return handle(request,params,false);}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){return handle(request,params,true);}
