import {getAdminDb} from "@/lib/firebase/admin";
import {getRequestUser} from "@/lib/server/auth";
import {eventGuestActor} from "@/lib/server/live-event-guests";
import {acknowledgeLiveEventUpdate} from "@/lib/server/live-event-updates";
import {validLiveEventRequestOrigin} from "@/lib/server/live-event-request-origin";
import {fail,ok,readJson,serverUnavailable} from "@/lib/server/responses";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!validLiveEventRequestOrigin(request))return fail("This request couldn't be verified.",403);
  const db=getAdminDb();if(!db)return serverUnavailable("Event updates");
  const {id}=await params,user=await getRequestUser(request)??await eventGuestActor(db,request,id);
  if(!user)return fail("Verify your email before reviewing your booking's changes.",401);
  const parsed=await readJson(request);if(parsed.response)return parsed.response;
  if(typeof parsed.body?.updateId!=="string"||!/^[a-f0-9]{64}$/.test(parsed.body.updateId)||parsed.body.confirmed!==true)return fail("Confirm that you reviewed the event change.",422);
  try{return ok(await acknowledgeLiveEventUpdate(db,{eventId:id,userId:user.uid,updateId:parsed.body.updateId}),"Your review is recorded. Applicable material-change refund requests must be made within seven days of notification or before the revised event begins, whichever is earlier.");}catch{return fail("Your event update couldn't be verified. Contact Support if you need help with refund rights.",409);}
}
