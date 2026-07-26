import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { getChallengeLifecycleState } from "@/lib/challenge-status";
import { deterministicId, safeIdPart } from "@/lib/server/idempotency";
import { calculatePaidRevenueSplit, calculateSponsorContributionSplit, MINIMUM_ENTRY_FEE_CENTS, validateEntryFee, validateSponsorFundingWindow } from "@/lib/server/payout-structure";

export const PAYMENT_PURPOSES = ["challenge_entry_fee", "challenge_entry", "paid_vote", "sponsor_funding"] as const;
export type MonetizationPaymentPurpose = (typeof PAYMENT_PURPOSES)[number];
export type MonetizationPaymentStatus = "pending" | "paid" | "confirmed" | "failed" | "canceled" | "cancelled" | "expired" | "refund_required" | "refund_review" | "refunded" | "payment_review_required";

function cents(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function metadata(session: Stripe.Checkout.Session) {
  return session.metadata ?? {};
}

function lowerCurrency(value: unknown) {
  return text(value, 8).toLowerCase() || "usd";
}


function addMinutesIso(now: string, minutes: number) {
  const date = new Date(now);
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString();
}

function parseTime(value: unknown) {
  const date = new Date(text(value, 80));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function isActiveParticipantStatus(status: unknown) {
  return ["registered", "approved", "active", "joined", "checked_in", "submitted"].includes(String(status ?? ""));
}

function activeParticipantCount(records: Array<Record<string, unknown>>) {
  return records.filter((item) => isActiveParticipantStatus(item.status)).length;
}

function activeReservationCount(records: Array<Record<string, unknown>>, nowMs: number) {
  return records.filter((item) => item.reservationStatus === "reserved" && item.status === "pending" && (parseTime(item.reservationExpiresAt) ?? 0) > nowMs).length;
}

function challengeCapacity(challenge: Record<string, unknown>) {
  const capacity = Math.trunc(Number(challenge.maxParticipants ?? challenge.participantLimit ?? 0) || 0);
  return capacity > 0 ? capacity : null;
}

function calculateEntryRevenueFoundation(amountCents: number) {
  const split = calculatePaidRevenueSplit(amountCents, "entry_fee");
  return {
    amountGrossCents: amountCents,
    platformFeeCents: split.platformAdminShareCents,
    amountNetCents: Math.max(0, amountCents - split.platformAdminShareCents),
    platformFeeSource: "calculatePaidRevenueSplit",
    prizeSettlementReady: false
  };
}
function safeUrl(value: unknown) {
  const raw = text(value, 500);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString().slice(0, 500) : "";
  } catch {
    return "";
  }
}

export function isPaidEntryChallenge(challenge: Record<string, unknown>) {
  const monetization = typeof challenge.monetization === "object" && challenge.monetization !== null ? challenge.monetization as Record<string, unknown> : {};
  return Boolean(monetization.paidEntryRequested || challenge.paidEntryEnabled || challenge.entryFeeRequired) && cents(monetization.entryFeeAmountCents ?? challenge.entryFeeAmountCents ?? challenge.entryFeeCents) >= MINIMUM_ENTRY_FEE_CENTS;
}

export function paidEntryAmountCents(challenge: Record<string, unknown>) {
  const monetization = typeof challenge.monetization === "object" && challenge.monetization !== null ? challenge.monetization as Record<string, unknown> : {};
  return cents(monetization.entryFeeAmountCents ?? challenge.entryFeeAmountCents ?? challenge.entryFeeCents);
}

export function paidVotesEnabled(challenge: Record<string, unknown>) {
  const monetization = typeof challenge.monetization === "object" && challenge.monetization !== null ? monetizationRecord(challenge.monetization) : {};
  return Boolean(monetization.paidVotesRequested || challenge.paidVotesEnabled || challenge.paidVotePaymentActive);
}

function monetizationRecord(value: unknown) {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

export function assertStripeSessionMatchesRecord(session: Stripe.Checkout.Session, record: Record<string, unknown>, expectedPurpose: MonetizationPaymentPurpose) {
  const sessionMetadata = metadata(session);
  if (session.mode !== "payment") throw new Error("Stripe checkout session was not a one-time payment session.");
  if (session.payment_status !== "paid") throw new Error("Stripe checkout session is not paid.");
  if (sessionMetadata.paymentPurpose !== expectedPurpose) throw new Error("Stripe payment purpose mismatch.");
  const sessionAmount = cents(session.amount_total);
  const recordAmount = cents(record.amountCents ?? record.amount);
  if (sessionAmount !== recordAmount) throw new Error("Stripe amount does not match the stored pending payment record.");
  if (lowerCurrency(session.currency) !== lowerCurrency(record.currency)) throw new Error("Stripe currency does not match the stored pending payment record.");
}

export async function createPendingEntryPayment(db: Firestore, input: { userId: string; challengeId: string; challenge: Record<string, unknown>; now?: string }) {
  if (!isPaidEntryChallenge(input.challenge)) throw new Error("This challenge does not require paid entry checkout.");
  const amountCents = paidEntryAmountCents(input.challenge);
  const fee = validateEntryFee(amountCents);
  if (!fee.valid) throw new Error(fee.message);
  const id = deterministicId("challenge_entry_fee", input.challengeId, input.userId);
  const legacyId = deterministicId("challenge_entry", input.challengeId, input.userId);
  const participantId = `${input.challengeId}_${input.userId}`;
  const now = input.now ?? new Date().toISOString();
  const nowMs = new Date(now).getTime();
  const reservationExpiresAt = addMinutesIso(now, 20);
  const revenue = calculateEntryRevenueFoundation(amountCents);
  const record = {
    id,
    userId: input.userId,
    challengeId: input.challengeId,
    participantId: null,
    reservedParticipantId: participantId,
    paymentPurpose: "challenge_entry_fee",
    amountCents,
    amount: amountCents,
    amountGrossCents: revenue.amountGrossCents,
    platformFeeCents: revenue.platformFeeCents,
    amountNetCents: revenue.amountNetCents,
    currency: "usd",
    provider: "stripe",
    providerSessionId: null,
    providerPaymentIntentId: null,
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    status: "pending",
    reservationStatus: "reserved",
    reservationExpiresAt,
    webhookConfirmed: false,
    stripeEventId: null,
    idempotencyKey: id,
    metadata: { checkoutSuccessActivatesEntry: false, webhookConfirmationRequired: true, createsActiveParticipantBeforeWebhook: false, pendingReservationOnly: true, prizeReleaseCreated: false, payoutExecutionCreated: false, prizeSettlementReady: false },
    createdAt: now,
    updatedAt: now,
    confirmedAt: null
  };
  await db.runTransaction(async (transaction) => {
    const paymentRef = db.collection("challengeEntryPayments").doc(id);
    const legacyPaymentRef = db.collection("challengeEntryPayments").doc(legacyId);
    const participantRef = db.collection("challengeParticipants").doc(participantId);
    const challengeRef = db.collection("challenges").doc(input.challengeId);
    const participantQuery = db.collection("challengeParticipants").where("challengeId", "==", input.challengeId).limit(1000);
    const paymentQuery = db.collection("challengeEntryPayments").where("challengeId", "==", input.challengeId).limit(1000);
    const [paymentSnap, legacyPaymentSnap, participantSnap, freshChallengeSnap, participantRows, paymentRows] = await Promise.all([
      transaction.get(paymentRef),
      transaction.get(legacyPaymentRef),
      transaction.get(participantRef),
      transaction.get(challengeRef),
      transaction.get(participantQuery),
      transaction.get(paymentQuery)
    ]);
    if (participantSnap.exists && participantSnap.data()?.entryPaymentStatus === "paid") throw new Error("You are already enrolled in this paid challenge.");
    if (paymentSnap.exists && ["paid", "confirmed"].includes(String(paymentSnap.data()?.status))) throw new Error("You are already enrolled in this paid challenge.");
    if (legacyPaymentSnap.exists && ["paid", "confirmed"].includes(String(legacyPaymentSnap.data()?.status))) throw new Error("You are already enrolled in this paid challenge.");
    const freshChallenge = freshChallengeSnap.exists ? { id: freshChallengeSnap.id, ...freshChallengeSnap.data() } as Record<string, unknown> : input.challenge;
    const capacity = challengeCapacity(freshChallenge);
    const participants = participantRows.docs.map((doc) => doc.data() ?? {});
    const payments = paymentRows.docs.map((doc) => doc.data() ?? {});
    const occupied = activeParticipantCount(participants) + activeReservationCount(payments, nowMs);
    const existingReservation = paymentSnap.exists ? paymentSnap.data() ?? {} : null;
    const existingIsReserved = existingReservation?.reservationStatus === "reserved" && existingReservation?.status === "pending" && (parseTime(existingReservation?.reservationExpiresAt) ?? 0) > nowMs;
    if (capacity !== null && occupied >= capacity && !existingIsReserved) throw new Error("This challenge is full. Paid-entry checkout is not available.");
    if (paymentSnap.exists && !existingIsReserved && paymentSnap.data()?.status === "pending") {
      transaction.set(paymentRef, { status: "canceled", reservationStatus: "released", releasedAt: now, updatedAt: now }, { merge: true });
    }
    transaction.set(paymentRef, { ...record, ...(paymentSnap.exists ? { createdAt: paymentSnap.data()?.createdAt ?? now } : {}) }, { merge: true });
  });
  return record;
}

export async function attachCheckoutSession(db: Firestore, collection: string, id: string, session: Stripe.Checkout.Session) {
  const now = new Date().toISOString();
  await db.collection(collection).doc(id).set({
    stripeCheckoutSessionId: session.id,
    providerSessionId: session.id,
    checkoutUrlCreatedAt: now,
    updatedAt: now,
    checkoutSuccessActivates: false
  }, { merge: true });
}

export async function confirmChallengeEntryPayment(db: Firestore, event: Stripe.Event, session: Stripe.Checkout.Session) {
  const id = metadata(session).entryPaymentId;
  if (!id) throw new Error("Missing entry payment id.");
  const paymentRef = db.collection("challengeEntryPayments").doc(id);
  const now = new Date().toISOString();
  const nowMs = new Date(now).getTime();
  return db.runTransaction(async (transaction) => {
    const paymentSnap = await transaction.get(paymentRef);
    if (!paymentSnap.exists) throw new Error("Stored entry payment record not found.");
    const payment = paymentSnap.data() ?? {};
    assertStripeSessionMatchesRecord(session, payment, String(payment.paymentPurpose ?? "challenge_entry_fee") === "challenge_entry" ? "challenge_entry" : "challenge_entry_fee");
    if (["paid", "confirmed"].includes(String(payment.status)) && payment.webhookConfirmed === true) return { handled: true, kind: "challenge_entry_fee", id, duplicate: true };
    const challengeId = text(payment.challengeId, 160);
    const userId = text(payment.userId, 160);
    const participantId = `${challengeId}_${userId}`;
    const challengeRef = db.collection("challenges").doc(challengeId);
    const participantRef = db.collection("challengeParticipants").doc(participantId);
    const participantQuery = db.collection("challengeParticipants").where("challengeId", "==", challengeId).limit(1000);
    const paymentQuery = db.collection("challengeEntryPayments").where("challengeId", "==", challengeId).limit(1000);
    const [challengeSnap, participantSnap, participantRows, paymentRows] = await Promise.all([
      transaction.get(challengeRef),
      transaction.get(participantRef),
      transaction.get(participantQuery),
      transaction.get(paymentQuery)
    ]);
    if (!challengeSnap.exists) throw new Error("Challenge not found for paid-entry confirmation.");
    const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
    const amountCents = cents(payment.amountCents);
    const revenue = calculateEntryRevenueFoundation(amountCents);
    const reservationExpiresAtMs = parseTime(payment.reservationExpiresAt) ?? 0;
    const capacity = challengeCapacity(challenge);
    const participants = participantRows.docs.map((doc) => doc.data() ?? {});
    const payments = paymentRows.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string })).filter((item) => item.id !== id);
    const occupied = activeParticipantCount(participants) + activeReservationCount(payments, nowMs);
    const reservationValid = payment.reservationStatus === "reserved" && reservationExpiresAtMs > nowMs;
    const participantAlreadyActive = participantSnap.exists && isActiveParticipantStatus(participantSnap.data()?.status) && ["paid", "confirmed"].includes(String(participantSnap.data()?.entryPaymentStatus ?? ""));
    const capacityAvailable = capacity === null || occupied < capacity || participantAlreadyActive;
    const basePaymentUpdate = {
      stripeCheckoutSessionId: session.id,
      providerSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
      providerPaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
      stripeEventId: event.id,
      webhookConfirmed: true,
      idempotencyKey: deterministicId("stripe", event.id, id),
      confirmedAt: now,
      updatedAt: now
    };
    if (!reservationValid || !capacityAvailable) {
      transaction.set(paymentRef, {
        ...basePaymentUpdate,
        status: "payment_review_required",
        reservationStatus: "admin_review",
        participantId: null,
        reviewReason: !reservationValid ? "reservation_expired_before_webhook_confirmation" : "capacity_unavailable_after_webhook_confirmation",
        refundStatus: "refund_review",
        refundExecutionEnabled: false
      }, { merge: true });
      return { handled: true, kind: "challenge_entry_fee", id, duplicate: false, enrollmentActivated: false, reviewRequired: true, payoutProviderCalled: false, prizeReleased: false };
    }
    transaction.set(paymentRef, {
      ...basePaymentUpdate,
      status: "paid",
      reservationStatus: "converted_to_participant",
      participantId,
      amountGrossCents: revenue.amountGrossCents,
      platformFeeCents: revenue.platformFeeCents,
      amountNetCents: revenue.amountNetCents,
      pendingChallengeRevenue: true,
      prizeSettlementReady: false
    }, { merge: true });
    transaction.set(participantRef, {
      id: participantId,
      challengeId,
      userId,
      status: "active",
      paidEntryEnabled: true,
      entryFeeCents: amountCents,
      entryPaymentId: id,
      entryPaymentStatus: "paid",
      entryPaymentConfirmedAt: now,
      fullEntryGranted: true,
      webhookConfirmationRequired: true,
      paidConfirmedBy: "stripe_webhook",
      updatedAt: now,
      joinedAt: now,
      registeredAt: now
    }, { merge: true });
    transaction.set(challengeRef, {
      pendingEntryFeeRevenueGrossCents: FieldValue.increment(amountCents),
      pendingEntryFeePlatformFeeCents: FieldValue.increment(revenue.platformFeeCents),
      pendingEntryFeeNetCents: FieldValue.increment(revenue.amountNetCents),
      paidEntryConfirmedCount: FieldValue.increment(1),
      participantCount: FieldValue.increment(participantSnap.exists ? 0 : 1),
      prizeSettlementReady: false,
      prizeReleaseEnabled: false,
      payoutExecutionEnabled: false,
      updatedAt: now
    }, { merge: true });
    transaction.set(db.collection("auditLogs").doc(deterministicId("challenge_entry_fee_paid", id, event.id)), {
      actorId: userId,
      actorType: "user",
      action: "challenge_entry_fee.webhook_confirmed",
      targetType: "challenge",
      targetId: challengeId,
      metadata: { entryPaymentId: id, participantId, amountCents, pendingChallengeRevenue: true, prizeReleaseEnabled: false, payoutExecutionEnabled: false },
      createdAt: now
    });
    return { handled: true, kind: "challenge_entry_fee", id, duplicate: false, enrollmentActivated: true, revenueSourceConfirmed: true, payoutProviderCalled: false, prizeReleased: false };
  });
}

