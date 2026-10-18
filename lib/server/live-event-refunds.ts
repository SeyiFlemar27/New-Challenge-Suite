import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { allocateLiveEventRevenue, liveEventRefundEligibility, LiveEventPolicyError, type AdmissionRefundPolicy } from "@/lib/live-event-policy";
import { readLiveEvent } from "@/lib/server/live-event-admission";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const objectId = (value: unknown): string | null => typeof value === "string" ? value : value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : null;

/** Queue an independently traceable individual-ticket liability in the existing refund system. */
export async function queueLiveEventTicketRefund(db: Firestore, input: { eventId: string; ticketId: string; actorId: string; managementAuthorized?: boolean; reason: string; requestKey: string; now?: number }) {
  if (!/^[a-f0-9]{64}$/.test(input.ticketId) || !/^[A-Za-z0-9_-]{8,100}$/.test(input.requestKey) || input.reason.trim().length < 5 || input.reason.length > 1000) throw new LiveEventPolicyError("REFUND_CONFIRMATION_REQUIRED", 422);
  const caseRef = db.collection("refundCases").doc(`live_ticket_${hash(`${input.ticketId}:${input.requestKey}`)}`);
  return db.runTransaction(async tx => {
    const [ticket, previous, { event,ref:eventRef,challengeRef,challengeExists }] = await Promise.all([tx.get(db.collection("liveEventTickets").doc(input.ticketId)), tx.get(caseRef), readLiveEvent(db, tx, input.eventId)]);
    const value = ticket.data() ?? {};
    if (!ticket.exists || value.eventId !== input.eventId || !input.managementAuthorized && value.userId !== input.actorId) throw new LiveEventPolicyError("TICKET_NOT_FOUND", 404);
    if (previous.exists) {
      if (previous.data()?.actorId !== input.actorId || previous.data()?.ticketId !== ticket.id) throw new LiveEventPolicyError("REFUND_REFERENCE_REUSED");
      return { refundCaseId: caseRef.id, status: String(previous.data()?.status), repeated: true };
    }
    if(value.status==="upgrade_pending")throw new LiveEventPolicyError("ADMISSION_UPGRADE_PENDING");
    if(!["confirmed","checked_in","converted","refund_pending","admission_revoked","refunded"].includes(String(value.status)))throw new LiveEventPolicyError("TICKET_NOT_FOUND",404);
    const convertedPass=typeof value.convertedToTicketId==="string"&&/^[a-f0-9]{64}$/.test(value.convertedToTicketId)?await tx.get(db.collection("liveEventTickets").doc(value.convertedToTicketId)):null;
    if(value.convertedToTicketId&&(!convertedPass?.exists||convertedPass.data()?.admissionSourceTicketId!==ticket.id||convertedPass.data()?.eventId!==input.eventId||convertedPass.data()?.userId!==value.userId))throw new LiveEventPolicyError("REFUND_PAYMENT_REVIEW_REQUIRED");
    const bookingRef = db.collection("liveEventBookings").doc(String(value.bookingId)), bookingSnap = await tx.get(bookingRef), booking = bookingSnap.data() ?? {};
    if (!bookingSnap.exists || booking.eventId !== input.eventId || booking.paymentConfirmed !== true || !booking.providerPaymentIntentId) throw new LiveEventPolicyError("REFUND_PAYMENT_REVIEW_REQUIRED");
    const quantity = Number(booking.quantity), admission = Number(booking.admissionCents) / quantity, entry = value.kind === "competitor" ? Number(booking.competitionEntryCents) : 0;
    if (![admission, entry].every(amount => Number.isSafeInteger(amount) && amount >= 0)) throw new LiveEventPolicyError("REFUND_PAYMENT_REVIEW_REQUIRED");
    const now = input.now ?? Date.now(), iso = new Date(now).toISOString();
    const policy = liveEventRefundEligibility({ policy: booking.admissionRefundPolicy as AdmissionRefundPolicy, startsAt: booking.bookedEventStartsAt, revisedStartsAt: event.startsAt, materialChangeNotifiedAt: booking.materialChangeNotifiedAt, now, used: Boolean(value.checkedInAt||convertedPass?.data()?.checkedInAt), organizerCancelled: event.status === "cancelled" && Boolean(event.cancelledAt), admissionCents: admission, competitionEntryCents: entry });
    const admissionCents = Math.max(0, policy.admissionCents - Number(value.admissionRefundedCents ?? 0) - Number(value.admissionRefundReservedCents ?? 0));
    const competitionEntryCents = Math.max(0, policy.competitionEntryCents - Number(value.entryRefundedCents ?? 0) - Number(value.entryRefundReservedCents ?? 0));
    if (!policy.eligible || admissionCents + competitionEntryCents <= 0) throw new LiveEventPolicyError("VOLUNTARY_REFUND_UNAVAILABLE");
    const ledger = await tx.get(db.collection("cashLedger").where("sourceId", "==", bookingSnap.id));
    const restricted = booking.settlementReleasedAt || booking.stripeDisputeRestricted || booking.fraudReviewRequired || ledger.docs.some(row => row.data().liveEventSettlementId || row.data().externalPayoutExecuted === true || row.data().metadata?.externalPayoutExecuted === true || ["available", "paid", "paid_out", "processing", "withdrawal_requested"].includes(String(row.data().status)));
    const status = restricted ? "financial_hold" : "approved";
    if(competitionEntryCents>0&&ledger.docs.some(row=>row.data().liveEventSettlementId)){
      const hold={settlementRestricted:true,liveEventFinancialReviewRequired:true,eventPrizeSettlementStatus:"on_hold",updatedAt:iso};
      tx.update(eventRef,hold);if(challengeExists)tx.update(challengeRef,hold);
    }
    tx.create(caseRef, { id: caseRef.id, type: "live_event_ticket_refund", paymentCollection: "liveEventBookings", paymentId: bookingSnap.id, eventId: input.eventId, ticketId: ticket.id, userId: value.userId, actorId: input.actorId, provider: "stripe", providerPaymentIntentId: booking.providerPaymentIntentId, amountCents: admissionCents + competitionEntryCents, admissionCents, competitionEntryCents, currency: booking.currency, cause: policy.reason, reason: input.reason, status, automaticPolicyEligible: !restricted, providerRefundId: null, createdAt: iso, updatedAt: iso });
    tx.update(ticket.ref, { status: "refund_pending", admissionRefundReservedCents: Number(value.admissionRefundReservedCents ?? 0) + admissionCents, entryRefundReservedCents: Number(value.entryRefundReservedCents ?? 0) + competitionEntryCents, updatedAt: iso });
    if(convertedPass?.exists&&!convertedPass.data()?.capacityReleased)tx.update(convertedPass.ref,{status:"refund_pending",admissionSourceRefundCaseId:caseRef.id,updatedAt:iso});
    tx.update(bookingRef, { refundReservedCents: Number(booking.refundReservedCents ?? 0) + admissionCents + competitionEntryCents, settlementRestricted: true, updatedAt: iso });
    tx.create(db.collection("auditLogs").doc(), { actorId: input.actorId, action: "live_event.refund_requested", eventId: input.eventId, targetId: caseRef.id, before: { ticketStatus: value.status }, after: { status, amountCents: admissionCents + competitionEntryCents }, reason: input.reason, createdAt: iso });
    return { refundCaseId: caseRef.id, status, repeated: false };
  });
}

