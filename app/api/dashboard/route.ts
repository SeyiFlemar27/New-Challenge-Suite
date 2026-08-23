import { isChallengeActiveForDashboard } from "@/lib/challenge-status";
import { getAdminDb } from "@/lib/firebase/admin";
import { getEffectiveTier, getUserPlanAccess, normalizeAccountType } from "@/lib/plan-access";
import { requireRequestUser } from "@/lib/server/auth";
import { isQaDemoOrPlaceholderProfile, isQaOrDemoRecord, publicChallengeFields } from "@/lib/server/public-challenge";
import { calculateChallengeDraftProgress, resolveChallengeManagementState } from "@/lib/server/challenge-drafts";
import { ok, serverUnavailable } from "@/lib/server/responses";
import { monthlyBoostRankingWeight } from "@/lib/monthly-boost";

type DashboardChallengeRelationship = "created" | "joined" | "submitted";

function personalChallengeFields(id: string, data: Record<string, unknown>, relationship: DashboardChallengeRelationship) {
  const progress = calculateChallengeDraftProgress(data);
  return {
    id,
    ...publicChallengeFields(data),
    relationship,
    status: data.status ?? data.lifecycleStatus ?? "draft",
    lifecycleStatus: data.lifecycleStatus ?? data.status ?? "draft",
    reviewStatus: data.reviewStatus ?? data.adminReviewStatus ?? null,
    managementState: resolveChallengeManagementState(data),
    completionPercentage: Number(data.completionPercentage ?? progress.completionPercentage),
    nextIncompleteSection: data.nextIncompleteSection ?? progress.nextIncompleteSection,
    lastAutosavedAt: data.lastAutosavedAt ?? data.updatedAt ?? null,
    visibility: data.visibility ?? "public",
    recommendationScore: monthlyBoostRankingWeight(data)
  };
}

