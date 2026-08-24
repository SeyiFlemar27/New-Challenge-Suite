import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { deterministicId } from "@/lib/server/idempotency";

export const CREATOR_PRIZE_PAYMENT_PURPOSE = "prize_pool_funding" as const;

function cents(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function currency(value: unknown) {
  return String(value ?? "USD").trim().toUpperCase() || "USD";
}

export async function createPendingCreatorPrizeFunding(db: Firestore, input: {
  challengeId: string;
  creatorId: string;
  amountCents: number;
  currency?: string;
  now?: string;
}) {
  const amountCents = cents(input.amountCents);
  if (amountCents < 500) throw new Error("Creator prize funding must be at least $5.");
  const now = input.now ?? new Date().toISOString();
  const id = deterministicId("creator_prize_funding", input.challengeId, input.creatorId, amountCents);
  const ref = db.collection("creatorPrizeFundingPayments").doc(id);
  const existing = await ref.get();
  if (existing.exists && existing.data()?.status === "confirmed" && existing.data()?.webhookConfirmed === true) {
    return { id: existing.id, ...existing.data(), idempotent: true };
  }
  const record = {
    id,
    challengeId: input.challengeId,
    userId: input.creatorId,
    paymentPurpose: CREATOR_PRIZE_PAYMENT_PURPOSE,
    transactionPurpose: "prize_pool_funding",
    fundingSource: "creator_funded",
    amountCents,
    grossAmountCents: amountCents,
    feeAmountCents: 0,
    netAmountCents: amountCents,
    currency: currency(input.currency),
    direction: "credit",
    status: "pending",
    provider: "stripe",
    providerSessionId: null,
    providerPaymentIntentId: null,
    providerEventId: null,
    webhookConfirmed: false,
    reservationStatus: "pending_payment",
    payoutExecutionEnabled: false,
    refundExecutionEnabled: false,
    idempotencyKey: id,
    createdAt: existing.exists ? existing.data()?.createdAt ?? now : now,
    updatedAt: now,
    confirmedAt: null
  };
  await ref.set(record, { merge: true });
  return record;
}

export async function attachCreatorPrizeCheckoutSession(db: Firestore, id: string, session: Stripe.Checkout.Session) {
  await db.collection("creatorPrizeFundingPayments").doc(id).set({
    providerSessionId: session.id,
    stripeCheckoutSessionId: session.id,
    checkoutUrlCreated: Boolean(session.url),
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

function assertConfirmedSession(session: Stripe.Checkout.Session, record: Record<string, unknown>) {
  if (session.mode !== "payment" || session.payment_status !== "paid") throw new Error("Creator prize funding is not provider-confirmed.");
  if (session.metadata?.paymentPurpose !== CREATOR_PRIZE_PAYMENT_PURPOSE) throw new Error("Creator prize funding purpose mismatch.");
  if (session.metadata?.creatorPrizeFundingId !== record.id) throw new Error("Creator prize funding reference mismatch.");
  if (session.metadata?.challengeId !== record.challengeId || session.metadata?.userId !== record.userId) throw new Error("Creator prize funding ownership metadata mismatch.");
  if (cents(session.amount_total) !== cents(record.amountCents)) throw new Error("Creator prize funding amount mismatch.");
  if (currency(session.currency) !== currency(record.currency)) throw new Error("Creator prize funding currency mismatch.");
}

export async function confirmCreatorPrizeFunding(db: Firestore, event: Stripe.Event, session: Stripe.Checkout.Session) {
  const id = String(session.metadata?.creatorPrizeFundingId ?? "");
  if (!id) throw new Error("Creator prize funding reference is missing.");
  const paymentRef = db.collection("creatorPrizeFundingPayments").doc(id);
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const paymentSnap = await transaction.get(paymentRef);
    if (!paymentSnap.exists) throw new Error("Creator prize funding record was not found.");
    const payment = { id: paymentSnap.id, ...paymentSnap.data() } as Record<string, unknown>;
    assertConfirmedSession(session, payment);
    if (payment.status === "confirmed" && payment.webhookConfirmed === true) return { handled: true, kind: CREATOR_PRIZE_PAYMENT_PURPOSE, id, duplicate: true };

    const challengeId = String(payment.challengeId);
    const creatorId = String(payment.userId);
    const amountCents = cents(payment.amountCents);
    const challengeRef = db.collection("challenges").doc(challengeId);
    const challengeSnap = await transaction.get(challengeRef);
    if (!challengeSnap.exists) throw new Error("Challenge for creator prize funding was not found.");
    const challenge = challengeSnap.data() ?? {};
    if (String(challenge.creatorId ?? challenge.ownerId ?? "") !== creatorId) throw new Error("Creator prize funding owner no longer matches the challenge.");
    const monetization = typeof challenge.monetization === "object" && challenge.monetization ? challenge.monetization as Record<string, unknown> : {};
    const requiredCents = cents(monetization.creatorPrizeFundingRequiredCents);
    const previouslyConfirmed = cents(challenge.confirmedCreatorPrizeFundingCents ?? monetization.confirmedCreatorPrizeFundingCents);
    const totalConfirmed = previouslyConfirmed + amountCents;
    const fundingStatus = requiredCents > 0 && totalConfirmed >= requiredCents ? "fully_funded" : "partially_funded";
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
    const ledgerId = deterministicId("creator_prize_funding_ledger", id);

    transaction.set(paymentRef, {
      status: "confirmed",
      webhookConfirmed: true,
      reservationStatus: "reserved",
      providerSessionId: session.id,
      stripeCheckoutSessionId: session.id,
      providerPaymentIntentId: paymentIntentId,
      stripePaymentIntentId: paymentIntentId,
      providerEventId: event.id,
      stripeEventId: event.id,
      confirmedAt: now,
      updatedAt: now
    }, { merge: true });
    transaction.set(challengeRef, {
      confirmedCreatorPrizeFundingCents: FieldValue.increment(amountCents),
      "monetization.confirmedCreatorPrizeFundingCents": totalConfirmed,
      "monetization.creatorPrizeFundingStatus": fundingStatus,
      "monetization.prizePoolFundingSource": "creator_funded",
      updatedAt: now
    }, { merge: true });
    transaction.set(db.collection("prizePools").doc(challengeId), {
      challengeId,
      currency: currency(payment.currency),
      confirmedCreatorFundingCents: FieldValue.increment(amountCents),
      totalConfirmedCents: FieldValue.increment(amountCents),
      totalCommittedCents: FieldValue.increment(amountCents),
      visibleJackpotCents: FieldValue.increment(amountCents),
      fundingStatus,
      status: fundingStatus,
      fundsLockedForPrize: true,
      transferEnabled: false,
      prizeReleaseEnabled: false,
      payoutExecutionEnabled: false,
      updatedAt: now
    }, { merge: true });
    transaction.set(db.collection("challengeFinancialLedger").doc(ledgerId), {
      id: ledgerId,
      transactionId: id,
      userId: creatorId,
      challengeId,
      purpose: "prize_pool_funding",
      sourceType: "creator_funded",
      sourceResource: `creatorPrizeFundingPayments/${id}`,
      grossAmountCents: amountCents,
      feeAmountCents: 0,
      netAmountCents: amountCents,
      amountCents,
      currency: currency(payment.currency),
      direction: "credit",
      bucket: "reserved_prize_funds",
      status: "reserved",
      provider: "stripe",
      providerReference: session.id,
      providerEventId: event.id,
      idempotencyKey: ledgerId,
      payoutExecutionEnabled: false,
      refundExecutionEnabled: false,
      auditMetadata: { verifiedByWebhook: true, fundingSource: "creator_funded", noExternalPayout: true },
      createdAt: now,
      confirmedAt: now,
      updatedAt: now
    }, { merge: true });
    transaction.set(db.collection("auditLogs").doc(deterministicId("creator_prize_funding_confirmed", id, event.id)), {
      actorId: creatorId,
      actorType: "creator",
      action: "prize_pool.creator_funding_confirmed",
      targetType: "challenge",
      targetId: challengeId,
      metadata: { creatorPrizeFundingId: id, amountCents, providerEventId: event.id, payoutExecutionEnabled: false },
      createdAt: now
    });
    return { handled: true, kind: CREATOR_PRIZE_PAYMENT_PURPOSE, id, duplicate: false, fundingStatus, totalConfirmed, payoutProviderCalled: false };
  });
}

export async function expireCreatorPrizeFunding(db: Firestore, session: Stripe.Checkout.Session) {
  const id = String(session.metadata?.creatorPrizeFundingId ?? "");
  if (!id) return { handled: false, reason: "creator_prize_funding_id_missing" };
  const now = new Date().toISOString();
  await db.collection("creatorPrizeFundingPayments").doc(id).set({ status: "expired", reservationStatus: "not_reserved", webhookConfirmed: false, providerSessionId: session.id, expiredAt: now, updatedAt: now }, { merge: true });
  return { handled: true, kind: CREATOR_PRIZE_PAYMENT_PURPOSE, id, status: "expired" };
}

export async function getConfirmedCreatorPrizeFunding(db: Firestore, challengeId: string) {
  const snap = await db.collection("creatorPrizeFundingPayments").where("challengeId", "==", challengeId).get();
  const records = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }))
    .filter((item) => item.paymentPurpose === CREATOR_PRIZE_PAYMENT_PURPOSE && item.webhookConfirmed === true && item.status === "confirmed");
  return {
    grossAmountCents: records.reduce((sum, item) => sum + cents(item.amountCents ?? item.grossAmountCents), 0),
    recordCount: records.length,
    records,
    confirmedOnly: true,
    pendingFailedCancelledExcluded: true
  };
}
