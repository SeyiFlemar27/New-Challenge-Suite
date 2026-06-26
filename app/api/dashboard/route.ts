import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { sanitizeCustomization } from "@/lib/customization/access";
import { getUserPlanAccess } from "@/lib/plan-access";
import { getDefaultRouteForAccount } from "@/lib/account-routing";
import { buildGlobalLeaderboard } from "@/lib/server/leaderboard";

type DashboardQueryName =
  | "user"
  | "profile"
  | "wallet"
  | "challenges"
  | "submissions"
  | "notifications"
  | "badges";

type DashboardQueryError = Error & {
  queryName?: DashboardQueryName;
  code?: unknown;
  details?: unknown;
};

const DASHBOARD_QUERY_INDEXES: Record<string, { collectionGroup: string; queryScope: "COLLECTION"; fields: Array<{ fieldPath: string; order: "ASCENDING" | "DESCENDING" }> }> = {
  notifications: {
    collectionGroup: "notifications",
    queryScope: "COLLECTION",
    fields: [
      { fieldPath: "userId", order: "ASCENDING" },
      { fieldPath: "createdAt", order: "DESCENDING" }
    ]
  }
};

const DASHBOARD_QUERY_DESCRIPTIONS: Record<DashboardQueryName, string> = {
  user: "users/{uid}",
  profile: "profiles/{uid}",
  wallet: "doroCoinWallets/{uid}",
  challenges: "challenges orderBy createdAt desc limit 24",
  submissions: "submissions where userId == uid limit 50",
  notifications: "notifications where userId == uid orderBy createdAt desc limit 8",
  badges: "badges where userId == uid limit 12"
};

async function runDashboardQuery<T>(queryName: DashboardQueryName, query: Promise<T>) {
  try {
    return await query;
  } catch (error) {
    const wrapped = error instanceof Error ? error as DashboardQueryError : new Error("Dashboard query failed.") as DashboardQueryError;
    wrapped.queryName = queryName;
    throw wrapped;
  }
}

function isFirestoreIndexError(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  const text = `${String(candidate?.code ?? "")} ${String(candidate?.message ?? "")} ${String(candidate?.details ?? "")}`.toLowerCase();
  return text.includes("failed_precondition") || text.includes("requires an index") || text.includes("index");
}

function dashboardErrorDetails(error: unknown) {
  const candidate = error as DashboardQueryError;
  const queryName = candidate?.queryName ?? null;
  const firestoreMessage = typeof candidate?.message === "string" ? candidate.message : "Dashboard query failed.";

  if (isFirestoreIndexError(error)) {
    const requiredIndex = queryName ? DASHBOARD_QUERY_INDEXES[queryName] ?? null : null;
    return {
      reason: "firestore_index_required",
      queryName,
      query: queryName ? DASHBOARD_QUERY_DESCRIPTIONS[queryName] : null,
      firestoreCode: candidate?.code ?? null,
      firestoreMessage,
      requiredIndex
    };
  }

  return {
    reason: "dashboard_query_failed",
    queryName,
    query: queryName ? DASHBOARD_QUERY_DESCRIPTIONS[queryName] : null,
    firestoreCode: candidate?.code ?? null,
    firestoreMessage
  };
}

