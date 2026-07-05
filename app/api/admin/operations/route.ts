import { getAdminDb } from "@/lib/firebase/admin";
import { getEffectiveTier } from "@/lib/plan-access";
import { writeAuditLog } from "@/lib/server/audit";
import { requireAdminUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

type RecordData = Record<string, unknown> & { id: string };

function records(snapshot: FirebaseFirestore.QuerySnapshot) {
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as RecordData));
}

function safeUser(record: RecordData) {
  const tier = getEffectiveTier(record);
  return {
    id: record.id,
    displayName: record.displayName ?? record.name ?? "",
    email: record.email ?? "",
    accountType: record.accountType ?? record.role ?? "user",
    effectiveTier: tier.displayName,
    planId: record.planId ?? record.subscriptionPlan ?? "free",
    subscriptionStatus: record.subscriptionStatus ?? record.planStatus ?? "none",
    sponsorStatus: record.sponsorVerificationStatus ?? "not_submitted",
    hostStatus: record.hostVerificationStatus ?? "not_submitted",
    suspended: Boolean(record.suspended),
    createdAt: record.createdAt ?? null,
    lastActivityAt: record.lastActivityAt ?? record.updatedAt ?? null
  };
}

export async function GET(request: Request) {
  const { response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin operations");
  try {
    const snapshots = await Promise.all([
      db.collection("sponsorProfiles").limit(150).get(),
      db.collection("users").limit(250).get(),
      db.collection("challenges").limit(200).get(),
      db.collection("submissions").limit(250).get(),
      db.collection("challengeParticipants").limit(250).get(),
      db.collection("winners").limit(150).get(),
      db.collection("withdrawalRequests").limit(150).get(),
      db.collection("auditLogs").limit(200).get(),
      db.collection("disputes").limit(100).get(),
      db.collection("prizePools").limit(150).get(),
      db.collection("adminNotes").limit(250).get()
    ]);
    const [sponsorSnap, userSnap, challengeSnap, submissionSnap, participantSnap, winnerSnap, withdrawalSnap, auditSnap, disputeSnap, prizePoolSnap, adminNoteSnap] = snapshots;
    const notes = new Map(records(adminNoteSnap).map((item) => [`${item.targetType}_${item.targetId}`, item]));
    const users = records(userSnap);
    const hosts = users.filter((item) => item.accountType === "host" || item.role === "host" || item.planId === "host");
    const sponsors = records(sponsorSnap).map((item) => ({
      id: item.id,
      brandName: item.brandName ?? item.displayName ?? "Sponsor",
      industry: item.industry ?? "",
      website: item.website ?? "",
      contactEmail: item.contactEmail ?? "",
      status: item.sponsorVerificationStatus ?? "not_submitted",
      subscriptionStatus: item.subscriptionStatus ?? "none",
      adminNote: notes.get(`sponsor_${item.id}`)?.note ?? null,
      updatedAt: item.updatedAt ?? null
    }));
    const challenges = records(challengeSnap).map((item) => ({
      id: item.id,
      title: item.title ?? "Challenge",
      creatorId: item.creatorId ?? null,
      creatorName: item.creatorName ?? "",
      category: item.category ?? "",
      visibility: item.visibility ?? item.visibilityMode ?? "public",
      status: item.status ?? "draft",
      prizeType: item.prizeType ?? "none",
      sponsorReady: Boolean(item.sponsorEnabled || item.sponsorReady),
      votingStartsAt: item.votingStartsAt ?? null,
      votingEndsAt: item.votingEndsAt ?? null,
      entryDeadline: item.entryDeadline ?? null,
      riskFlags: item.riskFlags ?? [],
      adminNote: notes.get(`challenge_${item.id}`)?.note ?? null
    }));
    const submissions = records(submissionSnap).map((item) => ({
      id: item.id,
      challengeId: item.challengeId ?? null,
      userId: item.userId ?? null,
      title: item.title ?? "Submission",
      mediaUrl: item.mediaUrl ?? item.imageUrl ?? null,
      status: item.status ?? "pending_review",
      internalNote: notes.get(`submission_${item.id}`)?.note ?? null,
      createdAt: item.createdAt ?? null
    }));
    const participants = records(participantSnap).map((item) => ({
      id: item.id,
      challengeId: item.challengeId ?? null,
      userId: item.userId ?? null,
      displayName: item.displayName ?? item.username ?? "Participant",
      status: item.status ?? "pending",
      submissionStatus: item.submissionStatus ?? "not_submitted",
      joinedAt: item.joinedAt ?? item.createdAt ?? null,
      adminNote: notes.get(`participant_${item.id}`)?.note ?? null
    }));
    const winners = records(winnerSnap).map((item) => ({
      id: item.id,
      challengeId: item.challengeId ?? null,
      challengeTitle: item.challengeTitle ?? "Challenge",
      userId: item.userId ?? item.winnerId ?? null,
      displayName: item.displayName ?? item.winnerName ?? "Winner",
      voteCount: Number(item.voteCount ?? item.votes ?? 0),
      hostConfirmationStatus: item.hostConfirmationStatus ?? "pending",
      status: item.adminReviewStatus ?? item.status ?? "pending_admin_review",
      flagWarnings: item.flagWarnings ?? [],
      disqualificationNotes: item.disqualificationNotes ?? null
    }));
    const withdrawals = records(withdrawalSnap).map((item) => ({
      id: item.id,
      userId: item.userId ?? null,
      amountCents: Number(item.amountCents ?? 0),
      currency: item.currency ?? "USD",
      sourceType: item.sourceType ?? "eligible_earnings",
      payoutMethodLabel: item.payoutMethodLabel ?? "Masked payout method",
      status: item.status ?? "pending_review",
      kycStatus: item.kycStatus ?? "not_started",
      riskStatus: item.riskStatus ?? "pending_review",
      createdAt: item.createdAt ?? null,
      transferEnabled: false,
      payoutExecuted: false
    }));
    const auditLogs = records(auditSnap)
      .map((item) => ({ id: item.id, actorId: item.actorId ?? "", action: item.action ?? "", targetType: item.targetType ?? "", targetId: item.targetId ?? "", reason: item.reason ?? null, createdAt: item.createdAt ?? null }))
      .sort((a, b) => Date.parse(String(b.createdAt ?? "")) - Date.parse(String(a.createdAt ?? "")));
    const pending = (list: Array<{ status?: unknown }>, statuses: string[]) => list.filter((item) => statuses.includes(String(item.status))).length;
    return ok({
      overview: {
        pendingSponsorReviews: pending(sponsors, ["pending_review", "submitted"]),
        pendingHostVerifications: hosts.filter((item) => ["pending_review", "submitted"].includes(String(item.hostVerificationStatus))).length,
        pendingChallengeReviews: pending(challenges, ["pending_review", "flagged"]),
        pendingSubmissions: pending(submissions, ["pending_review"]),
        flaggedSubmissions: pending(submissions, ["flagged"]),
        participantApprovals: pending(participants, ["pending"]),
        winnerConfirmations: pending(winners, ["pending_admin_review", "pending_host_confirmation"]),
        openDisputes: disputeSnap.docs.filter((doc) => !["resolved", "closed"].includes(String(doc.data().status))).length,
        revenueReviewItems: prizePoolSnap.docs.filter((doc) => ["pending_review", "under_review", "payout_review"].includes(String(doc.data().payoutReviewStatus ?? doc.data().status))).length,
        recentAuditEvents: auditLogs.slice(0, 8),
        safety: { automaticPayouts: false, withdrawals: "review_only", sponsorRelease: false, prizePoolRelease: false, kycProcessing: false }
      },
      sponsors,
      hosts: hosts.map(safeUser),
      challenges,
      submissions,
      participants,
      winners,
      withdrawals,
      reports: {
        challengeCount: challenges.length,
        submissionCount: submissions.length,
        participantCount: participants.length,
        sponsorInterestCount: sponsors.length,
        winnerCount: winners.length,
        exportsEnabled: false
      },
      users: users.map(safeUser),
      auditLogs,
      settings: {
        adminRoles: "Firebase custom claim, users.isAdmin, or server-only allowlist",
        reviewRulesConfigured: true,
        payoutProvider: "manual_review",
        automaticMoneyMovement: false
      }
    }, "Admin command data loaded.");
  } catch (error) {
    return serverError("Admin operations could not be loaded.", error instanceof Error ? error.message : error);
  }
}

const allowedActions: Record<string, Set<string>> = {
  sponsor: new Set(["approve", "reject", "request_changes", "suspend"]),
  host: new Set(["verify", "reject", "request_changes", "suspend"]),
  challenge: new Set(["approve", "reject", "flag", "archive", "suspend"]),
  submission: new Set(["approve", "reject", "request_changes", "flag"]),
  participant: new Set(["approve", "reject", "disqualify", "reinstate", "flag"]),
  winner: new Set(["approve", "hold", "request_review", "flag"]),
  withdrawal: new Set(["approve", "reject", "request_info"])
};

const reasonRequired = new Set(["reject", "request_changes", "suspend", "flag", "disqualify", "hold", "request_review", "request_info"]);

function nextStatus(type: string, action: string) {
  const statuses: Record<string, Record<string, string>> = {
    sponsor: { approve: "approved", reject: "rejected", request_changes: "needs_changes", suspend: "suspended" },
    host: { verify: "verified", reject: "rejected", request_changes: "needs_changes", suspend: "suspended" },
    challenge: { approve: "published", reject: "rejected", flag: "flagged", archive: "archived", suspend: "suspended" },
    submission: { approve: "approved", reject: "rejected", request_changes: "resubmission_requested", flag: "flagged" },
    participant: { approve: "approved", reject: "rejected", disqualify: "disqualified", reinstate: "approved", flag: "flagged" },
    winner: { approve: "approved", hold: "held", request_review: "pending_admin_review", flag: "flagged" },
    withdrawal: { approve: "approved", reject: "rejected", request_info: "needs_kyc" }
  };
  return statuses[type]?.[action];
}

export async function PATCH(request: Request) {
  const { user, response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin operations");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const type = String(parsed.body?.type ?? "");
  const id = String(parsed.body?.id ?? "");
  const action = String(parsed.body?.action ?? "");
  const reason = String(parsed.body?.reason ?? "").trim().slice(0, 500);
  const note = String(parsed.body?.note ?? "").trim().slice(0, 1000);
  if (!allowedActions[type]?.has(action)) return validationError({ action: "Select a valid admin action." });
  if (!id) return validationError({ id: "Target ID is required." });
  if (reasonRequired.has(action) && !reason) return validationError({ reason: "A reason is required for this action." });
  const status = nextStatus(type, action);
  const now = new Date().toISOString();

  try {
    let previousStatus = "unknown";
    if (type === "host") {
      const userRef = db.collection("users").doc(id);
      const profileRef = db.collection("profiles").doc(id);
      const snap = await userRef.get();
      if (!snap.exists) return fail("Host account not found.", 404, undefined, "NOT_FOUND");
      previousStatus = String(snap.data()?.hostVerificationStatus ?? "not_submitted");
      const update = { hostVerificationStatus: status, hostVerifiedAt: action === "verify" ? now : null, updatedAt: now };
      await Promise.all([userRef.set(update, { merge: true }), profileRef.set(update, { merge: true })]);
    } else if (type === "withdrawal") {
      const ref = db.collection("withdrawalRequests").doc(id);
      await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists) throw new Error("NOT_FOUND");
        const record = snap.data() ?? {};
        previousStatus = String(record.status ?? "pending_review");
        if (!["pending_review", "needs_kyc"].includes(previousStatus)) throw new Error("INVALID_STATE");
        if (action === "approve" && record.kycStatus !== "verified") throw new Error("KYC_REQUIRED");
        transaction.set(ref, {
          status,
          adminReviewStatus: status,
          reason: reason || null,
          approvedAt: action === "approve" ? now : null,
          transferEnabled: false,
          payoutExecuted: false,
          updatedAt: now
        }, { merge: true });
        if (action === "reject") {
          const walletRef = db.collection("cashWallets").doc(String(record.userId));
          const walletSnap = await transaction.get(walletRef);
          const wallet = walletSnap.data() ?? {};
          const amount = Number(record.amountCents ?? 0);
          const available = Number(wallet.availableBalanceCents ?? 0);
          const underReview = Math.max(0, Number(wallet.underReviewBalanceCents ?? wallet.lockedBalanceCents ?? 0) - amount);
          transaction.set(walletRef, { availableBalanceCents: available + amount, underReviewBalanceCents: underReview, lockedBalanceCents: underReview, updatedAt: now }, { merge: true });
          transaction.create(db.collection("cashLedger").doc(`${id}_rejected`), {
            ledgerId: `${id}_rejected`, userId: record.userId, type: "withdrawal_reversed", sourceType: "withdrawal", sourceId: id,
            amountCents: amount, currency: record.currency ?? "USD", direction: "credit_release", balanceBeforeCents: available,
            balanceAfterCents: available + amount, status: "recorded", providerConnected: false, transferEnabled: false,
            metadata: { reason, reviewOnly: true }, createdAt: now
          });
        }
      });
    } else {
      const config: Record<string, { collection: string; statusField: string }> = {
        sponsor: { collection: "sponsorProfiles", statusField: "sponsorVerificationStatus" },
        challenge: { collection: "challenges", statusField: "status" },
        submission: { collection: "submissions", statusField: "status" },
        participant: { collection: "challengeParticipants", statusField: "status" },
        winner: { collection: "winners", statusField: "adminReviewStatus" }
      };
      const target = config[type];
      const ref = db.collection(target.collection).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return fail(`${type} record not found.`, 404, undefined, "NOT_FOUND");
      previousStatus = String(snap.data()?.[target.statusField] ?? "unknown");
      await ref.set({
        [target.statusField]: status,
        reviewedBy: user.uid,
        reviewedAt: now,
        moneyMovementEnabled: false,
        transferEnabled: false,
        updatedAt: now
      }, { merge: true });
      if (type === "sponsor") {
        await Promise.all([
          db.collection("users").doc(id).set({ sponsorVerificationStatus: status, updatedAt: now }, { merge: true }),
          db.collection("profiles").doc(id).set({ sponsorVerificationStatus: status, updatedAt: now }, { merge: true })
        ]);
      }
    }
    if (note || reason) {
      await db.collection("adminNotes").doc(`${type}_${id}`).set({
        id: `${type}_${id}`,
        targetType: type,
        targetId: id,
        note: note || null,
        reason: reason || null,
        updatedBy: user.uid,
        updatedAt: now,
        createdAt: now
      }, { merge: true });
    }
    await writeAuditLog({
      actorId: user.uid,
      actorType: "admin",
      action: `${type}.${action}`,
      targetType: type,
      targetId: id,
      before: { status: previousStatus },
      after: { status, moneyMovementEnabled: false },
      reason: reason || null,
      metadata: { note: note || null, transferEnabled: false }
    }, db);
    return ok({ type, id, action, previousStatus, newStatus: status }, "Admin decision saved. No money movement was performed.");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Record not found.", 404, undefined, "NOT_FOUND");
    if (error instanceof Error && error.message === "INVALID_STATE") return fail("This record is no longer eligible for that action.", 409, undefined, "INVALID_STATE");
    if (error instanceof Error && error.message === "KYC_REQUIRED") return fail("Identity verification must be verified before approval. KYC processing is not active yet.", 409, undefined, "KYC_REQUIRED");
    return serverError("Admin decision could not be saved.", error instanceof Error ? error.message : error);
  }
}