/** A converted pass retains two original payment sources; each is independently reconciled. */
export async function queueLiveEventPassRefunds(db:Firestore,input:Parameters<typeof queueLiveEventTicketRefund>[1]){
  if(!/^[a-f0-9]{64}$/.test(input.ticketId)||!/^[\w-]{8,100}$/.test(input.requestKey)||input.reason.trim().length<5||input.reason.length>1000)throw new LiveEventPolicyError("REFUND_CONFIRMATION_REQUIRED",422);
  const pass=await db.collection("liveEventTickets").doc(input.ticketId).get(),value=pass.data();
  if(!value?.admissionSourceTicketId)return [await queueLiveEventTicketRefund(db,input)];
  if(value.eventId!==input.eventId||!input.managementAuthorized&&value.userId!==input.actorId||typeof value.admissionSourceTicketId!=="string"||!/^[a-f0-9]{64}$/.test(value.admissionSourceTicketId))throw new LiveEventPolicyError("TICKET_NOT_FOUND",404);
  const original=await db.collection("liveEventTickets").doc(value.admissionSourceTicketId).get();
  if(!original.exists||original.data()?.convertedToTicketId!==pass.id||original.data()?.userId!==value.userId||original.data()?.eventId!==input.eventId)throw new LiveEventPolicyError("REFUND_PAYMENT_REVIEW_REQUIRED");
  const sources=[original,pass],results=[];
  for(const ticket of sources){
    const booking=await db.collection("liveEventBookings").doc(String(ticket.data()?.bookingId)).get();
    if(booking.exists&&booking.data()?.amountCents===0)continue;
    try{results.push(await queueLiveEventTicketRefund(db,{...input,ticketId:ticket.id,requestKey:hash(`${input.requestKey}:${ticket.id}`)}));}
    catch(error){
      if(error instanceof LiveEventPolicyError&&error.code==="VOLUNTARY_REFUND_UNAVAILABLE")continue;
      if(!results.length)throw error;
      await db.collection("adminActionTasks").doc(`live_upgrade_refund_${hash(`${input.eventId}:${input.requestKey}`)}`).set({type:"live_event_upgrade_refund_reconciliation",eventId:input.eventId,ticketId:pass.id,sourceTicketIds:sources.map(row=>row.id),refundCaseIds:results.map(row=>row.refundCaseId),status:"open",reason:"One original payment source requires further review; recorded refund liabilities must not be duplicated.",updatedAt:new Date().toISOString()},{merge:true});
    }
  }
  if(!results.length)throw new LiveEventPolicyError("VOLUNTARY_REFUND_UNAVAILABLE");
  return results;
}