export async function expireChallengeEntryPayment(db: Firestore, session: Stripe.Checkout.Session) {
  const id = metadata(session).entryPaymentId;
  if (!id) return { handled: false, reason: "entry_payment_id_missing" };
  const now = new Date().toISOString();
  await db.collection("challengeEntryPayments").doc(id).set({ status: "canceled", reservationStatus: "expired", expiredAt: now, updatedAt: now, stripeCheckoutSessionId: session.id, providerSessionId: session.id, webhookConfirmed: false }, { merge: true });
  return { handled: true, kind: "challenge_entry_fee", id, status: "canceled", reservationStatus: "expired" };
}

export async function createPendingPaidVotePurchase(db: Firestore, input: { userId: string; challengeId: string; challenge: Record<string, unknown>; voteQuantity: number; amountCents: number; submissionId?: string; now?: string }) {
  const lifecycle = getChallengeLifecycleState(input.challenge);
  if (!lifecycle.canVote) throw new Error("Voting is not open for this challenge.");
  if (!paidVotesEnabled(input.challenge)) throw new Error("Paid votes setup required.");
  const voteQuantity = Math.max(0, Math.trunc(Number(input.voteQuantity) || 0));
  if (voteQuantity < 1 || voteQuantity > 1000) throw new Error("Select a valid paid vote quantity.");
  const amountCents = cents(input.amountCents);
  if (amountCents < 100) throw new Error("Paid vote checkout amount is invalid.");
  const id = deterministicId("paid_vote", input.challengeId, input.userId, input.submissionId ?? "challenge", Date.now());
  const now = input.now ?? new Date().toISOString();
  const record = {
    id,
    userId: input.userId,
    challengeId: input.challengeId,
    submissionId: text(input.submissionId, 160) || null,
    paymentPurpose: "paid_vote",
    voteQuantity,
    amountCents,
    amount: amountCents,
    currency: "USD",
    status: "pending",
    votesGranted: 0,
    votesUsed: 0,
    provider: "stripe",
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    idempotencyKey: id,
    metadata: { checkoutSuccessGrantsVotes: false, webhookConfirmationRequired: true, creditConsumptionActive: false, prizeReleaseCreated: false, payoutExecutionCreated: false },
    createdAt: now,
    updatedAt: now,
    confirmedAt: null
  };
  await db.collection("paidVotePurchases").doc(id).set(record, { merge: true });
  return record;
}

