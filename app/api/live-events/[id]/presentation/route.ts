import {createHash,timingSafeEqual} from "node:crypto";
import {getAdminDb} from "@/lib/firebase/admin";
import {readLiveEvent,publicTicket} from "@/lib/server/live-event-admission";
import {validLiveEventRequestOrigin} from "@/lib/server/live-event-request-origin";
import {eventOptions} from "@/lib/live-event-policy";
import {fail,ok,readJson,serverUnavailable} from "@/lib/server/responses";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!validLiveEventRequestOrigin(request))return fail("This request couldn't be verified.",403);
  const db=getAdminDb();if(!db)return serverUnavailable("Your ticket");
  const parsed=await readJson(request);if(parsed.response)return parsed.response;const body=parsed.body??{};
  if(typeof body.ticketId!=="string"||!/^[a-f0-9]{64}$/.test(body.ticketId)||typeof body.credential!=="string"||!/^[a-zA-Z0-9_-]{43}$/.test(body.credential))return fail("This ticket couldn't be verified.",422);
  const {id}=await params;
  try{
    const [ticket,{event}]=await Promise.all([db.collection("liveEventTickets").doc(body.ticketId).get(),db.runTransaction(tx=>readLiveEvent(db,tx,id))]);
    const data=ticket.data()??{},expected=Buffer.from(String(data.credentialHash??"")),actual=Buffer.from(createHash("sha256").update(body.credential).digest("hex"));
    if(!ticket.exists||data.eventId!==id||expected.length!==actual.length||!timingSafeEqual(expected,actual)||event.eventApprovalStatus!=="approved")return fail("This ticket couldn't be verified.",404);
    const response=ok({ticket:publicTicket(data),event:{id,title:event.title,startsAt:event.startsAt,endsAt:event.endsAt,timezone:eventOptions(event).timezone,venueName:event.venueName,address:event.eventAddress,city:event.eventCity,country:event.eventCountry,status:event.status}});
    response.headers.set("Cache-Control","private, no-store");response.headers.set("Referrer-Policy","no-referrer");return response;
  }catch{return fail("This ticket couldn't be verified.",404);}
}