export async function executeLiveEventRefund(db: Firestore, stripe: Stripe, caseId: string) {
  const ref = db.collection("refundCases").doc(caseId), now = Date.now();
  const claim = await db.runTransaction(async tx => {
    const snap = await tx.get(ref), value = snap.data() ?? {};
    if (value.type !== "live_event_ticket_refund" || !value.automaticPolicyEligible || !["approved", "executing"].includes(String(value.status)) || value.status === "executing" && Date.parse(String(value.leaseUntil)) > now) return null;
    const booking = await tx.get(db.collection("liveEventBookings").doc(String(value.paymentId)));
    if (booking.data()?.stripeDisputeRestricted || booking.data()?.fraudReviewRequired || booking.data()?.settlementReleasedAt) { tx.update(ref, { status: "financial_hold", reason: "payment_restriction_requires_review", updatedAt: new Date(now).toISOString() }); return null; }
    tx.update(ref, { status: "executing", leaseUntil: new Date(now + 300000).toISOString(), updatedAt: new Date(now).toISOString() });
    return { ...value, booking: booking.data() ?? {} } as Record<string, unknown> & { booking: Record<string, unknown> };
  });
  if (!claim) return { executed: false };
  try {
    const intent = await stripe.paymentIntents.retrieve(String(claim.providerPaymentIntentId), { expand: ["latest_charge"] });
    const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
    if (intent.id !== claim.providerPaymentIntentId || intent.status !== "succeeded" || intent.currency !== claim.currency || intent.amount_received !== claim.booking.amountCents || !charge?.paid || !charge.captured || charge.disputed || charge.review || charge.fraud_details?.user_report === "fraudulent" || objectId(charge.payment_intent) !== intent.id || charge.amount_refunded !== Number(claim.booking.providerRefundedCents ?? 0) || Number(claim.amountCents) > charge.amount_captured - charge.amount_refunded) throw new Error("PROVIDER_REFUND_REVIEW_REQUIRED");
    const refund = await stripe.refunds.create({ payment_intent: intent.id, amount: Number(claim.amountCents), reason: "requested_by_customer", metadata: { refundCaseId: caseId } }, { idempotencyKey: `live-event-refund-${caseId}` });
    if (objectId(refund.payment_intent) !== intent.id || refund.amount !== claim.amountCents || refund.currency !== claim.currency || refund.metadata?.refundCaseId !== caseId) throw new Error("PROVIDER_REFUND_MISMATCH");
    if (refund.status === "succeeded") await reconcileLiveEventRefund(db, { caseId, providerRefundId: refund.id, paymentIntentId: intent.id, amountCents: refund.amount, currency: refund.currency, status: refund.status });
    else await db.runTransaction(async tx => { const latest = await tx.get(ref); if (latest.data()?.status !== "refunded") tx.update(ref, { status: refund.status === "failed" || refund.status === "canceled" ? "financial_hold" : "processing", providerRefundId: refund.id, providerStatus: refund.status, updatedAt: new Date().toISOString() }); });
    return { executed: true, status: refund.status };
  } catch {
    await db.runTransaction(async tx => { const latest = await tx.get(ref); if (latest.data()?.status !== "refunded") tx.update(ref, { status: "financial_hold", reconciliationReason: "provider_outcome_requires_review", updatedAt: new Date().toISOString() }); });
    return { executed: false, reviewRequired: true };
  }
}