export async function confirmPaidVotePurchase(db: Firestore, event: Stripe.Event, session: Stripe.Checkout.Session) {
  const id = metadata(session).votePurchaseId;
  if (!id) throw new Error("Missing paid vote purchase id.");
  const purchaseRef = db.collection("paidVotePurchases").doc(id);
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const purchaseSnap = await transaction.get(purchaseRef);
    if (!purchaseSnap.exists) throw new Error("Stored paid vote purchase record not found.");
    const purchase = purchaseSnap.data() ?? {};
    assertStripeSessionMatchesRecord(session, purchase, "paid_vote");
    if (purchase.status === "confirmed") return { handled: true, kind: "paid_vote", id, duplicate: true };
    const challengeId = text(purchase.challengeId, 160);
    const userId = text(purchase.userId, 160);
    const amountCents = cents(purchase.amountCents);
    const voteQuantity = Math.max(0, Math.trunc(Number(purchase.voteQuantity) || 0));
    const split = calculatePaidRevenueSplit(amountCents, "paid_vote");
    const creditId = deterministicId("paid_vote_credit", id);
    transaction.set(purchaseRef, {
      status: "confirmed",
      confirmedAt: now,
      updatedAt: now,
      votesGranted: voteQuantity,
      votesUsed: 0,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
      stripeEventId: event.id,
      webhookConfirmed: true,
      idempotencyKey: deterministicId("stripe", event.id, id)
    }, { merge: true });
    transaction.set(db.collection("paidVoteCredits").doc(creditId), {
      id: creditId,
      purchaseId: id,
      userId,
      challengeId,
      submissionId: purchase.submissionId ?? null,
      voteQuantity,
      votesRemaining: voteQuantity,
      votesUsed: 0,
      status: "available",
      reusable: false,
      paymentPurpose: "paid_vote",
      provider: "stripe",
      createdFromWebhook: true,
      consumptionActive: false,
      createdAt: now,
      updatedAt: now
    }, { merge: true });
    transaction.set(db.collection("challenges").doc(challengeId), {
      confirmedPaidVoteGrossCents: FieldValue.increment(amountCents),
      confirmedPaidVoteWinnerShareCents: FieldValue.increment(split.winnerShareCents),
      confirmedPaidVoteCreatorHostOperatorShareCents: FieldValue.increment(split.creatorHostOperatorShareCents),
      confirmedPaidVotePlatformAdminShareCents: FieldValue.increment(split.platformAdminShareCents),
      confirmedPaidVotePurchaseCount: FieldValue.increment(1),
      updatedAt: now
    }, { merge: true });
    return { handled: true, kind: "paid_vote", id, duplicate: false, creditsGranted: voteQuantity, creditConsumptionActive: false, payoutProviderCalled: false, prizeReleased: false };
  });
}

