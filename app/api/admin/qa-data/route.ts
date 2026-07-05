import { getAdminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/server/audit";
import { requireAdminUser } from "@/lib/server/auth";
import { ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

const QA_COLLECTIONS = [
  "qaSeedBatches",
  "sponsorProfiles",
  "users",
  "profiles",
  "challenges",
  "submissions",
  "challengeParticipants",
  "winners",
  "withdrawalRequests",
  "cashWallets",
  "cashLedger",
  "disputes",
  "auditLogs"
] as const;

type QaCollection = (typeof QA_COLLECTIONS)[number];

function qaFields(batchId: string, adminId: string, createdAt: string) {
  return {
    isQaSeed: true,
    qaSeedBatchId: batchId,
    createdFor: "admin_qa",
    createdAt,
    createdByAdminId: adminId
  };
}

async function loadBatches(db: FirebaseFirestore.Firestore) {
  const snapshot = await db.collection("qaSeedBatches").where("isQaSeed", "==", true).limit(25).get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string; createdAt?: string }))
    .sort((a, b) => Date.parse(String(b.createdAt ?? "")) - Date.parse(String(a.createdAt ?? "")));
}

export async function GET(request: Request) {
  const { response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin QA data");

  try {
    return ok({ batches: await loadBatches(db) }, "QA seed batches loaded.");
  } catch (error) {
    return serverError("QA seed batches could not be loaded.", error instanceof Error ? error.message : error);
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin QA data");

  const now = new Date().toISOString();
  const batchId = `qa_${Date.now()}_${user.uid.slice(0, 8)}`;
  const ids = {
    sponsor: `${batchId}_sponsor`,
    host: `${batchId}_host`,
    pendingChallenge: `${batchId}_challenge_pending`,
    flaggedChallenge: `${batchId}_challenge_flagged`,
    completedChallenge: `${batchId}_challenge_completed`,
    pendingSubmission: `${batchId}_submission_pending`,
    flaggedSubmission: `${batchId}_submission_flagged`,
    participant: `${batchId}_participant`,
    winner: `${batchId}_winner`,
    withdrawal: `${batchId}_withdrawal`,
    withdrawalUser: `${batchId}_withdrawal_user`,
    dispute: `${batchId}_dispute`
  };
  const tag = qaFields(batchId, user.uid, now);
  const counts: Record<string, number> = {
    sponsorProfiles: 1,
    users: 3,
    profiles: 2,
    challenges: 3,
    submissions: 2,
    challengeParticipants: 1,
    winners: 1,
    withdrawalRequests: 1,
    cashWallets: 1,
    cashLedger: 1,
    disputes: 1,
    auditLogs: 1
  };

  try {
    const batch = db.batch();
    batch.set(db.collection("qaSeedBatches").doc(batchId), {
      ...tag,
      id: batchId,
      status: "active",
      counts,
      recordCount: Object.values(counts).reduce((sum, count) => sum + count, 0)
    });
    batch.set(db.collection("sponsorProfiles").doc(ids.sponsor), {
      ...tag,
      id: ids.sponsor,
      brandName: "QA Sponsor Brand",
      contactPerson: "QA Brand Reviewer",
      contactEmail: "qa-sponsor@example.test",
      website: "https://example.test/qa-sponsor",
      industry: "QA Test",
      sponsorVerificationStatus: "pending_review",
      status: "pending_review",
      subscriptionStatus: "inactive_test",
      riskFlags: ["qa_test_record"],
      updatedAt: now
    });
    batch.set(db.collection("users").doc(ids.sponsor), {
      ...tag,
      uid: ids.sponsor,
      displayName: "QA Sponsor Brand",
      email: "qa-sponsor@example.test",
      accountType: "sponsor",
      role: "sponsor",
      sponsorVerificationStatus: "pending_review",
      subscriptionStatus: "inactive_test",
      updatedAt: now
    });
    batch.set(db.collection("profiles").doc(ids.sponsor), {
      ...tag,
      uid: ids.sponsor,
      displayName: "QA Sponsor Brand",
      accountType: "sponsor",
      sponsorVerificationStatus: "pending_review",
      updatedAt: now
    });
    batch.set(db.collection("users").doc(ids.host), {
      ...tag,
      uid: ids.host,
      displayName: "QA Host Workspace",
      email: "qa-host@example.test",
      accountType: "host",
      role: "host",
      planId: "free",
      subscriptionStatus: "inactive_test",
      hostVerificationStatus: "pending_review",
      organizationName: "QA Host Workspace",
      hostType: "QA Test Event",
      competitionSize: "Under 50",
      location: "QA Test",
      riskFlags: ["qa_test_record"],
      updatedAt: now
    });
    batch.set(db.collection("profiles").doc(ids.host), {
      ...tag,
      uid: ids.host,
      displayName: "QA Host Workspace",
      accountType: "host",
      hostVerificationStatus: "pending_review",
      updatedAt: now
    });
    batch.set(db.collection("challenges").doc(ids.pendingChallenge), {
      ...tag,
      id: ids.pendingChallenge,
      title: "QA Pending Challenge",
      creatorId: ids.host,
      creatorName: "QA Host Workspace",
      status: "pending_review",
      visibility: "public",
      category: "QA Test",
      prizeType: "none",
      sponsorReady: false,
      submissionCount: 1,
      voteCount: 0,
      moneyMovementEnabled: false,
      updatedAt: now
    });
    batch.set(db.collection("challenges").doc(ids.flaggedChallenge), {
      ...tag,
      id: ids.flaggedChallenge,
      title: "QA Flagged Challenge",
      creatorId: ids.host,
      creatorName: "QA Host Workspace",
      status: "flagged",
      visibility: "public",
      category: "QA Test",
      riskFlags: ["qa_flagged_content"],
      prizeType: "none",
      moneyMovementEnabled: false,
      updatedAt: now
    });
    batch.set(db.collection("challenges").doc(ids.completedChallenge), {
      ...tag,
      id: ids.completedChallenge,
      title: "QA Completed Challenge",
      creatorId: ids.host,
      creatorName: "QA Host Workspace",
      status: "published",
      visibility: "public",
      category: "QA Test",
      competitionStatus: "completed",
      prizeType: "none",
      moneyMovementEnabled: false,
      updatedAt: now
    });
    batch.set(db.collection("submissions").doc(ids.pendingSubmission), {
      ...tag,
      id: ids.pendingSubmission,
      title: "QA Pending Submission",
      challengeId: ids.pendingChallenge,
      challengeTitle: "QA Pending Challenge",
      userId: ids.withdrawalUser,
      participantName: "QA Participant",
      submissionType: "text",
      status: "pending_review",
      riskFlags: [],
      updatedAt: now
    });
    batch.set(db.collection("submissions").doc(ids.flaggedSubmission), {
      ...tag,
      id: ids.flaggedSubmission,
      title: "QA Flagged Submission",
      challengeId: ids.flaggedChallenge,
      challengeTitle: "QA Flagged Challenge",
      userId: ids.withdrawalUser,
      participantName: "QA Participant",
      submissionType: "text",
      status: "flagged",
      riskFlags: ["qa_test_flag"],
      flagReason: "qa_test_flag",
      updatedAt: now
    });
    batch.set(db.collection("challengeParticipants").doc(ids.participant), {
      ...tag,
      id: ids.participant,
      challengeId: ids.pendingChallenge,
      userId: ids.withdrawalUser,
      displayName: "QA Participant",
      email: "qa-participant@example.test",
      status: "pending",
      submissionStatus: "pending_review",
      votes: 0,
      joinedAt: now,
      riskFlags: ["qa_test_record"],
      updatedAt: now
    });
    batch.set(db.collection("winners").doc(ids.winner), {
      ...tag,
      id: ids.winner,
      challengeId: ids.completedChallenge,
      challengeTitle: "QA Completed Challenge",
      userId: ids.withdrawalUser,
      displayName: "QA Participant",
      voteCount: 12,
      hostConfirmationStatus: "confirmed",
      adminReviewStatus: "pending_admin_review",
      status: "pending_admin_review",
      payoutExecuted: false,
      prizeReleased: false,
      updatedAt: now
    });
    batch.set(db.collection("users").doc(ids.withdrawalUser), {
      ...tag,
      uid: ids.withdrawalUser,
      displayName: "QA Participant",
      email: "qa-participant@example.test",
      accountType: "user",
      role: "user",
      planId: "free",
      subscriptionStatus: "none",
      updatedAt: now
    });
    batch.set(db.collection("cashWallets").doc(ids.withdrawalUser), {
      ...tag,
      id: ids.withdrawalUser,
      userId: ids.withdrawalUser,
      currency: "USD",
      pendingBalanceCents: 0,
      availableBalanceCents: 0,
      underReviewBalanceCents: 2500,
      lockedBalanceCents: 2500,
      withdrawnBalanceCents: 0,
      failedWithdrawalBalanceCents: 0,
      withdrawalsEnabled: false,
      providerConnected: false,
      updatedAt: now
    });
    batch.set(db.collection("withdrawalRequests").doc(ids.withdrawal), {
      ...tag,
      id: ids.withdrawal,
      userId: ids.withdrawalUser,
      amountCents: 2500,
      currency: "USD",
      sourceType: "qa_verified_prize_foundation",
      sourceIds: [ids.completedChallenge],
      payoutMethodType: "manual",
      payoutMethodLabel: "QA Bank •••• 0000",
      payoutMethodLast4: "0000",
      status: "pending_review",
      adminReviewStatus: "pending_review",
      kycStatus: "not_started",
      riskStatus: "qa_review",
      providerStatus: "not_configured",
      providerConnected: false,
      transferEnabled: false,
      payoutExecuted: false,
      updatedAt: now
    });
    batch.set(db.collection("cashLedger").doc(`${ids.withdrawal}_requested`), {
      ...tag,
      ledgerId: `${ids.withdrawal}_requested`,
      userId: ids.withdrawalUser,
      type: "withdrawal_requested",
      sourceType: "withdrawal",
      sourceId: ids.withdrawal,
      amountCents: 2500,
      currency: "USD",
      direction: "debit_lock",
      balanceBeforeCents: 2500,
      balanceAfterCents: 0,
      status: "recorded",
      providerConnected: false,
      transferEnabled: false,
      metadata: { reviewOnly: true, qaSeedBatchId: batchId }
    });
    batch.set(db.collection("disputes").doc(ids.dispute), {
      ...tag,
      id: ids.dispute,
      type: "challenge_dispute",
      targetType: "challenge",
      targetId: ids.flaggedChallenge,
      userId: ids.withdrawalUser,
      status: "open",
      reason: "QA workflow verification only.",
      updatedAt: now
    });
    const auditRef = db.collection("auditLogs").doc();
    batch.set(auditRef, {
      ...tag,
      id: auditRef.id,
      actorId: user.uid,
      actorType: "admin",
      action: "qa_seed_created",
      targetType: "qa_seed_batch",
      targetId: batchId,
      reason: "Admin created an isolated QA data batch.",
      before: null,
      after: { status: "active" },
      metadata: { recordCounts: counts, moneyMovementEnabled: false }
    });

    await batch.commit();
    return ok({ batchId, counts }, "QA seed records created. No money movement, KYC, provider call, or payout occurred.");
  } catch (error) {
    return serverError("QA seed records could not be created.", error instanceof Error ? error.message : error);
  }
}

export async function DELETE(request: Request) {
  const { user, response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin QA data");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const batchId = String(parsed.body?.batchId ?? "").trim();
  if (!batchId.startsWith("qa_")) {
    return validationError({ batchId: "Select a valid QA seed batch." });
  }

  try {
    const matches: Array<{ collection: QaCollection; ref: FirebaseFirestore.DocumentReference }> = [];
    for (const collection of QA_COLLECTIONS) {
      const snapshot = await db.collection(collection).where("qaSeedBatchId", "==", batchId).get();
      for (const doc of snapshot.docs) {
        if (doc.data().isQaSeed === true) matches.push({ collection, ref: doc.ref });
      }
    }

    for (let offset = 0; offset < matches.length; offset += 400) {
      const writeBatch = db.batch();
      for (const item of matches.slice(offset, offset + 400)) writeBatch.delete(item.ref);
      await writeBatch.commit();
    }

    const deletedByCollection = matches.reduce<Record<string, number>>((counts, item) => {
      counts[item.collection] = (counts[item.collection] ?? 0) + 1;
      return counts;
    }, {});
    await writeAuditLog({
      actorId: user.uid,
      actorType: "admin",
      action: "qa_seed_deleted",
      targetType: "qa_seed_batch",
      targetId: batchId,
      reason: "Admin deleted records explicitly tagged for this QA seed batch.",
      before: { status: "active" },
      after: { status: "deleted" },
      metadata: { deletedByCollection, deletedCount: matches.length }
    }, db);

    return ok({ batchId, deletedCount: matches.length, deletedByCollection }, "QA seed batch deleted. Non-QA records were not touched.");
  } catch (error) {
    return serverError("QA seed batch could not be deleted.", error instanceof Error ? error.message : error);
  }
}