function emptyDashboardPayload(user: { uid: string; email?: string; emailVerified?: boolean }, account: Record<string, any>, profile: Record<string, any>, redirectTo?: string) {
  const planAccess = getUserPlanAccess({ ...profile, ...account });
  const customization = sanitizeCustomization((profile?.customization ?? account?.customization) as any);
  return {
    redirectTo,
    user: {
      uid: user.uid,
      email: user.email ?? account?.email ?? profile?.email ?? "",
      displayName: profile?.displayName ?? account?.displayName ?? user.email ?? "",
      initials: profile?.initials ?? "",
      role: account?.role ?? profile?.role ?? null,
      accountType: account?.accountType ?? profile?.accountType ?? planAccess.accountType,
      dashboardType: account?.dashboardType ?? profile?.dashboardType ?? `${planAccess.accountType}_dashboard`,
      planId: planAccess.normalizedPlanId,
      legacyPlanId: planAccess.planId,
      planName: planAccess.planName,
      planStatus: planAccess.planStatus,
      premium: planAccess.isPremium,
      isPremium: planAccess.isPremium,
      isSponsor: planAccess.isSponsor,
      sponsorOnboardingStatus: account?.sponsorOnboardingStatus ?? profile?.sponsorOnboardingStatus ?? null,
      sponsorOnboardingComplete: Boolean(account?.sponsorOnboardingComplete || profile?.sponsorOnboardingComplete || account?.brandProfileComplete || profile?.brandProfileComplete),
      hasSponsorProfile: Boolean(account?.hasSponsorProfile || profile?.hasSponsorProfile),
      sponsorVerificationStatus: account?.sponsorVerificationStatus ?? profile?.sponsorVerificationStatus ?? null,
      verified: Boolean(profile?.verified ?? user.emailVerified),
      totalPoints: Number(profile?.totalPoints ?? account?.totalPoints ?? 0),
      doroBalance: 0,
      customization
    },
    stats: {
      activeChallenges: 0,
      totalPoints: Number(profile?.totalPoints ?? account?.totalPoints ?? 0),
      badgeCount: 0,
      submissionCount: 0
    },
    challenges: [],
    submissions: [],
    wallet: null,
    badges: [],
    leaderboard: [],
    notifications: []
  };
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Dashboard");

  try {
    const [userSnap, profileSnap] = await Promise.all([
      runDashboardQuery("user", db.collection("users").doc(user.uid).get()),
      runDashboardQuery("profile", db.collection("profiles").doc(user.uid).get())
    ]);

    const account = userSnap.exists ? userSnap.data() ?? {} : {};
    const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
    const planAccess = getUserPlanAccess({ ...profile, ...account });

    if (planAccess.accountType === "sponsor") {
      const redirectTo = getDefaultRouteForAccount({ ...profile, ...account, accountType: "sponsor" });
      return ok(emptyDashboardPayload(user, account, profile, redirectTo), "Sponsor accounts use the Brand Command Center.");
    }

    const [walletSnap, challengesSnap, submissionsSnap, notificationsSnap, badgesSnap, leaderboardResult] = await Promise.all([
      runDashboardQuery("wallet", db.collection("doroCoinWallets").doc(user.uid).get()),
      runDashboardQuery("challenges", db.collection("challenges").orderBy("createdAt", "desc").limit(24).get()),
      runDashboardQuery("submissions", db.collection("submissions").where("userId", "==", user.uid).limit(50).get()),
      runDashboardQuery("notifications", db.collection("notifications").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(8).get()),
      runDashboardQuery("badges", db.collection("badges").where("userId", "==", user.uid).limit(12).get()),
      buildGlobalLeaderboard(db, 10)
    ]);

    const wallet = walletSnap.exists ? walletSnap.data() : {};
    const challenges: Array<Record<string, unknown>> = challengesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const submissions = submissionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const notifications = notificationsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const badges = badgesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const leaderboardEntries = leaderboardResult.entries;
    const customization = sanitizeCustomization((profile?.customization ?? account?.customization) as any);

    return ok({
      user: {
        uid: user.uid,
        email: user.email ?? account?.email ?? profile?.email ?? "",
        displayName: profile?.displayName ?? account?.displayName ?? user.email ?? "",
        initials: profile?.initials ?? "",
        role: account?.role ?? profile?.role ?? null,
        accountType: account?.accountType ?? profile?.accountType ?? planAccess.accountType,
        dashboardType: account?.dashboardType ?? profile?.dashboardType ?? "user_dashboard",
        planId: planAccess.normalizedPlanId,
        legacyPlanId: planAccess.planId,
        planName: planAccess.planName,
        planStatus: planAccess.planStatus,
        premium: planAccess.isPremium,
        isPremium: planAccess.isPremium,
        isSponsor: planAccess.isSponsor,
        verified: Boolean(profile?.verified ?? user.emailVerified),
        totalPoints: Number(profile?.totalPoints ?? account?.totalPoints ?? 0),
        doroBalance: Number(wallet?.balance ?? 0),
        customization
      },
      stats: {
        activeChallenges: challenges.filter((challenge) => ["published", "registration_open", "active", "voting"].includes(String(challenge.status))).length,
        totalPoints: Number(profile?.totalPoints ?? account?.totalPoints ?? 0),
        badgeCount: badges.length,
        submissionCount: submissions.length
      },
      challenges,
      submissions,
      wallet: walletSnap.exists ? { userId: user.uid, ...wallet } : null,
      badges,
      leaderboard: leaderboardEntries,
      notifications
    }, "Dashboard loaded.");
  } catch (error) {
    const details = dashboardErrorDetails(error);
    console.error("[dashboard] load failed", details);
    return serverError("Dashboard could not load.", details);
  }
}