export async function expirePaidVotePurchase(db: Firestore, session: Stripe.Checkout.Session) {
  const id = metadata(session).votePurchaseId;
  if (!id) return { handled: false, reason: "vote_purchase_id_missing" };
  const now = new Date().toISOString();
  await db.collection("paidVotePurchases").doc(id).set({ status: "expired", expiredAt: now, updatedAt: now, stripeCheckoutSessionId: session.id }, { merge: true });
  return { handled: true, kind: "paid_vote", id, status: "expired" };
}

export async function createPendingSponsorContribution(db: Firestore, input: { sponsorId: string; challengeId: string; challenge: Record<string, unknown>; sponsorProfile: Record<string, unknown>; amountCents: number; logoUrl?: string; bannerUrl?: string; ctaText?: string; ctaUrl?: string; placementNotes?: string; placements?: string[]; now?: string }) {
  const fundingWindow = validateSponsorFundingWindow(input.challenge);
  if (!fundingWindow.allowed) throw new Error("This challenge is not eligible for sponsor funding right now.");
  const amountCents = cents(input.amountCents);
  if (amountCents < 500) throw new Error("Sponsor funding amount must be at least $5.");
  const id = deterministicId("sponsor_funding", input.challengeId, input.sponsorId, Date.now());
  const now = input.now ?? new Date().toISOString();
  const split = calculateSponsorContributionSplit(amountCents);
  const record = {
    id,
    sponsorId: input.sponsorId,
    challengeId: input.challengeId,
    paymentPurpose: "sponsor_funding",
    amountCents,
    amount: amountCents,
    currency: "USD",
    status: "pending",
    brandingStatus: "pending_review",
    logoUrl: safeUrl(input.logoUrl),
    bannerUrl: safeUrl(input.bannerUrl),
    ctaText: text(input.ctaText, 80),
    ctaUrl: safeUrl(input.ctaUrl),
    placementNotes: text(input.placementNotes, 1200),
    preferredPlacements: Array.isArray(input.placements) ? input.placements.map((item) => text(item, 80)).filter(Boolean).slice(0, 8) : [],
    sponsorContributionRule: split,
    provider: "stripe",
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    confirmedAt: null,
    idempotencyKey: id,
    metadata: { checkoutSuccessConfirmsContribution: false, webhookConfirmationRequired: true, sponsorContributionGoesFullyToWinners: true, sponsorBrandingAutoApproved: false, prizeReleaseCreated: false, payoutExecutionCreated: false },
    createdAt: now,
    updatedAt: now
  };
  await db.collection("sponsorContributions").doc(id).set(record, { merge: true });
  return record;
}

