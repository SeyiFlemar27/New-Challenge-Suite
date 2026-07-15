import { isChallengeActiveForDashboard } from "@/lib/challenge-status";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, serverUnavailable } from "@/lib/server/responses";
import { getEffectiveTier, getUserPlanAccess, normalizeAccountType } from "@/lib/plan-access";
import { publicChallengeFields } from "@/lib/server/public-challenge";

type DashboardChallengeRelationship = "created" | "joined" | "submitted";

function personalChallengeFields(id: string, data: Record<string, unknown>, relationship: DashboardChallengeRelationship) {
  return {
    id,
    ...publicChallengeFields(data),
    relationship,
    status: data.status ?? data.lifecycleStatus ?? "draft",
    visibility: data.visibility ?? "public"
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

  const [userSnap, profileSnap, walletSnap, ownedChallengesSnap, participantsSnap, submissionsSnap, notificationsSnap, badgesSnap, kycSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get(),
    db.collection("doroCoinWallets").doc(user.uid).get(),
    db.collection("challenges").where("creatorId", "==", user.uid).limit(50).get(),
    db.collection("challengeParticipants").where("userId", "==", user.uid).limit(50).get(),
    db.collection("submissions").where("userId", "==", user.uid).limit(50).get(),
    db.collection("notifications").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(8).get(),
    db.collection("badges").where("userId", "==", user.uid).limit(12).get(),
    db.collection("kycMetadata").doc(user.uid).get()
  ]);

  const account = userSnap.exists ? userSnap.data() : {};
  const profile = profileSnap.exists ? profileSnap.data() : {};
  const wallet = walletSnap.exists ? walletSnap.data() : {};
  const kyc = kycSnap.exists ? kycSnap.data() ?? {} : {};
  const hostedChallenges: Array<Record<string, unknown>> = ownedChallengesSnap.docs.map((doc) => personalChallengeFields(doc.id, doc.data(), "created"));
  const participants: Array<Record<string, unknown>> = participantsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const submissions: Array<Record<string, unknown>> = submissionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const relatedChallengeSnaps = await loadChallengeDocs(db, [
    ...participants.map((participant) => String(participant.challengeId ?? "")),
    ...submissions.map((submission) => String(submission.challengeId ?? ""))
  ]);
  const personalChallenges = new Map<string, Record<string, unknown>>();
  for (const challenge of hostedChallenges) {
    personalChallenges.set(String(challenge.id), challenge);
  }
  for (const snap of relatedChallengeSnaps) {
    if (!snap.exists) continue;
    const data = snap.data() ?? {};
    const relationship: DashboardChallengeRelationship = submissions.some((submission) => String(submission.challengeId ?? "") === snap.id) ? "submitted" : "joined";
    personalChallenges.set(snap.id, personalChallengeFields(snap.id, data, relationship));
  }
  const challenges = [...personalChallenges.values()];
  const notifications = notificationsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const badges = badgesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const planProfile = { ...profile, ...account };
  const planAccess = getUserPlanAccess(planProfile);
  const effectiveTier = getEffectiveTier(planProfile);
  const accountType = normalizeAccountType(planProfile);
  const sponsorOnboardingComplete = Boolean(planProfile.sponsorOnboardingComplete || planProfile.brandProfileComplete);
  const hasSponsorProfile = Boolean(planProfile.hasSponsorProfile || sponsorOnboardingComplete);

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
      totalPoints: Number(profile?.totalPoints ?? account?.totalPoints ?? 0),
      doroBalance: Number(wallet?.balance ?? 0),
      kycRequired: Boolean(kyc.kycRequired ?? planProfile.kycRequired),
      kycStatus: String(kyc.kycStatus ?? planProfile.kycStatus ?? "not_required"),
      premiumAccessState: String(kyc.premiumAccessState ?? planProfile.premiumAccessState ?? "free_or_not_required")
    },
    stats: {
      activeChallenges: challenges.filter((challenge) => isChallengeActiveForDashboard(challenge.status)).length,
      totalPoints: Number(profile?.totalPoints ?? account?.totalPoints ?? 0),
      badgeCount: badges.length,
      submissionCount: submissions.length
    },
    challenges,
    hostedChallenges,
    submissions,
    wallet: walletSnap.exists ? { userId: user.uid, ...wallet } : null,
    badges,
    leaderboard: [],
    notifications
  }, "Dashboard loaded.");
}

