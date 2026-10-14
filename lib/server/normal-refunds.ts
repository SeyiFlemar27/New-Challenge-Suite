import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { normalTimestamp } from "@/lib/server/normal-lifecycle-policy";
export type NormalRefundCause = "not_submitted" | "voluntary_withdrawal" | "disqualification" | "approved_cancellation";
export type NormalRefundCollection = "challengeEntryPayments" | "creatorPrizeFundingPayments" | "sponsorContributions";
export async function queueNormalLifecycleRefunds(db: Firestore, challengeId: string, now = new Date()) {
  const challenge = await db.collection("challenges").doc(challengeId).get();
  const data = challenge.data() ?? {};
  if (!challenge.exists || data.normalLifecyclePolicyVersion !== 1) return;
  const [participants, submissions, payments] = await Promise.all([db.collection("challengeParticipants").where("challengeId", "==", challengeId).get(), db.collection("submissions").where("challengeId", "==", challengeId).get(), db.collection("challengeEntryPayments").where("challengeId", "==", challengeId).get()]);
  const submittedUsers = new Set(submissions.docs.map(doc => String(doc.data().userId)));
  const participantByUser = new Map(participants.docs.map(doc => [String(doc.data().userId), doc]));
  if (Date.parse(String(data.submissionDeadline)) <= now.getTime()) for (const participant of participants.docs) {
    if (submittedUsers.has(String(participant.data().userId)) || participant.data().submissionOutcome === "not_submitted") continue;
    await db.runTransaction(async transaction => {
      const [current, challenge, actualEntries] = await Promise.all([transaction.get(participant.ref), transaction.get(db.collection("challenges").doc(challengeId)), transaction.get(db.collection("submissions").where("challengeId", "==", challengeId).where("userId", "==", participant.data().userId))]);
      if (current.exists && actualEntries.empty && Date.parse(String(challenge.data()?.submissionDeadline)) <= now.getTime()) transaction.update(participant.ref, { submissionOutcome: "not_submitted", updatedAt: now.toISOString() });
    });
  }
  for (const payment of payments.docs) {
    const value = payment.data();
    if (value.status === "pending" && Date.parse(String(value.reservationExpiresAt)) <= now.getTime()) await db.runTransaction(async transaction => {
      const current = await transaction.get(payment.ref);
      if (current.data()?.status === "pending" && Date.parse(String(current.data()?.reservationExpiresAt)) <= now.getTime()) transaction.update(payment.ref, { status: "expired", reservationStatus: "expired", expiredAt: now.toISOString(), updatedAt: now.toISOString() });
    });
    const participant = participantByUser.get(String(value.userId));
    const participantStatus = String(participant?.data().status ?? "");
    let cause: NormalRefundCause | null = data.status === "cancelled" && data.approvedCancellationAt ? "approved_cancellation" : participantStatus === "withdrawn" ? "voluntary_withdrawal" : participantStatus === "disqualified" ? "disqualification" : null;
    if (!cause && Date.parse(String(data.submissionDeadline)) <= now.getTime() && participant && !submittedUsers.has(String(value.userId))) {
      cause = "not_submitted";
    }
    if (cause) await queueNormalRefund(db, { challengeId, paymentCollection: "challengeEntryPayments", paymentId: payment.id, cause, now });
  }
  if (data.status === "cancelled" && data.approvedCancellationAt) for (const collection of ["creatorPrizeFundingPayments", "sponsorContributions"] as const) {
    const funding = await db.collection(collection).where("challengeId", "==", challengeId).get();
    for (const payment of funding.docs) await queueNormalRefund(db, { challengeId, paymentCollection: collection, paymentId: payment.id, cause: "approved_cancellation", now });
  }
}
export type NormalRefundProvider = {
  paymentIntents: { retrieve(id: string, options: { expand: string[] }): Promise<{ id: string; status: string; currency: string; amount_received: number; latest_charge: unknown }> };
  refunds: { create(input: { payment_intent: string; reason: "requested_by_customer"; metadata: { refundCaseId: string } }, options: { idempotencyKey: string }): Promise<{ id: string; status: string | null; amount: number; currency: string; payment_intent: unknown }> };
};