export async function confirmSponsorContribution(db: Firestore, event: Stripe.Event, session: Stripe.Checkout.Session) {
  const id = metadata(session).sponsorContributionId;
  if (!id) throw new Error("Missing sponsor contribution id.");
  const contributionRef = db.collection("sponsorContributions").doc(id);
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const contributionSnap = await transaction.get(contributionRef);
    if (!contributionSnap.exists) throw new Error("Stored sponsor contribution record not found.");
    const contribution = contributionSnap.data() ?? {};
    assertStripeSessionMatchesRecord(session, contribution, "sponsor_funding");
    if (contribution.status === "confirmed") return { handled: true, kind: "sponsor_funding", id, duplicate: true };
    const challengeId = text(contribution.challengeId, 160);
    const amountCents = cents(contribution.amountCents);
    transaction.set(contributionRef, {
      status: "confirmed",
      confirmedAt: now,
      updatedAt: now,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
      stripeEventId: event.id,
      webhookConfirmed: true,
      brandingStatus: contribution.brandingStatus ?? "pending_review",
      idempotencyKey: deterministicId("stripe", event.id, id)
    }, { merge: true });
    transaction.set(db.collection("challenges").doc(challengeId), {
      confirmedSponsorContributionCents: FieldValue.increment(amountCents),
      confirmedSponsorContributionWinnerShareCents: FieldValue.increment(amountCents),
      sponsorContributionConfirmedCount: FieldValue.increment(1),
      updatedAt: now
    }, { merge: true });
    transaction.set(db.collection("prizePools").doc(challengeId), {
      confirmedSponsorContributionCents: FieldValue.increment(amountCents),
      visibleJackpotCents: FieldValue.increment(amountCents),
      fundingStatus: "sponsor_funded_pending",
      status: "sponsor_funded_pending",
      sponsorFundingReleaseEnabled: false,
      prizeReleaseEnabled: false,
      transferEnabled: false,
      updatedAt: now
    }, { merge: true });
    return { handled: true, kind: "sponsor_funding", id, duplicate: false, sponsorContributionGoesFullyToWinners: true, brandingStatus: "pending_review", payoutProviderCalled: false, prizeReleased: false };
  });
}

