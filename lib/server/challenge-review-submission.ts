import type { Firestore } from "firebase-admin/firestore";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { assertNoUndefinedFirestoreValues } from "@/lib/server/firestore-payload";
import { mergeChallengePrizePoolFoundation } from "@/lib/server/prize-pools";

export class ChallengeReviewTransitionError extends Error {
  constructor(readonly code: "CHALLENGE_NOT_FOUND" | "PERMISSION_DENIED" | "CHALLENGE_STATE_CHANGED", message: string) {
    super(message);
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
    if (!userOwnsChallenge(latestChallenge, input.userId)) throw new ChallengeReviewTransitionError("PERMISSION_DENIED", "You can only submit your own challenge for review.");
    const latestStatus = String(latestChallenge.status ?? latestChallenge.lifecycleStatus ?? "draft").toLowerCase();
    if (latestStatus === "pending_review") return { idempotent: true, challenge: latestChallenge };
    if (latestStatus !== input.expectedStatus) throw new ChallengeReviewTransitionError("CHALLENGE_STATE_CHANGED", "This challenge changed while it was being submitted. Please refresh and try again.");

    const prizePool = mergeChallengePrizePoolFoundation(prizePoolSnap.exists ? prizePoolSnap.data() ?? {} : {}, { challengeId: input.challengeId, ...input.prizePool });
    assertNoUndefinedFirestoreValues(prizePool, "prizePool");
    transaction.set(challengeRef, input.update, { merge: true });
    transaction.set(revisionRef, input.revision, { merge: true });
    transaction.set(revenueRef, input.revenue, { merge: true });
    transaction.set(prizePoolRef, prizePool, { merge: true });
    transaction.set(submitAuditRef, input.submitAudit, { merge: true });
    transaction.set(revisionAuditRef, input.revisionAudit, { merge: true });
    return { idempotent: false, challenge: input.update };
  });
}
