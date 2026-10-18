import { createHash, randomBytes } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { allocateLiveEventRevenue, eventCapacities, eventTime, LiveEventPolicyError } from "@/lib/live-event-policy";
import { readLiveEvent } from "@/lib/server/live-event-admission";
import { verifyLiveEventPaymentEvidence } from "@/lib/server/live-event-payment-evidence";
import {readLiveEventUpgrade,convertLiveEventAdmission,type LiveEventUpgrade} from "@/lib/server/live-event-upgrades";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** The original booking is the financial source. Existing cashLedger/refundCases remain authoritative. */
export async function confirmLiveEventPayment(db: Firestore, event: Stripe.Event, session: Stripe.Checkout.Session, intent: Stripe.PaymentIntent) {
  const id = session.metadata?.bookingId;
  if (!id || !/^[a-f0-9]{64}$/.test(id)) throw new LiveEventPolicyError("BOOKING_REFERENCE_INVALID", 422);
  const ref = db.collection("liveEventBookings").doc(id);
  return db.runTransaction(async tx => {
    const bookingSnap = await tx.get(ref), booking = bookingSnap.data();
    if (!booking || booking.eventId !== session.metadata?.eventId) throw new LiveEventPolicyError("BOOKING_REFERENCE_INVALID", 422);
    if (["confirmed", "payment_review_required", "refund_pending", "refunded", "admission_revoked"].includes(String(booking.status))) {
      if (booking.stripeCheckoutSessionId !== session.id || booking.providerPaymentIntentId !== intent.id) throw new LiveEventPolicyError("PROVIDER_REFERENCE_MISMATCH", 422);
      return { bookingId: id, status: booking.status, duplicate: true };
    }
    const evidence = verifyLiveEventPaymentEvidence(booking, event, session, intent);
    // A signed but inconsistent event never gains control of another booking's funds or inventory.
    if (evidence.reason === "provider_references_inconsistent") throw new LiveEventPolicyError("PROVIDER_REFERENCE_MISMATCH", 422);
    const [{ event: current, ref: eventRef }, registration, providerUse,account] = await Promise.all([
      readLiveEvent(db, tx, String(booking.eventId)),
      tx.get(db.collection("liveEventRegistrations").doc(`${booking.eventId}_${booking.userId}`)),
      tx.get(db.collection("paymentProviderLocks").doc(hash(`live_event:${intent.id}`))),
      booking.guestSession?Promise.resolve(null):tx.get(db.collection("users").doc(String(booking.userId))),
    ]);
    if (providerUse.exists && providerUse.data()?.bookingId !== id) throw new LiveEventPolicyError("PAYMENT_ALREADY_ASSOCIATED");
    const quantity = Number(booking.quantity), field = booking.kind === "audience" ? "audienceReserved" : "competitorReserved", confirmedField = booking.kind === "audience" ? "audienceCount" : "competitorCount";
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20 || booking.kind === "competitor" && quantity !== 1 || !Array.isArray(booking.names) || booking.names.length !== quantity) throw new LiveEventPolicyError("BOOKING_RECONCILIATION_REQUIRED");
    const capacity = eventCapacities(current), limit = booking.kind === "audience" ? capacity.audience : capacity.competitors;
    const hasInventory = booking.capacityState === "reserved" && Number.isSafeInteger(current[field]) && Number(current[field]) >= quantity && Number(current[confirmedField]) + Number(current[field]) <= limit;
    const eligibleEvent = current.eventApprovalStatus === "approved" && Date.now()<eventTime(current.endsAt) && !["cancelled", "rejected", "deleted","completed"].includes(String(current.status));
    const accountData=account?.data()??{},accountEligible=booking.guestSession||Boolean(account?.exists&&!accountData.disabled&&!accountData.suspended&&!["suspended","disabled","banned","restricted","deleted","blocked","deactivated"].includes(String(accountData.accountStatus??"")));
    const duplicateCompetitor = booking.kind === "competitor" && registration.exists && !["cancelled", "refunded"].includes(String(registration.data()?.status));
    let upgrade:LiveEventUpgrade|null=null,upgradeUnavailable=false;
    if(booking.admissionSourceTicketId){try{upgrade=await readLiveEventUpgrade(db,tx,{eventId:String(booking.eventId),userId:String(booking.userId),ticketId:String(booking.admissionSourceTicketId),personalAdmissionConfirmed:Boolean(booking.personalAdmissionConfirmedAt),upgradeBookingId:id});if(Number(current.audienceCount)<1)upgradeUnavailable=true;}catch(error){if(!(error instanceof LiveEventPolicyError))throw error;upgradeUnavailable=true;}}
    const now = new Date().toISOString();
    const financialRefs = { providerPaymentIntentId: intent.id, providerChargeId: evidence.chargeId, providerEventId: event.id, providerSnapshotAt: evidence.providerSnapshotAt, paymentEvidenceType: evidence.evidenceType, updatedAt: now };
    tx.set(db.collection("paymentProviderLocks").doc(hash(`live_event:${intent.id}`)), { bookingId: id, eventId: booking.eventId, providerPaymentIntentId: intent.id, updatedAt: now });
    if (!evidence.eligible || !hasInventory || !eligibleEvent || !accountEligible || duplicateCompetitor||upgradeUnavailable) {
      const reason = !evidence.eligible ? evidence.reason : !hasInventory ? "capacity_entitlement_requires_review" : !eligibleEvent ? "event_unavailable" : !accountEligible?"account_eligibility_requires_review":upgradeUnavailable?"original_admission_reconciliation_required":"duplicate_competitor_payment";
      const caseId = `live_event_booking_${id}`;
      tx.update(ref, { ...financialRefs, status: "payment_review_required", paymentConfirmed: evidence.captured, reconciliationReason: reason, refundCaseId: caseId, settlementRestricted: true });
      tx.set(db.collection("refundCases").doc(caseId), { id: caseId, type: "live_event_booking_reconciliation", paymentCollection: "liveEventBookings", paymentId: id, eventId: booking.eventId, userId: booking.userId, provider: "stripe", providerPaymentIntentId: intent.id, providerChargeId: evidence.chargeId, providerEventId: event.id, amountCents: booking.amountCents, currency: booking.currency, status: "financial_hold", reason, automaticPolicyEligible: false, createdAt: now, updatedAt: now });
      tx.create(db.collection("auditLogs").doc(), { actorId: "stripe_verified_webhook", action: "live_event.payment_review_required", eventId: booking.eventId, targetId: id, reason, providerEventId: event.id, createdAt: now });
      // Reserved capacity is retained until provider-aware reconciliation; never sell an uncertain paid slot twice.
      return { bookingId: id, status: "payment_review_required", duplicate: false };
    }
    const names = booking.names as string[], ticketIds = names.map((_, index) => hash(`${id}:${index}`));
    ticketIds.forEach((ticketId, index) => {
      const credential = randomBytes(32).toString("base64url");
      tx.create(db.collection("liveEventTickets").doc(ticketId), { id: ticketId, eventId: booking.eventId, bookingId: id, userId: booking.userId, guestName: names[index], kind: booking.kind, status: "confirmed", credential, credentialHash: hash(credential), ...(upgrade?{admissionSourceTicketId:upgrade.ticket.id,admissionSourceBookingId:upgrade.booking.id}:{}), checkedInAt: null, createdAt: now, updatedAt: now });
    });
    if (booking.kind === "competitor") tx.set(registration.ref, { id: registration.id, eventId: booking.eventId, userId: booking.userId, fullName: names[0], kind: "competitor", ticketId: ticketIds[0], status: "confirmed", eligible: true, checkedInAt: null, createdAt: now });
    const allocation = allocateLiveEventRevenue(Number(booking.admissionCents), Number(booking.competitionEntryCents));
    const owner = String(current.organizationOwnerId ?? current.creatorId ?? current.hostId ?? current.userId ?? "");
    if (!owner) throw new LiveEventPolicyError("EARNINGS_OWNER_REVIEW_REQUIRED");
    const shares = [
      { key: "admission_creator", userId: owner, amount: allocation.admission.creator, shareType: "creator_host_share", revenueType: "admission" },
      { key: "admission_platform", userId: "platform", amount: allocation.admission.platform, shareType: "platform_share", revenueType: "admission" },
      { key: "entry_creator", userId: owner, amount: allocation.competition.creator, shareType: "creator_host_share", revenueType: "entry_fee" },
      { key: "entry_platform", userId: "platform", amount: allocation.competition.platform, shareType: "platform_share", revenueType: "entry_fee" },
      { key: "entry_winners", userId: null, amount: allocation.competition.winners, shareType: "winner_share", revenueType: "entry_fee" },
    ];
    for (const share of shares.filter(share => share.amount > 0)) tx.create(db.collection("cashLedger").doc(`live_event_${id}_${share.key}`), {
      id: `live_event_${id}_${share.key}`, userId: share.userId, eventId: booking.eventId, challengeId: booking.eventId, sourceType: "host_event_revenue", sourceId: id,
      direction: "credit", amountCents: share.amount, netAmountCents: share.amount, currency: "USD", status: "held", balanceBucket: "held", revenueType: share.revenueType, shareType: share.shareType,
      description: "Live Event confirmed booking — held pending completion and refund clearance", idempotencyKey: `live_event_${id}_${share.key}`, providerReference: intent.id,
      settlementRestricted: true, createdBy: "stripe_verified_webhook", metadata: { bookingId: id, eventId: booking.eventId, externalPayoutExecuted: false }, createdAt: now, updatedAt: now,
    });
    tx.update(ref, { ...financialRefs, status: "confirmed", paymentConfirmed: true, capacityState: "confirmed", ticketIds, activeTicketCount:quantity, allocation, providerRefundedCents:0,admissionRefundedCents:0,entryRefundedCents:0,refundReservedCents:0,confirmedAt: now, settlementRestricted: true });
    tx.update(eventRef, { [field]: Number(current[field]) - quantity, [confirmedField]: Number(current[confirmedField]) + quantity,...(upgrade?{audienceCount:Number(current.audienceCount)-1}:{}), updatedAt: now });
    tx.create(db.collection("liveEventEmailOutbox").doc(`booking_${id}`), { eventId: booking.eventId, bookingId: id, userId: booking.userId, status: "pending", type: "ticket_confirmation", createdAt: now });
    if(upgrade){convertLiveEventAdmission(tx,upgrade,ticketIds[0],id,now);tx.create(db.collection("auditLogs").doc(`live_upgrade_${id}`),{actorId:"stripe_verified_webhook",action:"live_event.admission_upgraded",eventId:booking.eventId,originalTicketId:upgrade.ticket.id,originalBookingId:upgrade.booking.id,competitionBookingId:id,participantPassId:ticketIds[0],additionalPaymentCents:booking.amountCents,providerPaymentIntentId:intent.id,createdAt:now});}
    tx.create(db.collection("auditLogs").doc(), { actorId: "stripe_verified_webhook", action: "live_event.payment_confirmed", eventId: booking.eventId, targetId: id, providerEventId: event.id, providerPaymentIntentId: intent.id, amountCents: booking.amountCents, createdAt: now });
    return { bookingId: id, status: "confirmed", duplicate: false };
  });
}