export async function expireSponsorContribution(db: Firestore, session: Stripe.Checkout.Session) {
  const id = metadata(session).sponsorContributionId;
  if (!id) return { handled: false, reason: "sponsor_contribution_id_missing" };
  const now = new Date().toISOString();
  await db.collection("sponsorContributions").doc(id).set({ status: "expired", expiredAt: now, updatedAt: now, stripeCheckoutSessionId: session.id }, { merge: true });
  return { handled: true, kind: "sponsor_funding", id, status: "expired" };
}

export function checkoutMetadataForPurpose(purpose: MonetizationPaymentPurpose, record: Record<string, unknown>) {
  const base = {
    paymentPurpose: purpose,
    userId: text(record.userId ?? record.sponsorId, 160),
    challengeId: text(record.challengeId, 160),
    amount: String(cents(record.amountCents ?? record.amount)),
    currency: text(record.currency, 8) || "USD"
  };
  if (purpose === "challenge_entry_fee" || purpose === "challenge_entry") return { ...base, entryPaymentId: text(record.id, 160) };
  if (purpose === "paid_vote") return { ...base, votePurchaseId: text(record.id, 160), voteQuantity: String(cents(record.voteQuantity)) };
  return { ...base, sponsorId: text(record.sponsorId, 160), sponsorContributionId: text(record.id, 160) };
}

