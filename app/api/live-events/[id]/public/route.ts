import { getAdminDb } from "@/lib/firebase/admin";
import { eventCapacities, eventKind, eventOptions, isPublicApprovedLiveEvent,LiveEventPolicyError } from "@/lib/live-event-policy";
import { readLiveEvent } from "@/lib/server/live-event-admission";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
import {getLiveEventPrizeBreakdown} from "@/lib/server/live-event-prizes";
import {toPublicProfile} from "@/lib/server/public-profile";
import {isQaDemoOrPlaceholderProfile} from "@/lib/server/public-challenge";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Event details");
  try {
    const { id } = await params;
    const { event } = await db.runTransaction(tx => readLiveEvent(db, tx, id));
    if (!isPublicApprovedLiveEvent(event)) return fail("Event not found.", 404);
    const options = eventOptions(event), capacities = eventCapacities(event);
    const published=event.resultsPublishedAt&&Array.isArray(event.publishedPhysicalResults)?event.publishedPhysicalResults:[];
    if(published.length>3||new Set(published.map((row:Record<string,unknown>)=>row?.userId)).size!==published.length||published.some((row:Record<string,unknown>,index:number)=>!row||typeof row.userId!=="string"||!row.userId||row.userId.length>1500||row.userId.includes("/")||row.placement!==index+1||typeof row.score!=="number"||!Number.isSafeInteger(row.score)||row.score<0))throw new LiveEventPolicyError("RESULTS_REVIEW_REQUIRED");
    const results=await Promise.all(published.map(async(row:{userId:string;placement:number;score:number})=>{
      const [profileSnap,accountSnap]=await db.getAll(db.collection("profiles").doc(row.userId),db.collection("users").doc(row.userId));
      const profile=profileSnap.data()??{},account=accountSnap.data()??{};
      const visible=profileSnap.exists&&accountSnap.exists&&!isQaDemoOrPlaceholderProfile(row.userId,{...account,...profile})&&profile.publicProfile!==false&&profile.profileVisibility!=="private"&&profile.status!=="suspended"&&!account.disabled&&!account.suspended&&!["disabled","suspended","deleted","deactivated","deletion_requested"].includes(String(account.accountStatus));
      // Public profiles only: registration names, emails and internal account IDs stay private.
      return {id:`winner-${row.placement}`,placement:row.placement,score:row.score,displayName:visible?toPublicProfile("",{...profile,email:""}).displayName:null};
    }));
    const prizeBreakdown=eventKind(event)==="physical_competition"?await getLiveEventPrizeBreakdown(db,id):null;
    const updates=await db.collection("liveEventUpdates").where("eventId","==",id).orderBy("publishedAt","desc").limit(20).get();
    return ok({ event: {
      id: event.id, title: event.title, description: event.description, cover: event.coverImageUrl ?? event.imageUrl,
      kind: eventKind(event), status: event.status, startsAt: event.startsAt, endsAt: event.endsAt,
      timezone: options.timezone, venueName: event.venueName, address: event.eventAddress,
      city: event.eventCity, state: event.eventState, country: event.eventCountry,
      rules: Array.isArray(options.eventRules) ? options.eventRules : [],
      instructions: eventKind(event) === "physical_competition" ? options.competitionInstructions ?? [] : options.ticketInstructions ?? "",
      admissionPrice: Number(options.ticketPrice ?? event.ticketPrice ?? 0), entryPrice: Number(options.competitionEntryFee ?? 0),
      paidCheckoutAvailable: process.env.LIVE_EVENT_PAID_CHECKOUT_ENABLED === "true" && Boolean(process.env.STRIPE_SECRET_KEY) && Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      bookingUnavailableReason: Number(options.ticketPrice ?? 0) > 0 || Number(options.competitionEntryFee ?? 0) > 0 ? "Paid booking is unavailable unless verified checkout is enabled. Publication does not enable payments." : null,
      audienceAvailable: Math.max(0, capacities.audience - Number(event.audienceCount) - Number(event.audienceReserved)),
      competitorAvailable: Math.max(0, capacities.competitors - Number(event.competitorCount) - Number(event.competitorReserved)),
      registrationOpensAt: options.registrationOpensAt, registrationClosesAt: options.registrationClosesAt,
      winnerCount: eventKind(event) === "physical_competition" ? options.winnerCount ?? null : null,
      prizeType:event.prizeType??null,prizeDescription:typeof event.prizeDescription==="string"?event.prizeDescription:"",
      confirmedPrizeCents: prizeBreakdown?.totalCents??0, prizeBreakdown,
      results, resultsPublishedAt: event.resultsPublishedAt ?? null,
      financialStatus: event.resultsPublishedAt ? event.settlementRestricted||event.stripeDisputeRestricted||event.liveEventFinancialReviewRequired||event.financialRestriction ? "On Hold" : ({awaiting_financial_verification:"Pending Financial Review",approved_pending_clearance:"Approved — Pending Clearance",on_hold:"On Hold",available:"Available"}[String(event.eventPrizeSettlementStatus)]??"Pending Financial Review") : null,
      hostName:event.creatorName??event.hostName??"Event organizer",hostId:event.creatorId??event.hostId??null,
      updates:updates.docs.map(row=>({id:row.id,title:row.data().title,message:row.data().message,before:row.data().before,after:row.data().after,publishedAt:row.data().publishedAt})),
    } });
  } catch (error) {
    if (error instanceof LiveEventPolicyError) return fail("Event not available.", error.status);
    return fail("Event details couldn't be loaded.", 500);
  }
}
