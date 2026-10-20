import type { Firestore, Transaction } from "firebase-admin/firestore";
import { publicationSafetyHold } from "@/lib/publishing-policy";

export class PublicationGuardError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export async function readPublicationSafety(db: Firestore, tx: Transaction, userId: string, challenge: Record<string, unknown>) {
  const [account, profile] = await Promise.all([tx.get(db.collection("users").doc(userId)), tx.get(db.collection("profiles").doc(userId))]);
  return publicationSafetyHold({ ...profile.data(), ...account.data() }, challenge);
}

export async function requireConfirmedPublicationFunding(db: Firestore, tx: Transaction, id: string, current: Record<string, unknown>, next: Record<string, unknown>, allowDeficit = false) {
  const required = next.prizeType === "money" ? Math.round(Number(next.prizeValue ?? 0) * 100) : 0;
  if (!Number.isSafeInteger(required) || required < 0) throw new PublicationGuardError("BASE_PRIZE_INVALID", "Enter a valid Base Prize amount.");
  const rows = await tx.get(db.collection("creatorPrizeFundingPayments").where("challengeId", "==", id));
  if (!allowDeficit && (current.financialRestriction || current.settlementRestricted === true || current.stripeDisputeRestricted === true)) throw new PublicationGuardError("FINANCIAL_RECONCILIATION_REQUIRED", "Resolve the existing financial restriction before publishing.");
  const organizationId = String(current.organizationOwnerId ?? "");
  const ownerId = String(current.creatorId ?? current.hostId ?? current.ownerId ?? "");
  const confirmed = rows.docs.reduce((sum, document) => {
    const payment = document.data(), amount = Number(payment.amountCents);
    const owned = organizationId ? payment.organizationOwnerId === organizationId : payment.userId === ownerId && !payment.organizationOwnerId;
    const refundRestricted = ["pending", "processing", "required", "succeeded", "review_required"].includes(String(payment.refundStatus)) || ["pending", "processing", "required"].includes(String(payment.refundLiabilityStatus));
    return owned && payment.status === "confirmed" && payment.webhookConfirmed === true && payment.paymentPurpose === "prize_pool_funding" && !payment.settlementRestricted && !payment.financialRestriction && !refundRestricted && String(payment.currency).toUpperCase() === "USD" && Number.isSafeInteger(amount) && amount > 0 ? sum + amount : sum;
  }, 0);
  if (!Number.isSafeInteger(confirmed) || (!allowDeficit && confirmed < required)) throw new PublicationGuardError("CREATOR_PRIZE_FUNDING_REQUIRED", "Confirm the full creator-funded Base Prize before publishing. Expected sponsor or entry revenue cannot replace it.");
  if (!allowDeficit && required === 0 && rows.docs.some(document => document.data().paymentPurpose === "prize_pool_funding" && document.data().status === "pending" && Number(document.data().amountCents) > 0)) throw new PublicationGuardError("PENDING_PRIZE_COMMITMENT_CHANGE", "Reconcile the pending creator prize payment before removing its Base Prize commitment.");
  if ((confirmed > 0 || current.creatorPrizeGuaranteeLockedAt) && Number(next.prizeValue ?? 0) !== Number(current.prizeValue ?? 0)) throw new PublicationGuardError("BASE_PRIZE_COMMITMENT_LOCKED", "A confirmed Base Prize cannot be changed through publication.");
  if (!allowDeficit && (confirmed > 0 || current.creatorPrizeGuaranteeLockedAt)) for (const field of ["numberOfWinners", "winnerSplits", "winnerPrizeAmountsCents"]) {
    const saved = current[field];
    // Empty legacy calculation arrays are not confirmed participant commitments.
    if (saved !== undefined && (!Array.isArray(saved) || saved.length > 0) && next[field] !== undefined && JSON.stringify(saved) !== JSON.stringify(next[field])) throw new PublicationGuardError("WINNER_COMMITMENT_LOCKED", "Existing funded winner commitments cannot be changed through publication.");
  }
  return { required, confirmed };
}

export function recordPublicationHold(db: Firestore, tx: Transaction, id: string, source: "challenges" | "tournaments", userId: string, reason: string, now: string) {
  const update = { publicationOutcome: "held_for_moderation", moderationStatus: "held", moderationReason: reason, publicVisibility: false, updatedAt: now };
  tx.set(db.collection(source).doc(id), update, { merge: true });
  tx.set(db.collection("challengeModerationCases").doc(`${source}_${id}`), { targetId: id, source, creatorId: userId, status: "open", reasonCode: reason, sourceType: "persisted_safety_restriction", updatedAt: now }, { merge: true });
  tx.set(db.collection("auditLogs").doc(`publication_hold_${source}_${id}`), { targetId: id, actorId: userId, action: "publication.held_for_moderation", reasonCode: reason, createdAt: now }, { merge: true });
  return update;
}
