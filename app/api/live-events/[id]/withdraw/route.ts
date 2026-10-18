import {getRequestUser} from "@/lib/server/auth";
import {getAdminDb} from "@/lib/firebase/admin";
import {validLiveEventRequestOrigin} from "@/lib/server/live-event-request-origin";
import {withdrawLiveEventCompetition} from "@/lib/server/live-event-withdrawal";
import {LiveEventPolicyError} from "@/lib/live-event-policy";
import {fail,ok,readJson,serverUnavailable} from "@/lib/server/responses";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!validLiveEventRequestOrigin(request))return fail("This request couldn't be verified.",403);
  const user=await getRequestUser(request);if(!user)return fail("Sign in to manage your competition entry.",401);
  const db=getAdminDb();if(!db)return serverUnavailable("Competition withdrawal");
  const parsed=await readJson(request);if(parsed.response)return parsed.response;
  const body=parsed.body??{};
  if(body.confirmed!==true||typeof body.reason!=="string"||typeof body.requestKey!=="string")return fail("Add a reason and confirm that you want to withdraw from competing.",422);
  try{return ok(await withdrawLiveEventCompetition(db,{eventId:(await params).id,userId:user.uid,reason:body.reason,requestKey:body.requestKey}),"Your competition entry is withdrawn. Admission is retained. Competition entry fees are not refunded; admission refunds follow your booking policy.");}
  catch(error){return fail("This entry couldn't be withdrawn. If results are final or your booking is under review, contact Support.",error instanceof LiveEventPolicyError?error.status:500);}
}