/** Verified success only. Pending provider refunds never revoke money or masquerade as completed refunds. */
export async function reconcileLiveEventRefund(db: Firestore, input: { caseId: string; providerRefundId: string; paymentIntentId: string; amountCents: number; currency: string; status: string }) {
  if (input.status !== "succeeded") return { reconciled: false };
  return db.runTransaction(async tx => {
    const ref = db.collection("refundCases").doc(input.caseId), snap = await tx.get(ref), value = snap.data() ?? {};
    if (value.type !== "live_event_ticket_refund" || value.providerPaymentIntentId !== input.paymentIntentId || value.amountCents !== input.amountCents || value.currency !== input.currency || value.providerRefundId && value.providerRefundId !== input.providerRefundId) throw new LiveEventPolicyError("REFUND_PROVIDER_MISMATCH");
    if (value.status === "refunded") return { reconciled: true, duplicate: true };
    const refundLockRef = db.collection("providerRefundLocks").doc(hash(input.providerRefundId));
    const [bookingSnap, ticket, { event, ref: eventRef,challengeRef,challengeExists }, ledger, refundLock] = await Promise.all([
      tx.get(db.collection("liveEventBookings").doc(String(value.paymentId))), tx.get(db.collection("liveEventTickets").doc(String(value.ticketId))),
      readLiveEvent(db, tx, String(value.eventId)), tx.get(db.collection("cashLedger").where("sourceId", "==", value.paymentId)),
      tx.get(refundLockRef),
    ]);
    const booking = bookingSnap.data() ?? {}, admissionRefunded = Number(booking.admissionRefundedCents ?? 0) + Number(value.admissionCents), entryRefunded = Number(booking.entryRefundedCents ?? 0) + Number(value.competitionEntryCents);
    if (refundLock.exists && refundLock.data()?.refundCaseId !== input.caseId || booking.providerPaymentIntentId !== input.paymentIntentId) throw new LiveEventPolicyError("REFUND_PROVIDER_MISMATCH");
    if (!bookingSnap.exists || !ticket.exists || admissionRefunded > Number(booking.admissionCents) || entryRefunded > Number(booking.competitionEntryCents) || Number(booking.refundReservedCents) < input.amountCents) throw new LiveEventPolicyError("REFUND_LEDGER_REVIEW_REQUIRED");
    const registration = ticket.data()?.kind === "competitor" ? await tx.get(db.collection("liveEventRegistrations").doc(`${value.eventId}_${booking.userId}`)) : null;
    const convertedId=ticket.data()?.convertedToTicketId;
    if(convertedId&&(typeof convertedId!=="string"||!/^[a-f0-9]{64}$/.test(convertedId)))throw new LiveEventPolicyError("REFUND_LEDGER_REVIEW_REQUIRED");
    const convertedPass=convertedId?await tx.get(db.collection("liveEventTickets").doc(convertedId)):null;
    const convertedBooking=convertedPass?.exists?await tx.get(db.collection("liveEventBookings").doc(String(convertedPass.data()?.bookingId))):null;
    const convertedRegistration=convertedPass?.exists?await tx.get(db.collection("liveEventRegistrations").doc(`${value.eventId}_${booking.userId}`)):null;
    if(convertedId&&(!convertedPass?.exists||!convertedBooking?.exists||convertedPass.data()?.admissionSourceTicketId!==ticket.id||convertedPass.data()?.userId!==booking.userId||convertedPass.data()?.eventId!==value.eventId))throw new LiveEventPolicyError("REFUND_LEDGER_REVIEW_REQUIRED");
    const before = allocateLiveEventRevenue(Number(booking.admissionCents) - Number(booking.admissionRefundedCents ?? 0), Number(booking.competitionEntryCents) - Number(booking.entryRefundedCents ?? 0));
    const after = allocateLiveEventRevenue(Number(booking.admissionCents) - admissionRefunded, Number(booking.competitionEntryCents) - entryRefunded);
    const deltas = { admission_creator: before.admission.creator - after.admission.creator, admission_platform: before.admission.platform - after.admission.platform, entry_creator: before.competition.creator - after.competition.creator, entry_platform: before.competition.platform - after.competition.platform, entry_winners: before.competition.winners - after.competition.winners };
    const now = new Date().toISOString();
    if(Number(value.competitionEntryCents)>0&&ledger.docs.some(row=>row.data().liveEventSettlementId)){
      const hold={settlementRestricted:true,liveEventFinancialReviewRequired:true,eventPrizeSettlementStatus:"on_hold",updatedAt:now};
      tx.update(eventRef,hold);if(challengeExists)tx.update(challengeRef,hold);
    }
    for (const [key, amount] of Object.entries(deltas)) if (amount > 0) {
      const source = ledger.docs.find(row => row.id === `live_event_${bookingSnap.id}_${key}`);
      if (!source) throw new LiveEventPolicyError("REFUND_LEDGER_REVIEW_REQUIRED");
      if (!["paid","paid_out","processing","withdrawal_requested"].includes(String(source.data().status)) && source.data().externalPayoutExecuted !== true && source.data().metadata?.externalPayoutExecuted !== true) tx.update(source.ref,{netAmountCents:Number(source.data().netAmountCents??source.data().amountCents)-amount,refundedAmountCents:Number(source.data().refundedAmountCents??0)+amount,updatedAt:now});
      tx.create(db.collection("cashLedger").doc(`live_refund_${input.caseId}_${key}`), { ...source.data(), id: `live_refund_${input.caseId}_${key}`, direction: "debit", amountCents: amount, status: "reversed", balanceBucket: "reversed", providerReference: input.providerRefundId, idempotencyKey: `live_refund_${input.caseId}_${key}`, refundCaseId: input.caseId, createdAt: now, updatedAt: now });
    }
    const firstRevocation = ticket.data()?.capacityReleased !== true;
    const field = ticket.data()?.kind === "competitor" ? "competitorCount" : "audienceCount";
    if (firstRevocation && Number(event[field]) < 1) throw new LiveEventPolicyError("CAPACITY_RECONCILIATION_REQUIRED");
    tx.update(ref, { status: "refunded", providerRefundId: input.providerRefundId, providerStatus: "succeeded", refundedAt: now, updatedAt: now });
    tx.set(refundLockRef, { refundCaseId: input.caseId, providerRefundId: input.providerRefundId, paymentIntentId: input.paymentIntentId, updatedAt: now });
    const activeTicketCount=Number(booking.activeTicketCount??booking.ticketIds?.length??booking.quantity)-(firstRevocation?1:0),providerRefundedCents=Number(booking.providerRefundedCents??0)+input.amountCents;
    if(activeTicketCount<0)throw new LiveEventPolicyError("CAPACITY_RECONCILIATION_REQUIRED");
    tx.update(bookingSnap.ref, { status:providerRefundedCents===Number(booking.amountCents)?"refunded":activeTicketCount===0?"admission_revoked":"confirmed",activeTicketCount,admissionRefundedCents: admissionRefunded, entryRefundedCents: entryRefunded, providerRefundedCents, refundReservedCents: Number(booking.refundReservedCents) - input.amountCents, updatedAt: now });
    tx.update(ticket.ref, { status: "refunded", capacityReleased: true, admissionRefundedCents: Number(ticket.data()?.admissionRefundedCents ?? 0) + Number(value.admissionCents), entryRefundedCents: Number(ticket.data()?.entryRefundedCents ?? 0) + Number(value.competitionEntryCents), admissionRefundReservedCents: Number(ticket.data()?.admissionRefundReservedCents ?? 0) - Number(value.admissionCents), entryRefundReservedCents: Number(ticket.data()?.entryRefundReservedCents ?? 0) - Number(value.competitionEntryCents), updatedAt: now });
    if (firstRevocation) tx.update(eventRef, { [field]: Number(event[field]) - 1, updatedAt: now });
    if (registration?.exists) tx.update(registration.ref, { eligible: false, status: "withdrawn", updatedAt: now });
    if(convertedPass?.exists&&!convertedPass.data()?.capacityReleased){
      if(Number(event.competitorCount)<1)throw new LiveEventPolicyError("CAPACITY_RECONCILIATION_REQUIRED");
      tx.update(convertedPass.ref,{status:"admission_revoked",capacityReleased:true,admissionSourceRefundId:input.providerRefundId,updatedAt:now});
      tx.update(convertedBooking!.ref,{status:"admission_revoked",activeTicketCount:0,updatedAt:now});
      if(convertedRegistration?.exists)tx.update(convertedRegistration.ref,{eligible:false,status:"withdrawn",updatedAt:now});
      tx.update(eventRef,{competitorCount:Number(event.competitorCount)-1,updatedAt:now});
    }
    tx.create(db.collection("auditLogs").doc(), { actorId: "stripe_verified_refund", action: "live_event.refund_completed", eventId: value.eventId, targetId: input.caseId, providerRefundId: input.providerRefundId, amountCents: input.amountCents, createdAt: now });
    return { reconciled: true, duplicate: false };
  });
}
