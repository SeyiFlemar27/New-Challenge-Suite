import type { Firestore } from "firebase-admin/firestore";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { assertNoUndefinedFirestoreValues } from "@/lib/server/firestore-payload";
import { mergeChallengePrizePoolFoundation } from "@/lib/server/prize-pools";
import { prepareEnterpriseActiveChallengeSlot } from "@/lib/server/enterprise-active-challenge-limit";
import { isEnterpriseFinanceResource, prepareEnterprisePrizeValueUpdate, resolveEnterpriseFinancialOwnership } from "@/lib/server/enterprise-prize-exposure";
import { enterpriseChallengeInScope, hasEnterprisePermission, normalizeEnterpriseAccess } from "@/lib/enterprise-access";

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
  update: Record<string, unknown>;
  revision: Record<string, unknown> & { id: string };
  revenue: Record<string, unknown>;
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
  for (const [name, payload] of Object.entries({ update: input.update, revision: input.revision, revenue: input.revenue, submitAudit: input.submitAudit, revisionAudit: input.revisionAudit })) {
    assertNoUndefinedFirestoreValues(payload, name);
  }

  const challengeRef = db.collection("challenges").doc(input.challengeId);
  const revisionRef = db.collection("challengeReviewRevisions").doc(input.revision.id);
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
    if (latestStatus === "pending_review") return { idempotent: true, challenge: latestChallenge };
    if (latestStatus !== input.expectedStatus) throw new ChallengeReviewTransitionError("CHALLENGE_STATE_CHANGED", "This challenge changed while it was being submitted. Please refresh and try again.");

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
    transaction.set(challengeRef, input.update, { merge: true });
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
    return { idempotent: false, challenge: input.update };
  });
}
