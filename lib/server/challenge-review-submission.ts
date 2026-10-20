import { challengeReviewBuilderDestination } from "@/lib/notification-navigation";
import type { Firestore } from "firebase-admin/firestore";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { assertNoUndefinedFirestoreValues } from "@/lib/server/firestore-payload";
import { mergeChallengePrizePoolFoundation } from "@/lib/server/prize-pools";
import { prepareEnterpriseActiveChallengeSlot } from "@/lib/server/enterprise-active-challenge-limit";
import { isEnterpriseFinanceResource, prepareEnterprisePrizeValueUpdate, resolveEnterpriseFinancialOwnership } from "@/lib/server/enterprise-prize-exposure";
import { enterpriseChallengeInScope, hasEnterprisePermission, normalizeEnterpriseAccess } from "@/lib/enterprise-access";
import { normalBasePrizeCents } from "@/lib/normal-base-prize-policy";
import { freeBasicUsage, FREE_BASIC_CHALLENGE_LIFETIME_LIMIT, freeBasicLimitMessage } from "@/lib/server/free-challenge-limits";
import { readPublicationSafety, recordPublicationHold, requireConfirmedPublicationFunding } from "@/lib/server/publication-guards";
import { seedLiveEventJobs } from "@/lib/server/live-event-job-outbox";
import { wakeNormalLifecycleJob } from "@/lib/server/normal-lifecycle-outbox";
import { canCreateChallenge, getPlanExperience, getUserPlanAccess } from "@/lib/plan-access";
import { resolveApprovedChallengeStatus } from "@/lib/server/challenge-lifecycle";

export class ChallengeReviewTransitionError extends Error {
  readonly code: "CHALLENGE_NOT_FOUND" | "PERMISSION_DENIED" | "CHALLENGE_STATE_CHANGED";
  constructor(code: "CHALLENGE_NOT_FOUND" | "PERMISSION_DENIED" | "CHALLENGE_STATE_CHANGED", message: string) {
    super(message);
    this.code = code;
    this.name = "ChallengeReviewTransitionError";
  }
}

type ReviewSubmissionInput = {
  challengeId: string;
  userId: string;
  expectedStatus: string;
  expectedUpdatedAt?: unknown;
  update: Record<string, unknown>;
  revision: Record<string, unknown> & { id: string };
  revenue: Record<string, unknown>;
  mediaVerification?: Record<string, unknown>;
  submitAudit: Record<string, unknown> & { id: string };
  revisionAudit: Record<string, unknown> & { id: string };
  prizePool: {
    prizeType?: string;
    prizeValueCents?: number;
    sponsorEnabled?: boolean;
    paidEntryEnabled?: boolean;
    now?: string;
  };
};

