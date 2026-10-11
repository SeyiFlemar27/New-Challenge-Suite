import type Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";

export async function recordStripeSponsorDispute(
  db: Firestore,
  input: { dispute: Stripe.Dispute; charge: Stripe.Charge; paymentIntent: Stripe.PaymentIntent; eventId: string; eventType: string; now?: string }
) {
  const { dispute, charge, paymentIntent } = input;
  const now = input.now ?? new Date().toISOString();
  const caseId = deterministicId("stripe_chargeback", dispute.id);
  const caseRef = db.collection("chargebackCases").doc(caseId);
  const disputeRef = db.collection("stripeSponsorDisputes").doc(dispute.id);
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? "";
  const disputeChargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id ?? "";
  const disputePaymentIntentId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id ?? "";
  const currency = String(dispute.currency ?? "").toLowerCase();
  const providerObjectMatches = Boolean(dispute.id && disputeChargeId === charge.id && paymentIntentId === paymentIntent.id
    && disputePaymentIntentId === paymentIntent.id && paymentIntent.latest_charge
    && (typeof paymentIntent.latest_charge === "string" ? paymentIntent.latest_charge : paymentIntent.latest_charge.id) === charge.id
    && Number.isSafeInteger(dispute.amount) && dispute.amount > 0 && dispute.amount <= charge.amount
    && currency && currency === String(charge.currency).toLowerCase() && currency === String(paymentIntent.currency).toLowerCase());
  const contributionQuery = await db.collection("sponsorContributions").where("stripePaymentIntentId", "==", paymentIntent.id).limit(2).get();
  const contributionDoc = contributionQuery.size === 1 ? contributionQuery.docs[0] : null;
  const contribution = contributionDoc?.data() ?? {};
  const sourceMatches = Boolean(providerObjectMatches && contributionDoc && ["confirmed", "pending", "payment_review_required"].includes(String(contribution.status))
    && contribution.stripePaymentIntentId === paymentIntent.id
    && (!contribution.stripeChargeId || contribution.stripeChargeId === charge.id)
    && Number(contribution.amountCents) === charge.amount
    && String(contribution.currency ?? "").toLowerCase() === String(charge.currency).toLowerCase());
  const challengeId = sourceMatches ? String(contribution.challengeId ?? "") : "";
  let linked = false;
  let restrictionActive = true;

  await db.runTransaction(async (transaction) => {
    const [caseSnap, disputeSnap, contributionSnap] = await Promise.all([
      transaction.get(caseRef), transaction.get(disputeRef), contributionDoc ? transaction.get(contributionDoc.ref) : Promise.resolve(null)
    ]);
    const linkedSource = contributionSnap?.data() ?? {};
    const linkStillValid = Boolean(sourceMatches && contributionSnap?.exists && ["confirmed", "pending", "payment_review_required"].includes(String(linkedSource.status))
      && linkedSource.stripePaymentIntentId === paymentIntent.id
      && (!linkedSource.stripeChargeId || linkedSource.stripeChargeId === charge.id)
      && Number(linkedSource.amountCents) === charge.amount
      && String(linkedSource.currency ?? "").toLowerCase() === String(charge.currency).toLowerCase());
    linked = linkStillValid;
    const previous = disputeSnap.data() ?? {};
    const settlementQuery = linkStillValid
      ? db.collection("challengeSettlements").where("challengeId", "==", challengeId).limit(5)
      : null;
    const settlementSnap = settlementQuery ? await transaction.get(settlementQuery) : null;
    const settlementDocs = settlementSnap?.docs ?? [];
    const ledgerSnaps = await Promise.all(settlementDocs.map((settlement) => transaction.get(
      db.collection("cashLedger").where("settlementId", "==", settlement.id).limit(250)
    )));
    const status = String(dispute.status);
    const isRestricted = !(status === "won" || status === "lost") || Boolean(linkStillValid && previous.restrictionActive !== false);
    const otherCasesSnap = linkStillValid
      ? await transaction.get(db.collection("chargebackCases").where("contributionId", "==", contributionDoc!.id).limit(50))
      : null;
    const otherRestrictionActive = otherCasesSnap?.docs.some((item) => item.id !== caseId && item.data().restrictionActive === true) ?? false;
    restrictionActive = isRestricted || (linkStillValid && previous.reconciledAt == null) || otherRestrictionActive;
    transaction.set(disputeRef, {
      id: dispute.id, caseId, provider: "stripe", providerEventId: input.eventId, providerEventType: input.eventType,
      providerEventIds: Array.from(new Set([...(Array.isArray(previous.providerEventIds) ? previous.providerEventIds : []), input.eventId])).slice(-100),
      providerStatus: status, providerOutcome: status === "won" || status === "lost" ? status : null,
      providerCreatedAt: Number.isSafeInteger(dispute.created) ? new Date(dispute.created * 1000).toISOString() : null,
      providerUpdatedAt: now, amountCents: dispute.amount, currency, chargeId: charge.id, paymentIntentId: paymentIntent.id,
      contributionId: linkStillValid ? contributionDoc!.id : null, challengeId: linkStillValid ? challengeId : null,
      sponsorOrganizationId: linkStillValid ? linkedSource.sponsorOrganizationId ?? linkedSource.sponsorId ?? null : null,
      agreementId: linkStillValid ? linkedSource.agreementId ?? null : null,
      settlementIds: linkStillValid ? settlementDocs.map((item) => item.id) : [],
      restrictionActive,
      linkStatus: linkStillValid ? "verified" : contributionQuery.size > 1 ? "ambiguous_source" : providerObjectMatches ? "unlinked_source" : "provider_reference_mismatch",
      adminReconciliationStatus: previous.adminReconciliationStatus ?? "required",
      createdAt: previous.createdAt ?? now, updatedAt: now
    }, { merge: true });
    transaction.set(caseRef, {
      id: caseId, caseType: "stripe_sponsor_dispute", stripeDisputeId: dispute.id, provider: "stripe",
      providerStatus: status, providerOutcome: status === "won" || status === "lost" ? status : null,
      chargeId: charge.id, paymentIntentId: paymentIntent.id, contributionId: linkStillValid ? contributionDoc!.id : null,
      challengeId: linkStillValid ? challengeId : null, agreementId: linkStillValid ? linkedSource.agreementId ?? null : null,
      amountCents: dispute.amount, currency, settlementIds: linkStillValid ? settlementDocs.map((item) => item.id) : [],
      linkStatus: linkStillValid ? "verified" : contributionQuery.size > 1 ? "ambiguous_source" : providerObjectMatches ? "unlinked_source" : "provider_reference_mismatch",
      restrictionActive,
      adminReconciliationStatus: previous.adminReconciliationStatus ?? "required", createdAt: previous.createdAt ?? now,
      updatedAt: now, latestProviderEventId: input.eventId, lastProviderEventType: input.eventType,
      exposedCompletedPayoutsPreserved: true, automaticDebitExecuted: false
    }, { merge: true });
    if (linkStillValid) {
      transaction.set(contributionDoc!.ref, {
        stripeChargeId: charge.id, stripeDisputeRestricted: restrictionActive, stripeDisputeIds: Array.from(new Set([...(Array.isArray(linkedSource.stripeDisputeIds) ? linkedSource.stripeDisputeIds : []), dispute.id])),
        stripeDisputeReviewRequired: restrictionActive, updatedAt: now
      }, { merge: true });
      for (const settlementDoc of restrictionActive ? settlementDocs : []) {
        const settlement = settlementDoc.data() ?? {};
        const priorSettlementStatus = String(settlement.status ?? "created_pending_review");
        const settlementLedgers = ledgerSnaps[settlementDocs.indexOf(settlementDoc)]?.docs ?? [];
        const completedPayoutExposureCents = settlementLedgers.reduce((sum, ledgerSnap) => {
          const ledger = ledgerSnap.data();
          return sum + (ledger.status === "paid_out" || ledger.paid === true || ledger.externalPayoutExecuted === true
            ? Math.max(0, Number(ledger.netAmountCents ?? ledger.amountCents ?? 0)) : 0);
        }, 0);
        transaction.set(settlementDoc.ref, {
          disputeRestricted: true, disputeReviewRequired: true,
          statusBeforeDispute: settlement.disputeRestricted === true ? settlement.statusBeforeDispute ?? "created_pending_review" : priorSettlementStatus,
          disputeIds: Array.from(new Set([...(Array.isArray(settlement.disputeIds) ? settlement.disputeIds : []), dispute.id])),
          disputedSponsorContributionIds: Array.from(new Set([...(Array.isArray(settlement.disputedSponsorContributionIds) ? settlement.disputedSponsorContributionIds : []), contributionDoc!.id])),
          disputeExposureCents: Math.max(Number(settlement.disputeExposureCents ?? 0), dispute.amount),
          disputedSponsorFundingAmountCents: Math.max(Number(settlement.disputedSponsorFundingAmountCents ?? 0), Number(linkedSource.amountCents ?? 0)),
          disputedCompletedPayoutExposureCents: Math.max(Number(settlement.disputedCompletedPayoutExposureCents ?? 0), completedPayoutExposureCents),
          status: settlement.status === "paid" || settlement.status === "settled" ? settlement.status : "disputed_pending_admin_reconciliation",
          updatedAt: now
        }, { merge: true });
        for (const ledgerSnap of settlementLedgers) {
          const ledger = ledgerSnap.data();
          if (ledger.status !== "paid_out" && ledger.paid !== true && ledger.externalPayoutExecuted !== true) {
            transaction.set(ledgerSnap.ref, { disputeRestricted: true, disputeId: dispute.id, disputeReviewRequired: true, updatedAt: now }, { merge: true });
          }
        }
      }
    }
    if (!caseSnap.exists) {
      transaction.set(db.collection("adminActionTasks").doc(caseId), {
        id: caseId, type: "stripe_sponsor_dispute_reconciliation", status: "open", targetType: "stripe_sponsor_dispute",
        targetId: dispute.id, challengeId: linkStillValid ? challengeId : null, contributionId: linkStillValid ? contributionDoc!.id : null, amountCents: dispute.amount,
        currency, createdAt: now, updatedAt: now
      }, { merge: true });
    }
  });
  return { handled: true, kind: "stripe_sponsor_dispute", disputeId: dispute.id, linked, status: dispute.status, restrictionActive };
}
