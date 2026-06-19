import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, serverUnavailable } from "@/lib/server/responses";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Dashboard");

  const [userSnap, profileSnap, walletSnap, challengesSnap, submissionsSnap, notificationsSnap, badgesSnap, leaderboardSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get(),
    db.collection("doroCoinWallets").doc(user.uid).get(),
    db.collection("challenges").orderBy("createdAt", "desc").limit(24).get(),
    db.collection("submissions").where("userId", "==", user.uid).limit(50).get(),
    db.collection("notifications").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(8).get(),
    db.collection("badges").where("userId", "==", user.uid).limit(12).get(),
    db.collection("leaderboards").doc("global").get()
  ]);

  const account = userSnap.exists ? userSnap.data() : {};
  const profile = profileSnap.exists ? profileSnap.data() : {};
  const wallet = walletSnap.exists ? walletSnap.data() : {};
  const challenges: Array<Record<string, unknown>> = challengesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const submissions = submissionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const notifications = notificationsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const badges = badgesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const leaderboardData = leaderboardSnap.exists ? leaderboardSnap.data() : {};
  const leaderboardEntries = Array.isArray(leaderboardData?.entries) ? leaderboardData.entries : [];

  return ok({
    user: {
      uid: user.uid,
      email: user.email ?? account?.email ?? profile?.email ?? "",
      displayName: profile?.displayName ?? account?.displayName ?? user.email ?? "",
      initials: profile?.initials ?? "",
      role: account?.role ?? profile?.role ?? null,
      planId: account?.planId ?? "observer",
      premium: Boolean(profile?.premium || (account?.planId && account.planId !== "observer")),
      verified: Boolean(profile?.verified ?? user.emailVerified),
      totalPoints: Number(profile?.totalPoints ?? account?.totalPoints ?? 0),
      doroBalance: Number(wallet?.balance ?? 0)
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
}
