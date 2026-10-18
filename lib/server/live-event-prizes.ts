import type {Firestore} from "firebase-admin/firestore";
import {eventKind, eventOptions, liveEventWinnerShares, LiveEventPolicyError} from "@/lib/live-event-policy";
import {readLiveEvent} from "@/lib/server/live-event-admission";

/** Read-only projection of existing financial sources. Never creates entitlements or releases money. */
export async function getLiveEventPrizeBreakdown(db: Firestore, eventId: string) {
  return db.runTransaction(async tx => {
    const [{event}, creator, sponsor, entry] = await Promise.all([
      readLiveEvent(db,tx,eventId),
      tx.get(db.collection("creatorPrizeFundingPayments").where("challengeId","==",eventId).limit(1001)),
      tx.get(db.collection("sponsorContributions").where("challengeId","==",eventId).limit(1001)),
      tx.get(db.collection("cashLedger").where("eventId","==",eventId).limit(1001)),
    ]);
    if(eventKind(event)!=="physical_competition")return {creatorCents:0,sponsorCents:0,entryCents:0,totalCents:0,placements:[]};
    if([creator,sponsor,entry].some(snapshot=>snapshot.size>1000))throw new LiveEventPolicyError("PRIZE_SOURCE_REVIEW_REQUIRED");
    const validAmount=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0;
    const sum=(rows:Record<string,unknown>[])=>rows.reduce((total,row)=>{
      if(!validAmount(row.amountCents))throw new LiveEventPolicyError("PRIZE_SOURCE_REVIEW_REQUIRED");
      const next=total+Number(row.amountCents);if(!Number.isSafeInteger(next))throw new LiveEventPolicyError("PRIZE_SOURCE_REVIEW_REQUIRED");return next;
    },0);
    const eligible=(row:Record<string,unknown>)=>row.status==="confirmed"&&row.webhookConfirmed===true&&row.currency==="USD"&&row.stripeDisputeRestricted!==true&&row.settlementRestricted!==true&&row.refundLiabilityStatus!=="pending"&&!row.refundedAt&&!row.financialRestriction;
    const creatorCents=sum(creator.docs.map(row=>row.data()).filter(row=>eligible(row)&&row.paymentPurpose==="prize_pool_funding"));
    const sponsorCents=sum(sponsor.docs.map(row=>row.data()).filter(row=>eligible(row)&&row.paymentPurpose==="sponsor_funding"));
    const entryRows=entry.docs.map(row=>row.data()).filter(row=>row.sourceType==="host_event_revenue"&&row.revenueType==="entry_fee"&&row.shareType==="winner_share"&&row.direction==="credit"&&row.currency==="USD"&&["held","available"].includes(String(row.status)));
    const bookingIds=[...new Set(entryRows.map(row=>String(row.sourceId??"")))];
    if(bookingIds.some(id=>!id||id.includes("/")))throw new LiveEventPolicyError("PRIZE_SOURCE_REVIEW_REQUIRED");
    const bookings=bookingIds.length?await tx.getAll(...bookingIds.map(id=>db.collection("liveEventBookings").doc(id))):[];
    const accepted=new Set(bookings.filter(row=>row.exists&&row.data()?.eventId===eventId&&row.data()?.paymentConfirmed===true&&!row.data()?.stripeDisputeRestricted&&!row.data()?.fraudReviewRequired&&Number(row.data()?.refundReservedCents??0)===0).map(row=>row.id));
    const entryCents=sum(entryRows.filter(row=>accepted.has(String(row.sourceId))).map(row=>({amountCents:row.netAmountCents})));
    const totalCents=creatorCents+sponsorCents+entryCents;
    if(!Number.isSafeInteger(totalCents))throw new LiveEventPolicyError("PRIZE_SOURCE_REVIEW_REQUIRED");
    const count=Number(eventOptions(event).winnerCount);
    if(![1,2,3].includes(count))throw new LiveEventPolicyError("JUDGING_CONFIGURATION_INVALID");
    return {creatorCents,sponsorCents,entryCents,totalCents,placements:liveEventWinnerShares(totalCents,count).map((amountCents,index)=>({placement:index+1,amountCents})),confirmedOnly:true,settled:false};
  });
}