export async function executeNormalPolicyRefund(db: Firestore, caseId: string, provider: NormalRefundProvider, now = new Date()) {
  const ref = db.collection("refundCases").doc(caseId);
  const claimed = await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    const record = snap.data() ?? {};
    if (!snap.exists || record.normalLifecyclePolicyVersion !== 1 || !record.automaticPolicyEligible || !["approved", "executing"].includes(String(record.status)) || (record.status === "executing" && Date.parse(String(record.claimExpiresAt)) > now.getTime())) return null;
    const source = await transaction.get(db.collection(String(record.paymentCollection)).doc(String(record.paymentId)));
    const challenge = await transaction.get(db.collection("challenges").doc(String(record.challengeId)));
    if (!source.exists || source.data()?.stripeDisputeRestricted === true || source.data()?.fraudReviewRequired === true || challenge.data()?.settlementId || challenge.data()?.winnersApprovedAt) {
      transaction.update(ref, { status: "financial_hold", restrictionReason: "financial_state_changed_before_refund", updatedAt: now.toISOString() });
      return null;
    }
    transaction.update(ref, { status: "executing", claimExpiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(), updatedAt: now.toISOString() });
    return record;
  });
  if (!claimed) return { executed: false };
  try {
    const intent = await provider.paymentIntents.retrieve(String(claimed.providerPaymentIntentId), { expand: ["latest_charge"] });
    const charge = intent.latest_charge && typeof intent.latest_charge === "object" ? intent.latest_charge as Record<string, unknown> : {};
    if (intent.id !== claimed.providerPaymentIntentId || intent.status !== "succeeded" || intent.amount_received !== Number(claimed.amountCents) || intent.currency.toUpperCase() !== String(claimed.currency).toUpperCase() || charge.captured !== true || charge.paid !== true || charge.disputed === true || Number(charge.amount_refunded ?? 0) > 0) {
      await ref.update({ status: "financial_hold", restrictionReason: "provider_refund_eligibility_requires_review", updatedAt: now.toISOString() });
      return { executed: false, reviewRequired: true };
    }
    const refund = await provider.refunds.create({ payment_intent: intent.id, reason: "requested_by_customer", metadata: { refundCaseId: caseId } }, { idempotencyKey: `challenge-suite-refund-${caseId}` });
    if (refund.payment_intent !== intent.id || refund.amount !== Number(claimed.amountCents) || refund.currency.toUpperCase() !== intent.currency.toUpperCase()) throw new Error("PROVIDER_REFUND_MISMATCH");
    if (refund.status === "succeeded") await reconcileNormalRefund(db, { refundCaseId: caseId, providerRefundId: refund.id, paymentIntentId: intent.id, amountCents: refund.amount, currency: refund.currency, providerStatus: "succeeded", now });
    else await ref.update({ status: refund.status === "failed" || refund.status === "canceled" ? "financial_hold" : "processing", providerStatus: refund.status, providerRefundId: refund.id, updatedAt: now.toISOString() });
    return { executed: true, status: refund.status };
  } catch {
    await ref.update({ status: "financial_hold", restrictionReason: "provider_outcome_unknown_requires_reconciliation", updatedAt: now.toISOString() });
    return { executed: false, reviewRequired: true };
  }
}