export async function commitChallengeReviewSubmission(db: Firestore, input: ReviewSubmissionInput) {
  const at = String(input.update.updatedAt ?? new Date().toISOString());
  const status = input.update.isLiveEvent ? "scheduled" : resolveApprovedChallengeStatus({ startsAt: String(input.update.startsAt ?? ""), submissionDeadline: String(input.update.submissionDeadline ?? ""), votingDeadline: String(input.update.votingDeadline ?? "") }, new Date(at));
  input = { ...input, update: { ...input.update, status, lifecycleStatus: status, adminReviewRequired: false, reviewStatus: "not_required", adminApprovalStatus: "approved", publicationPolicyVersion: 1, publicationOutcome: "published", publishedAt: at } };
  for (const [name, payload] of Object.entries({ update: input.update, revision: input.revision, revenue: input.revenue, submitAudit: input.submitAudit, revisionAudit: input.revisionAudit })) {
    assertNoUndefinedFirestoreValues(payload, name);
  }

  const challengeRef = db.collection("challenges").doc(input.challengeId);
  const revisionRef = db.collection("challengePublicationEvents").doc(input.revision.id);
  const revenueRef = db.collection("revenueShareLedgers").doc(`revenue_share_${input.challengeId}`);
  const prizePoolRef = db.collection("prizePools").doc(input.challengeId);
  const submitAuditRef = db.collection("auditLogs").doc(input.submitAudit.id);
  const revisionAuditRef = db.collection("auditLogs").doc(input.revisionAudit.id);

  return db.runTransaction(async (transaction) => {
    const [latestChallengeSnap, prizePoolSnap] = await Promise.all([
      transaction.get(challengeRef),
      transaction.get(prizePoolRef)
    ]);
    if (!latestChallengeSnap.exists) throw new ChallengeReviewTransitionError("CHALLENGE_NOT_FOUND", "Challenge draft not found.");
    const latestChallenge = { id: latestChallengeSnap.id, ...latestChallengeSnap.data() } as Record<string, unknown>;
    const enterpriseOwned = isEnterpriseFinanceResource(latestChallenge);
    if (enterpriseOwned) {
      const [account, profile] = await Promise.all([
        transaction.get(db.collection("users").doc(input.userId)),
        transaction.get(db.collection("profiles").doc(input.userId)),
      ]);
      const access = normalizeEnterpriseAccess({ ...(profile.data() ?? {}), ...(account.data() ?? {}) });
      if (!access?.organizationId || !hasEnterprisePermission(access, "challenge.edit") || !enterpriseChallengeInScope(access, latestChallenge, input.userId, true)) {
        throw new ChallengeReviewTransitionError("PERMISSION_DENIED", "Your Enterprise access does not allow this review submission.");
      }
      const organization = await transaction.get(db.collection("enterpriseOrganizations").doc(access.organizationId));
      if (!organization.exists || organization.data()?.status !== "active") {
        throw new ChallengeReviewTransitionError("PERMISSION_DENIED", "This Enterprise organization is not active.");
      }
    } else if (!userOwnsChallenge(latestChallenge, input.userId)) {
      throw new ChallengeReviewTransitionError("PERMISSION_DENIED", "You can only submit your own challenge for review.");
    }
    const latestStatus = String(latestChallenge.status ?? latestChallenge.lifecycleStatus ?? "draft").toLowerCase();
    if (latestChallenge.publicationPolicyVersion === 1 && latestChallenge.publishedAt) return { idempotent: true, challenge: latestChallenge };
    if (latestStatus !== input.expectedStatus) throw new ChallengeReviewTransitionError("CHALLENGE_STATE_CHANGED", "This challenge changed while it was being submitted. Please refresh and try again.");
    if (input.expectedUpdatedAt !== undefined && latestChallenge.updatedAt !== input.expectedUpdatedAt) {
      throw new ChallengeReviewTransitionError("CHALLENGE_STATE_CHANGED", "This draft or its funding changed. Refresh before submitting again.");
    }
    const safety = await readPublicationSafety(db, transaction, input.userId, latestChallenge);
    if (safety) return { idempotent: false, challenge: { ...latestChallenge, ...recordPublicationHold(db, transaction, input.challengeId, "challenges", input.userId, safety, String(input.update.updatedAt)) } };
    const fundingEvidence = await requireConfirmedPublicationFunding(db, transaction, input.challengeId, latestChallenge, input.update);
    if (!enterpriseOwned) {
      const [account, profile, owned] = await Promise.all([
        transaction.get(db.collection("users").doc(input.userId)),
        transaction.get(db.collection("profiles").doc(input.userId)),
        transaction.get(db.collection("challenges").where("creatorId", "==", input.userId)),
      ]);
      const latestProfile = { ...profile.data(), ...account.data() }, plan = getUserPlanAccess(latestProfile), limits = getPlanExperience(latestProfile);
      const entitlement = canCreateChallenge(latestProfile, { ...input.update, creatorPrizeFundingConfirmed: fundingEvidence.confirmed >= fundingEvidence.required }, 0);
      if (!entitlement.allowed) throw new ChallengeReviewTransitionError("PERMISSION_DENIED", entitlement.message);
      const others = owned.docs.filter(document => document.id !== input.challengeId);
      if (plan.normalizedPlanId === "free" && freeBasicUsage(others) >= FREE_BASIC_CHALLENGE_LIFETIME_LIMIT) throw new ChallengeReviewTransitionError("CHALLENGE_STATE_CHANGED", freeBasicLimitMessage(freeBasicUsage(others)));
      const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
      const monthly = others.filter(document => { const data = document.data(); return !["draft", "cancelled"].includes(String(data.status)) && Date.parse(String(data.createdAt)) >= monthStart.getTime(); }).length;
      if (plan.normalizedPlanId !== "free" && limits.monthlyChallengeLimit !== null && monthly >= limits.monthlyChallengeLimit) throw new ChallengeReviewTransitionError("CHALLENGE_STATE_CHANGED", "Your monthly challenge publication allowance is fully used.");
      const privateMonthly = others.filter(document => { const data = document.data(); return data.visibility === "private" && !["draft", "cancelled"].includes(String(data.status)) && Date.parse(String(data.createdAt)) >= monthStart.getTime(); }).length;
      if (input.update.visibility === "private" && limits.monthlyPrivateChallengeLimit !== null && privateMonthly >= limits.monthlyPrivateChallengeLimit) throw new ChallengeReviewTransitionError("CHALLENGE_STATE_CHANGED", "Your monthly Private Challenge publication allowance is fully used.");
    }
    if (latestChallenge.privateAccessPolicyVersion === 2) {
      const vault = await transaction.get(db.collection("privateCredentialVault").doc(input.challengeId));
      if (!vault.exists || vault.data()?.inviteId !== latestChallenge.privateCredentialId || vault.data()?.method !== input.update.privateAccessMethod || input.update.privateAccessPolicyVersion !== 2 || (latestChallenge.publishedAt && latestChallenge.privateAccessMethod !== input.update.privateAccessMethod)) throw new ChallengeReviewTransitionError("CHALLENGE_STATE_CHANGED", "Private access settings changed. Refresh the draft before submitting.");
    }
    if (latestChallenge.builderVersion === "normal_v3") {
      if (!enterpriseOwned && (input.update.freeBasicChallenge ?? latestChallenge.freeBasicChallenge) === true) {
        const owned = await transaction.get(db.collection("challenges").where("creatorId", "==", input.userId));
        const used = freeBasicUsage(owned.docs.filter(document => document.id !== input.challengeId));
        if (used >= FREE_BASIC_CHALLENGE_LIFETIME_LIMIT) throw new ChallengeReviewTransitionError("CHALLENGE_STATE_CHANGED", `${freeBasicLimitMessage(used)}. Your Free Basic creation entitlement is fully used.`);
      }
      const required = normalBasePrizeCents(input.update.prizeValue ?? latestChallenge.prizeValue);
      if (required === null) throw new ChallengeReviewTransitionError("CHALLENGE_STATE_CHANGED", "Choose no Base Prize or a Base Prize of at least $5 USD.");
      const funding = await transaction.get(db.collection("creatorPrizeFundingPayments").where("challengeId", "==", input.challengeId));
      const ownerId = String(latestChallenge.creatorId ?? latestChallenge.ownerId ?? latestChallenge.hostId ?? "");
      const organizationId = String(latestChallenge.organizationOwnerId ?? "");
      const confirmed = funding.docs.reduce((total, document) => {
        const payment = document.data();
        const owned = enterpriseOwned ? Boolean(organizationId) && payment.organizationOwnerId === organizationId : payment.userId === ownerId && !payment.organizationOwnerId;
        const amount = Number(payment.amountCents);
        return owned && payment.paymentPurpose === "prize_pool_funding" && payment.status === "confirmed"
          && payment.webhookConfirmed === true && payment.settlementRestricted !== true && payment.refundLiabilityStatus !== "pending" && String(payment.currency).toUpperCase() === "USD"
          && Number.isSafeInteger(amount) && amount > 0 ? total + amount : total;
      }, 0);
      if ((confirmed > 0 || latestChallenge.creatorPrizeGuaranteeLockedAt) && Number(input.update.prizeValue ?? latestChallenge.prizeValue) !== Number(latestChallenge.prizeValue)) {
        throw new ChallengeReviewTransitionError("CHALLENGE_STATE_CHANGED", "A confirmed Base Prize cannot be changed through publication.");
      }
      if (confirmed < required) throw new ChallengeReviewTransitionError("CHALLENGE_STATE_CHANGED", "Confirm the full creator-funded Base Prize before publishing.");
    }

    const enterpriseSlot = await prepareEnterpriseActiveChallengeSlot(
      db,
      transaction,
      latestChallenge.officialChallenge === true || latestChallenge.ownershipType === "challenge_suite_official" || Boolean(latestChallenge.organizationOwnerId)
        ? String(latestChallenge.organizationOwnerId ?? "") || null
        : null,
      input.challengeId,
    );
    await prepareEnterprisePrizeValueUpdate(db, transaction, {
      challengeId: input.challengeId,
      challenge: latestChallenge,
      nextPrizeValue: input.update.prizeValue ?? latestChallenge.prizeValue ?? 0,
      now: String(input.update.updatedAt ?? new Date().toISOString()),
    });

    const prizePool = mergeChallengePrizePoolFoundation(prizePoolSnap.exists ? prizePoolSnap.data() ?? {} : {}, { challengeId: input.challengeId, ...input.prizePool });
    assertNoUndefinedFirestoreValues(prizePool, "prizePool");
    const reviewUpdate = { ...input.update, ...(latestChallenge.builderVersion === "normal_v3" && !enterpriseOwned && input.update.freeBasicChallenge === true ? { reviewCreatorPlanId: "free" } : {}) };
    transaction.set(challengeRef, reviewUpdate, { merge: true });
    if (input.mediaVerification) transaction.set(db.collection("challengeMediaVerifications").doc(input.challengeId), input.mediaVerification);
    transaction.set(db.collection("notifications").doc(`published_${input.revision.id}`), { userId: input.userId, type: "challenge_published", title: "Challenge published", body: "Your challenge is published. Operational availability is shown on its public page.", targetId: input.challengeId, actionUrl: `${latestChallenge.isLiveEvent ? "/live-events" : "/challenges"}/${encodeURIComponent(input.challengeId)}`, read: false, delivery: { inApp: true, email: false }, createdAt: input.update.updatedAt ?? new Date().toISOString() });
    enterpriseSlot.apply();
    transaction.set(revisionRef, input.revision, { merge: true });
    const ownership = resolveEnterpriseFinancialOwnership(latestChallenge);
    transaction.set(revenueRef, {
      ...input.revenue,
      ...ownership,
      creatorId: enterpriseOwned ? null : String(latestChallenge.creatorId ?? latestChallenge.hostId ?? input.userId),
      financialOwnerId: enterpriseOwned ? ownership.organizationOwnerId : String(latestChallenge.creatorId ?? latestChallenge.hostId ?? input.userId),
      initiatedByUserId: input.userId,
    }, { merge: true });
    transaction.set(prizePoolRef, prizePool, { merge: true });
    transaction.set(submitAuditRef, input.submitAudit, { merge: true });
    transaction.set(revisionAuditRef, input.revisionAudit, { merge: true });
    if (input.update.isLiveEvent) {
      transaction.set(db.collection("liveEvents").doc(input.challengeId), { ...latestChallenge, ...reviewUpdate, id: input.challengeId, challengeId: input.challengeId }, { merge: true });
      if ((input.update.hostOperations as Record<string, unknown> | undefined)?.schemaVersion === 2) seedLiveEventJobs(db, transaction, input.challengeId, reviewUpdate);
    }
    if (input.update.normalLifecyclePolicyVersion === 1) wakeNormalLifecycleJob(db, transaction, input.challengeId, String(input.update.updatedAt));
    return { idempotent: false, challenge: reviewUpdate };
  });
}