export function checkoutLineItem(input: { amountCents: number; currency?: string; name: string }) {
  return {
    price_data: {
      currency: lowerCurrency(input.currency ?? "USD"),
      unit_amount: cents(input.amountCents),
      product_data: { name: input.name.slice(0, 120) }
    },
    quantity: 1
  };
}

export async function getPaymentStatus(db: Firestore, collection: string, id: string, ownerField: "userId" | "sponsorId", ownerId: string) {
  const snap = await db.collection(collection).doc(safeIdPart(id)).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  if (data[ownerField] !== ownerId) return null;
  return { id: snap.id, ...data };
}

async function sumConfirmed(db: Firestore, collection: string, challengeId: string, purpose: MonetizationPaymentPurpose) {
  const snap = await db.collection(collection).where("challengeId", "==", challengeId).limit(500).get();
  const records = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }))
    .filter((item) => item.paymentPurpose === purpose && item.webhookConfirmed === true && ["paid", "confirmed"].includes(String(item.status)));
  const grossAmountCents = records.reduce((sum, item) => sum + cents(item.amountCents ?? item.amount), 0);
  return {
    challengeId,
    paymentPurpose: purpose,
    grossAmountCents,
    currency: "USD",
    recordCount: records.length,
    records,
    confirmedOnly: true,
    pendingFailedCancelledExcluded: true,
    frontendEstimatesExcluded: true
  };
}

export async function getConfirmedEntryRevenueForChallenge(db: Firestore, challengeId: string) {
  const current = await sumConfirmed(db, "challengeEntryPayments", challengeId, "challenge_entry_fee");
  const legacy = await sumConfirmed(db, "challengeEntryPayments", challengeId, "challenge_entry");
  const grossAmountCents = current.grossAmountCents + legacy.grossAmountCents;
  const split = calculatePaidRevenueSplit(grossAmountCents, "entry_fee");
  const { grossAmountCents: _currentGrossAmountCents, recordCount: _currentRecordCount, records: _currentRecords, paymentPurpose: _currentPaymentPurpose, ...currentSource } = current;
  return {
    ...currentSource,
    ...split,
    paymentPurpose: "challenge_entry_fee",
    grossAmountCents,
    recordCount: current.recordCount + legacy.recordCount,
    records: [...current.records, ...legacy.records],
    pendingChallengeRevenueOnly: true,
    prizeSettlementReady: false
  };
}

export async function getConfirmedPaidVoteRevenueForChallenge(db: Firestore, challengeId: string) {
  const source = await sumConfirmed(db, "paidVotePurchases", challengeId, "paid_vote");
  const split = calculatePaidRevenueSplit(source.grossAmountCents, "paid_vote");
  return { ...source, ...split, creditConsumptionActive: false };
}

export async function getConfirmedSponsorContributionForChallenge(db: Firestore, challengeId: string) {
  const source = await sumConfirmed(db, "sponsorContributions", challengeId, "sponsor_funding");
  const split = calculateSponsorContributionSplit(source.grossAmountCents);
  return { ...source, ...split, sponsorContributionGoesFullyToWinners: true, brandingAutoApproved: false };
}