/** Queue a liability against the original payment; this never represents provider execution. */
export async function queueNormalRefund(db: Firestore, input: { challengeId: string; paymentCollection: NormalRefundCollection; paymentId: string; cause: NormalRefundCause; now?: Date }) {
  const ref = db.collection("refundCases").doc(`refund_${input.paymentCollection}_${input.paymentId}`);
  return db.runTransaction(async transaction => {
    const sourceRef = db.collection(input.paymentCollection).doc(input.paymentId);
    const [challenge, source, existing] = await Promise.all([transaction.get(db.collection("challenges").doc(input.challengeId)), transaction.get(sourceRef), transaction.get(ref)]);
    if (!challenge.exists || challenge.data()?.normalLifecyclePolicyVersion !== 1 || !source.exists || source.data()?.challengeId !== input.challengeId) throw new Error("NORMAL_REFUND_SOURCE_INVALID");
    if (existing.exists) return { id: ref.id, duplicate: true, status: existing.data()?.status };
    const payment = source.data() ?? {};
    const participant = await transaction.get(db.collection("challengeParticipants").doc(`${input.challengeId}_${String(payment.userId)}`));
    const submissions = input.cause === "not_submitted" ? await transaction.get(db.collection("submissions").where("challengeId", "==", input.challengeId)) : null;
    const currentChallenge = challenge.data() ?? {};
    if (input.cause === "approved_cancellation" && (currentChallenge.status !== "cancelled" || !currentChallenge.approvedCancellationAt)) throw new Error("NORMAL_REFUND_CAUSE_NOT_AUTHORIZED");
    if (input.cause === "not_submitted" && (!participant.exists || !(Date.parse(String(currentChallenge.submissionDeadline)) <= (input.now ?? new Date()).getTime()) || submissions?.docs.some(doc => doc.data().userId === payment.userId))) return { skipped: true, reason: "submission_present_or_window_open" };
    if (input.cause === "voluntary_withdrawal" && participant.data()?.status !== "withdrawn") throw new Error("NORMAL_REFUND_CAUSE_NOT_AUTHORIZED");
    if (input.cause === "disqualification" && participant.data()?.status !== "disqualified") throw new Error("NORMAL_REFUND_CAUSE_NOT_AUTHORIZED");
    const amountCents = Number(payment.amountCents ?? payment.grossAmountCents);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || payment.webhookConfirmed !== true || !["paid", "confirmed"].includes(String(payment.status))) return { skipped: true, reason: "no_verified_original_charge" };
    const challengeData = challenge.data() ?? {};
    const finalized = Boolean(challengeData.winnersApprovedAt || challengeData.settlementId);
    const earnings = finalized ? await transaction.get(db.collection("cashLedger").where("challengeId", "==", input.challengeId)) : null;
    const withdrawnAt = normalTimestamp(participant.data()?.withdrawnAt);
    const votingStartedAt = normalTimestamp(challengeData.effectiveVotingStartsAt);
    const withdrawalRequiresReview = input.cause === "voluntary_withdrawal" && (!Number.isFinite(withdrawnAt) || (challengeData.effectiveVotingStartsAt && (!Number.isFinite(votingStartedAt) || withdrawnAt >= votingStartedAt)));
    const restricted = payment.stripeDisputeRestricted === true || payment.disputeRestricted === true || payment.fraudReviewRequired === true || payment.chargebackStatus === "open" || payment.refundStatus === "processing" || finalized || Boolean(withdrawalRequiresReview);
    const iso = (input.now ?? new Date()).toISOString();
    const record = { id: ref.id, normalLifecyclePolicyVersion: 1, type: "normal_policy_refund", paymentCollection: input.paymentCollection, paymentId: input.paymentId, challengeId: input.challengeId, userId: payment.userId ?? payment.sponsorId ?? null, amountCents, fullRefundAmountCents: amountCents, currency: payment.currency ?? "USD", provider: "stripe", providerPaymentIntentId: payment.providerPaymentIntentId ?? payment.stripePaymentIntentId ?? null, cause: input.cause, reason: input.cause, status: restricted ? "financial_hold" : "approved", automaticPolicyEligible: !restricted, restrictionReason: finalized ? "winner_allocations_finalized" : withdrawalRequiresReview ? "withdrawal_timing_requires_admin_review" : restricted ? "payment_restriction_requires_admin_review" : null, providerRefundId: null, createdAt: iso, updatedAt: iso };
    transaction.create(ref, record);
    if (finalized) {
      transaction.set(challenge.ref, { settlementRestricted: true, financialResolutionStatus: "post_finalization_disqualification_review", updatedAt: iso }, { merge: true });
      for (const earning of earnings?.docs ?? []) if (earning.data().direction === "credit" && !["paid_out", "paid"].includes(String(earning.data().status)) && earning.data().externalPayoutExecuted !== true) transaction.update(earning.ref, { disputeRestricted: true, financialRestrictionReason: "post_finalization_review", updatedAt: iso });
    }
    transaction.set(sourceRef, { refundLiabilityStatus: "pending", refundCaseId: ref.id, settlementRestricted: true, updatedAt: iso }, { merge: true });
    transaction.create(db.collection("auditLogs").doc(`normal_refund_queued_${ref.id}`), { actorId: "system_normal_lifecycle", action: "normal.refund_liability_queued", targetId: ref.id, challengeId: input.challengeId, reason: input.cause, after: record, createdAt: iso });
    return { id: ref.id, duplicate: false, status: record.status };
  });
}