async function loadChallengeDocs(db: NonNullable<ReturnType<typeof getAdminDb>>, ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return [];
  return db.getAll(...uniqueIds.map((id) => db.collection("challenges").doc(id)));
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Dashboard");

  const [userSnap, profileSnap, walletSnap, cashWalletSnap, ownedChallengesSnap, participantsSnap, submissionsSnap, notificationsSnap, badgesSnap, kycSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get(),
    db.collection("doroCoinWallets").doc(user.uid).get(),
    db.collection("cashWallets").doc(user.uid).get(),
    db.collection("challenges").where("creatorId", "==", user.uid).limit(50).get(),
    db.collection("challengeParticipants").where("userId", "==", user.uid).limit(50).get(),
    db.collection("submissions").where("userId", "==", user.uid).limit(50).get(),
    db.collection("notifications").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(8).get(),
    db.collection("badges").where("userId", "==", user.uid).limit(12).get(),
    db.collection("kycMetadata").doc(user.uid).get()
  ]);

  const account = userSnap.exists ? userSnap.data() ?? {} : {};
  const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
  const wallet = walletSnap.exists ? walletSnap.data() ?? {} : {};
  const kyc = kycSnap.exists ? kycSnap.data() ?? {} : {};
  const profileLooksSeeded = isQaDemoOrPlaceholderProfile(user.uid, { ...account, ...profile });

  const hostedChallenges: Array<Record<string, unknown>> = ownedChallengesSnap.docs
    .filter((doc) => !isQaOrDemoRecord(doc.id, doc.data()))
    .map((doc) => personalChallengeFields(doc.id, doc.data(), "created"));
  const participants: Array<Record<string, unknown>> = participantsSnap.docs
    .filter((doc) => !isQaOrDemoRecord(doc.id, doc.data()))
    .map((doc) => ({ id: doc.id, ...doc.data() }));
  const submissions: Array<Record<string, unknown>> = submissionsSnap.docs
    .filter((doc) => !isQaOrDemoRecord(doc.id, doc.data()))
    .map((doc) => ({ id: doc.id, ...doc.data() }));
  const relatedChallengeSnaps = await loadChallengeDocs(db, [
    ...participants.map((participant) => String(participant.challengeId ?? "")),
    ...submissions.map((submission) => String(submission.challengeId ?? ""))
  ]);
  const relatedChallengeById = new Map(relatedChallengeSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, snap.data() ?? {}]));
  const participantByChallenge = new Map(participants.map((participant) => [String(participant.challengeId ?? ""), participant]));
  const submissionByChallenge = new Map(submissions.map((submission) => [String(submission.challengeId ?? ""), submission]));
  const participantEntries = [...new Set([...participants, ...submissions].map((item) => String(item.challengeId ?? "")).filter(Boolean))].map((challengeId) => {
    const challenge = relatedChallengeById.get(challengeId) ?? {};
    const participant = participantByChallenge.get(challengeId) ?? {};
    const submission = submissionByChallenge.get(challengeId) ?? {};
    const status = String(challenge.status ?? challenge.lifecycleStatus ?? "");
    const cancelled = ["cancelled", "canceled"].includes(status.toLowerCase());
    return {
      ...submission,
      participantId: participant.id ?? null,
      challengeId,
      challengeTitle: challenge.title ?? submission.challengeTitle ?? "Challenge",
      challengeStatus: status || "active",
      participantStatus: participant.status ?? null,
      paymentStatus: participant.paymentStatus ?? participant.entryPaymentStatus ?? "not_required",
      refundStatus: participant.refundStatus ?? challenge.refundStatus ?? "not_applicable",
      cancelled,
      cancellationDate: challenge.cancelledAt ?? challenge.canceledAt ?? challenge.updatedAt ?? null,
      cancellationReason: challenge.cancellationReason ?? challenge.cancelReason ?? null
    };
  });

  const personalChallenges = new Map<string, Record<string, unknown>>();
  for (const challenge of hostedChallenges) {
    personalChallenges.set(String(challenge.id), challenge);
  }
  for (const snap of relatedChallengeSnaps) {
    if (!snap.exists) continue;
    const data = snap.data() ?? {};
    if (isQaOrDemoRecord(snap.id, data)) continue;
    const relationship: DashboardChallengeRelationship = submissions.some((submission) => String(submission.challengeId ?? "") === snap.id) ? "submitted" : "joined";
    personalChallenges.set(snap.id, personalChallengeFields(snap.id, data, relationship));
  }

  const challenges = [...personalChallenges.values()];
  const notifications = notificationsSnap.docs
    .filter((doc) => !isQaOrDemoRecord(doc.id, doc.data()))
    .map((doc) => ({ id: doc.id, ...doc.data() }));
  const badges = badgesSnap.docs
    .filter((doc) => !isQaOrDemoRecord(doc.id, doc.data()))
    .map((doc) => ({ id: doc.id, ...doc.data() }));
  const planProfile = { ...profile, ...account };
  const planAccess = getUserPlanAccess(planProfile);
  const effectiveTier = getEffectiveTier(planProfile);
  const accountType = normalizeAccountType(planProfile);
  const sponsorOnboardingComplete = Boolean(planProfile.sponsorOnboardingComplete || planProfile.brandProfileComplete);
  const hasSponsorProfile = Boolean(planProfile.hasSponsorProfile || sponsorOnboardingComplete);
  const safeTotalPoints = profileLooksSeeded ? 0 : Number(profile?.totalPoints ?? account?.totalPoints ?? 0);

  return ok({
    redirectTo: planProfile.accountTypeSelectionComplete === false
      ? "/onboarding/account-type"
      : accountType === "sponsor" ? "/sponsor/dashboard" : null,
    user: {
      uid: user.uid,
      email: user.email ?? account?.email ?? profile?.email ?? "",
      displayName: profile?.displayName ?? account?.displayName ?? user.email ?? "",
      initials: profile?.initials ?? "",
      role: account?.role ?? profile?.role ?? null,
      accountType,
      dashboardType: String(planProfile.dashboard_type ?? planProfile.dashboardType ?? (accountType === "sponsor" ? "sponsor_dashboard" : "user_dashboard")),
      selectedAccountType: String(planProfile.account_type ?? (accountType === "sponsor" ? "sponsor" : "user")),
      planId: planAccess.normalizedPlanId,
      legacyPlanId: planAccess.planId,
      planName: planAccess.planName,
      planStatus: planAccess.planStatus,
      effectiveTier,
      premium: planAccess.isPremium,
      sponsorOnboardingComplete,
      hasSponsorProfile,
      creatorOnboardingComplete: Boolean(planProfile.creatorOnboardingComplete),
      hostOnboardingComplete: Boolean(planProfile.hostOnboardingComplete),
      verified: Boolean(profile?.verified ?? user.emailVerified),
      totalPoints: safeTotalPoints,
      doroBalance: Number(wallet?.balance ?? 0),
      kycRequired: Boolean(kyc.kycRequired ?? planProfile.kycRequired),
      kycStatus: String(kyc.kycStatus ?? planProfile.kycStatus ?? "not_required"),
      premiumAccessState: String(kyc.premiumAccessState ?? planProfile.premiumAccessState ?? "free_or_not_required")
    },
    stats: {
      activeChallenges: challenges.filter((challenge) => isChallengeActiveForDashboard(challenge.status)).length,
      totalPoints: safeTotalPoints,
      badgeCount: badges.length,
      submissionCount: submissions.length
    },
    challenges,
    hostedChallenges,
    submissions,
    participantEntries,
    wallet: walletSnap.exists ? { userId: user.uid, ...wallet } : null,
    cashWallet: cashWalletSnap.exists ? { userId: user.uid, ...cashWalletSnap.data() } : { userId: user.uid, availableBalanceCents: 0, pendingBalanceCents: 0 },
    badges,
    leaderboard: [],
    notifications
  }, "Dashboard loaded.");
}

