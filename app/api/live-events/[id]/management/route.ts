import { requireChallengeManagementAccess } from "@/lib/server/challenge-management-access";
import { readLiveEvent } from "@/lib/server/live-event-admission";
import { recordPhysicalEventResults } from "@/lib/server/live-event-results";
import { eventKind, eventOptions, LiveEventPolicyError } from "@/lib/live-event-policy";
import { fail,ok,readJson } from "@/lib/server/responses";
import { validLiveEventRequestOrigin } from "@/lib/server/live-event-request-origin";
import { FieldPath } from "firebase-admin/firestore";

export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params,access=await requireChallengeManagementAccess(request,id,"challenge.edit");
  if(access.response||!access.db)return access.response;
  const db=access.db;
  const search=new URL(request.url).searchParams;
  const keys=["ticketsAfter","registrationsAfter","scoresAfter"] as const;
  if(keys.some(key=>{const value=search.get(key);return value!==null&&(!value||value.length>1500||value.includes("/")||value==="."||value==="..");}))return fail("This roster page reference is invalid. Reload event management.",422);
  // The event filter and management permission apply on every page. Cursors confer no access.
  const page=(collection:string,key:typeof keys[number])=>{
    let query=db.collection(collection).where("eventId","==",id).orderBy(FieldPath.documentId());
    const after=search.get(key);if(after)query=query.startAfter(after);
    return query.limit(101).get();
  };
  try {
  const [{event},ticketPage,registrationPage,scorePage]=await Promise.all([db.runTransaction(tx=>readLiveEvent(db,tx,id)),page("liveEventTickets","ticketsAfter"),page("liveEventRegistrations","registrationsAfter"),page("liveEventPhysicalScores","scoresAfter")]);
  const tickets={docs:ticketPage.docs.slice(0,100)},registrations={docs:registrationPage.docs.slice(0,100)},scores={docs:scorePage.docs.slice(0,100)};
  const hasMore=ticketPage.size>100||registrationPage.size>100||scorePage.size>100;
  const nextCursor=hasMore?Object.fromEntries([["ticketsAfter",tickets.docs.at(-1)?.id??search.get("ticketsAfter")],["registrationsAfter",registrations.docs.at(-1)?.id??search.get("registrationsAfter")],["scoresAfter",scores.docs.at(-1)?.id??search.get("scoresAfter")]].filter(([,value])=>Boolean(value))):null;
  const result=ok({event:{changeContext:{...Object.fromEntries(["startsAt","endsAt","venueName","eventAddress","eventCity","eventState","eventCountry"].map(key=>[key,event[key]??""])),checkInStartAt:eventOptions(event).checkInStartAt??"",checkInEndAt:eventOptions(event).checkInEndAt??"",timezone:eventOptions(event).timezone??""},id,kind:eventKind(event),title:event.title,status:event.status,audienceCount:event.audienceCount,competitorCount:event.competitorCount,checkInCount:event.checkInCount,physicalResultsVersion:event.physicalResultsVersion??0,physicalJudgeCountLocked:event.physicalJudgeCountLocked??null,liveEventContentVersion:event.liveEventContentVersion??0,resultsPublishedAt:event.resultsPublishedAt??null},tickets:tickets.docs.map(row=>({id:row.id,name:row.data().guestName,kind:row.data().kind,status:row.data().status,checkedInAt:row.data().checkedInAt??null})),competitors:registrations.docs.filter(row=>row.data().kind==="competitor").map(row=>({userId:row.data().userId,name:row.data().fullName,status:row.data().status,eligible:row.data().eligible,checkedInAt:row.data().checkedInAt??null})),scores:scores.docs.map(row=>({userId:row.data().userId,scores:row.data().scores})),hasMore,nextCursor});
  result.headers.set("Cache-Control","private, no-store");return result;
  } catch(error) {return fail("The event roster couldn't be loaded. Try again or contact Support.",error instanceof LiveEventPolicyError?error.status:503);}
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!validLiveEventRequestOrigin(request))return fail("This request couldn't be verified.",403);
  const {id}=await params,access=await requireChallengeManagementAccess(request,id,"challenge.edit");
  if(access.response||!access.db||!access.user)return access.response;
  const parsed=await readJson(request);if(parsed.response)return parsed.response;const body=parsed.body??{};
  if(!["scores","announce"].includes(body.action)||typeof body.reason!=="string"||typeof body.requestKey!=="string"||!Number.isSafeInteger(body.expectedVersion))return fail("Confirm the action and add a reason.",422);
  if(body.action==="scores"&&(typeof body.competitorId!=="string"||!Array.isArray(body.scores)||body.scores.some((value:unknown)=>typeof value!=="number")))return fail("Enter every physical judge's score.",422);
  try{return ok(await recordPhysicalEventResults(access.db,{eventId:id,actorId:access.user.uid,reason:body.reason,requestKey:body.requestKey,expectedVersion:body.expectedVersion,...(body.action==="scores"?{action:"scores",competitorId:body.competitorId,scores:body.scores}:{action:"announce",confirmed:body.confirmed===true})}),body.action==="announce"?"Results announced.":"Physical scores saved.");}
  catch(error){if(error instanceof LiveEventPolicyError)return fail(error.code==="PHYSICAL_TIE_ASSESSMENT_REQUIRED"?"The judges must resolve the tied winning position at the venue before results can be announced.":"These results can't be saved. Check attendance, all judges' scores and the latest event state.",error.status,undefined,error.code);return fail("Results couldn't be saved. Please try again.",500);}
}
