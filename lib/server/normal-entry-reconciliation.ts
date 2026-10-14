import type Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";
import { calculateEnterprisePrizeExposure, resolveEnterpriseFinancialOwnership } from "@/lib/server/enterprise-prize-exposure";

/** No charges, refunds or enrollment are performed here. Successful payments await
 * the existing verified webhook; ambiguous states cannot authorize a new charge. */
export async function reconcileNormalEntryCheckout(db: Firestore, stripe: Stripe, challengeId: string, userId: string) {
  const rootId = deterministicId("challenge_entry_fee", challengeId, userId);
  const pointer = await db.collection("normalEntryAttempts").doc(rootId).get();
  const ref = db.collection("challengeEntryPayments").doc(String(pointer.data()?.paymentId ?? rootId));
  const snapshot = await ref.get();
  if (!snapshot.exists) return { restartAllowed: false, reason: "NO_PREVIOUS_CHECKOUT" };
  const payment = snapshot.data()!;
  if (payment.challengeId !== challengeId || payment.userId !== userId) throw new Error("ENTRY_REFERENCE_MISMATCH");
  if (Date.parse(String(payment.reservationExpiresAt)) > Date.now()) return { restartAllowed: false, reason: "RESERVATION_STILL_ACTIVE" };
  if (!payment.providerSessionId) return { restartAllowed: false, reason: "PROVIDER_SESSION_RECONCILIATION_REQUIRED" };
  let session = await stripe.checkout.sessions.retrieve(String(payment.providerSessionId));
  const matches = () => session.id === payment.providerSessionId && session.mode === "payment" && session.metadata?.paymentPurpose === "challenge_entry_fee" && session.metadata?.entryPaymentId === ref.id && session.metadata?.challengeId === challengeId && session.metadata?.userId === userId;
  if (!matches()) throw new Error("ENTRY_PROVIDER_REFERENCE_MISMATCH");
  if (session.status === "open" && session.payment_status === "unpaid") {
    await stripe.checkout.sessions.expire(session.id, {}, { idempotencyKey: `normal_entry_expire_${ref.id}` });
    session = await stripe.checkout.sessions.retrieve(session.id);
  }
  if (!matches()) throw new Error("ENTRY_PROVIDER_REFERENCE_MISMATCH");
  const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  const intent = intentId ? await stripe.paymentIntents.retrieve(intentId) : null;
  const restartAllowed = session.status === "expired" && session.payment_status === "unpaid" && (!intent || (intent.id === intentId && intent.status === "canceled" && intent.amount_received === 0));
  const now = new Date().toISOString();
  return db.runTransaction(async transaction => {
    const latest = await transaction.get(ref);
    const current = latest.data() ?? {};
    if (current.providerSessionId !== session.id || !["pending", "expired", "canceled", "failed"].includes(String(current.status))) return { restartAllowed: false, reason: "PAYMENT_REQUIRES_EXISTING_RECONCILIATION" };
    if (restartAllowed && current.organizationOwnerId && current.reservationStatus !== "released" && !current.enterpriseExposureReleasedAt) {
      const challenge = await transaction.get(db.collection("challenges").doc(challengeId));
      const limitRef = db.collection("enterprisePrizeFundingLimits").doc(challengeId);
      const limits = await transaction.get(limitRef);
      const ownership = resolveEnterpriseFinancialOwnership(challenge.data() ?? {});
      const limit = limits.data() ?? {};
      const amount = Number(current.winnerShareCents);
      if (!challenge.exists || !limits.exists || ownership.workspaceType !== "enterprise" || ownership.organizationOwnerId !== current.organizationOwnerId || limit.organizationOwnerId !== current.organizationOwnerId || !Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(limit.reservedCents) || !Number.isSafeInteger(limit.additionalReservedCents) || limit.reservedCents < amount || limit.additionalReservedCents < amount) return { restartAllowed: false, reason: "ENTERPRISE_EXPOSURE_RECONCILIATION_REQUIRED" };
      const next = { ...limit, reservedCents: limit.reservedCents - amount, additionalReservedCents: limit.additionalReservedCents - amount };
      const exposure = calculateEnterprisePrizeExposure({ challenge: challenge.data()!, limitData: next });
      transaction.update(limitRef, { reservedCents: next.reservedCents, additionalReservedCents: next.additionalReservedCents, exposureCents: exposure.exposureCents, updatedAt: now });
      transaction.update(ref, { enterpriseExposureReleasedAt: now });
    }
    transaction.update(ref, { providerReconciledAt: now, providerReconciledSessionStatus: session.status, providerReconciledPaymentStatus: session.payment_status, providerReconciledIntentStatus: intent?.status ?? null, restartEligible: restartAllowed, ...(restartAllowed ? { status: "canceled", reservationStatus: "released" } : {}), updatedAt: now });
    transaction.create(db.collection("auditLogs").doc(), { action: "normal.entry_checkout_reconciled", actorId: userId, challengeId, paymentId: ref.id, providerSessionId: session.id, restartAllowed, createdAt: now });
    return { restartAllowed, reason: restartAllowed ? "PREVIOUS_CHECKOUT_TERMINAL_UNPAID" : "AWAIT_VERIFIED_WEBHOOK_OR_ADMIN_REVIEW" };
  });
}