/** Called only for a provider-verified succeeded full refund. Idempotent source reconciliation. */
export async function reconcileNormalRefund(db: Firestore, input: { refundCaseId: string; providerRefundId: string; paymentIntentId: string; amountCents: number; currency: string; providerStatus: string; now?: Date }) {
  if (input.providerStatus !== "succeeded") return { reconciled: false };
  return db.runTransaction(async transaction => {
    const caseRef = db.collection("refundCases").doc(input.refundCaseId);
    const recordSnap = await transaction.get(caseRef);
    if (!recordSnap.exists || recordSnap.data()?.normalLifecyclePolicyVersion !== 1) return { reconciled: false };
    const record = recordSnap.data() ?? {};
    if (record.sourceReconciledAt) return { reconciled: true, duplicate: true };
    if (record.providerPaymentIntentId !== input.paymentIntentId || Number(record.amountCents) !== input.amountCents || String(record.currency).toUpperCase() !== input.currency.toUpperCase()) throw new Error("NORMAL_REFUND_PROVIDER_MISMATCH");
    const collection = String(record.paymentCollection);
    if (!["challengeEntryPayments", "creatorPrizeFundingPayments", "sponsorContributions"].includes(collection)) throw new Error("NORMAL_REFUND_SOURCE_INVALID");
    const paymentRef = db.collection(collection).doc(String(record.paymentId));
    const challengeRef = db.collection("challenges").doc(String(record.challengeId));
    const [source, challenge, prizePool, earnings] = await Promise.all([transaction.get(paymentRef), transaction.get(challengeRef), transaction.get(db.collection("prizePools").doc(String(record.challengeId))), transaction.get(db.collection("cashLedger").where("challengeId", "==", record.challengeId))]);
    if (!source.exists || !challenge.exists || source.data()?.challengeId !== record.challengeId) throw new Error("NORMAL_REFUND_SOURCE_INVALID");
    const payment = source.data() ?? {};
    const finalized = Boolean(challenge.data()?.settlementId || challenge.data()?.winnersApprovedAt);
    const iso = (input.now ?? new Date()).toISOString();
    transaction.update(caseRef, { status: "succeeded", providerRefundId: input.providerRefundId, sourceReconciledAt: iso, completedAt: iso, updatedAt: iso });
    transaction.update(paymentRef, { status: "refunded", refundStatus: "succeeded", refundLiabilityStatus: "resolved", refundedAmountCents: input.amountCents, providerRefundId: input.providerRefundId, sourceReconciledAt: iso, updatedAt: iso });
    if (finalized) {
      for (const earning of earnings.docs) if (earning.data().direction === "credit" && !["paid_out", "paid"].includes(String(earning.data().status)) && earning.data().externalPayoutExecuted !== true) transaction.update(earning.ref, { disputeRestricted: true, financialRestrictionReason: "post_finalization_refund_review", updatedAt: iso });
      transaction.update(challengeRef, { settlementRestricted: true, financialResolutionStatus: "post_finalization_refund_review", updatedAt: iso });
      transaction.set(db.collection("adminActionTasks").doc(`normal_finalized_refund_${input.refundCaseId}`), { type: "normal_post_finalization_financial_review", challengeId: record.challengeId, refundCaseId: caseRef.id, status: "open", reason: "Provider refund confirmed after allocation. Preserve completed payouts and reconcile unpaid exposure.", createdAt: iso });
    } else if (collection === "creatorPrizeFundingPayments") {
      transaction.update(challengeRef, { confirmedCreatorPrizeFundingCents: FieldValue.increment(-input.amountCents), "monetization.confirmedCreatorPrizeFundingCents": FieldValue.increment(-input.amountCents), updatedAt: iso });
      if (prizePool.exists) transaction.update(prizePool.ref, { confirmedCreatorFundingCents: FieldValue.increment(-input.amountCents), totalConfirmedCents: FieldValue.increment(-input.amountCents), totalCommittedCents: FieldValue.increment(-input.amountCents), visibleJackpotCents: FieldValue.increment(-input.amountCents), updatedAt: iso });
    } else if (collection === "sponsorContributions") {
      transaction.update(challengeRef, { confirmedSponsorContributionCents: FieldValue.increment(-input.amountCents), confirmedSponsorContributionWinnerShareCents: FieldValue.increment(-input.amountCents), ...(typeof challenge.data()?.sponsorContributionConfirmedCount === "number" ? { sponsorContributionConfirmedCount: FieldValue.increment(-1) } : {}), updatedAt: iso });
      if (prizePool.exists) transaction.update(prizePool.ref, { confirmedSponsorContributionCents: FieldValue.increment(-input.amountCents), visibleJackpotCents: FieldValue.increment(-input.amountCents), updatedAt: iso });
    } else {
      transaction.update(challengeRef, { pendingEntryFeeRevenueGrossCents: FieldValue.increment(-input.amountCents), pendingEntryFeeWinnerShareCents: FieldValue.increment(-Number(payment.winnerShareCents ?? 0)), pendingEntryFeeCreatorShareCents: FieldValue.increment(-Number(payment.creatorHostOperatorShareCents ?? 0)), pendingEntryFeePlatformFeeCents: FieldValue.increment(-Number(payment.platformFeeCents ?? 0)), ...(typeof challenge.data()?.pendingEntryFeeNetCents === "number" ? { pendingEntryFeeNetCents: FieldValue.increment(-Number(payment.amountNetCents ?? Number(payment.winnerShareCents ?? 0) + Number(payment.creatorHostOperatorShareCents ?? 0))) } : {}), ...(typeof challenge.data()?.paidEntryConfirmedCount === "number" ? { paidEntryConfirmedCount: FieldValue.increment(-1) } : {}), updatedAt: iso });
      if (payment.organizationOwnerId && prizePool.exists) {
        transaction.update(challengeRef, { confirmedEntryFeeAllocationCents: FieldValue.increment(-Number(payment.winnerShareCents ?? 0)) });
        transaction.update(prizePool.ref, { confirmedEntryFeeAllocationCents: FieldValue.increment(-Number(payment.winnerShareCents ?? 0)), totalConfirmedCents: FieldValue.increment(-Number(payment.winnerShareCents ?? 0)), totalCommittedCents: FieldValue.increment(-Number(payment.winnerShareCents ?? 0)), visibleJackpotCents: FieldValue.increment(-Number(payment.winnerShareCents ?? 0)), updatedAt: iso });
      }
      transaction.set(db.collection("challengeParticipants").doc(`${record.challengeId}_${payment.userId}`), { entryPaymentStatus: "refunded", entryRefundConfirmedAt: iso, updatedAt: iso }, { merge: true });
    }
    transaction.create(db.collection("challengeFinancialLedger").doc(`normal_refund_${caseRef.id}`), { id: `normal_refund_${caseRef.id}`, challengeId: record.challengeId, userId: payment.userId ?? payment.sponsorId ?? null, purpose: "refund", sourceType: collection, sourceResource: `${collection}/${record.paymentId}`, amountCents: input.amountCents, currency: input.currency, direction: "debit_reversal", status: "confirmed", provider: "stripe", providerReference: input.providerRefundId, immutable: true, createdAt: iso });
    transaction.create(db.collection("auditLogs").doc(`normal_refund_confirmed_${caseRef.id}`), { actorId: "provider_refund_confirmation", action: "normal.refund_reconciled", targetId: caseRef.id, challengeId: record.challengeId, reason: record.reason, providerReference: input.providerRefundId, amountCents: input.amountCents, completedPayoutsPreserved: true, createdAt: iso });
    return { reconciled: true, duplicate: false };
  });
}
