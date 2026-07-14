import { getAdminDb } from "@/lib/firebase/admin";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
import { canAccessChallenge } from "@/lib/plan-access";
import { buildChallengeLeaderboard } from "@/lib/server/leaderboard";
import { isPublicChallenge, publicChallengeFields } from "@/lib/server/public-challenge";
import { publicPrizePoolFields } from "@/lib/server/prize-pools";
import { challengeForPlanAccess } from "@/lib/server/challenge-access";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge details");

  const challengeSnap = await db.collection("challenges").doc(id).get();
  if (!challengeSnap.exists) {
    return fail("Challenge not found.", 404, { fieldErrors: { id: "Challenge does not exist." } }, "NOT_FOUND");
  }

  const challengeData = challengeSnap.data() ?? {};
  const publiclyVisible = isPublicChallenge(challengeSnap.id, challengeData);
  const user = await getOptionalRequestUser(request);
  if (!user && !publiclyVisible) {
    return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
  }
  if (user) {
    const [accountSnap, profileSnap] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get()
    ]);
    const accessContext = await challengeForPlanAccess(db, { id: challengeSnap.id, ...challengeData }, user.uid);
    if (accessContext.privateOnly && !accessContext.hasAccessGrant) {
      return fail("A valid private challenge invite or approval is required.", 403, { redirectTo: "/private-exclusive" }, "PRIVATE_INVITE_REQUIRED");
    }
    const access = canAccessChallenge({ ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) }, accessContext.challenge);
    if (!access.allowed) {
      return fail(access.code === "PREMIUM_REQUIRED" ? "Premium membership is required to view this challenge." : "Plan access is required for this challenge.", 403, undefined, access.code ?? "PLAN_ACCESS_DENIED");
    }
  }

  const [leaderboard, sponsorshipsSnap, votesSnap, publicParticipantsSnap, participantSnap, engagementSnap, prizePoolSnap] = await Promise.all([
    buildChallengeLeaderboard(db, id, { limit: 50 }),
    db.collection("sponsorships").where("challengeId", "==", id).limit(20).get(),
    db.collection("votes").where("challengeId", "==", id).limit(500).get(),
    db.collection("challengeParticipants").where("challengeId", "==", id).limit(250).get(),
    user ? db.collection("challengeParticipants").doc(`${id}_${user.uid}`).get() : Promise.resolve(null),
    user ? db.collection("challengeEngagements").doc(`${id}_${user.uid}`).get() : Promise.resolve(null),
    db.collection("prizePools").doc(id).get()
  ]);

  const sponsorships = sponsorshipsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>))
    .filter((item) => item.status === "approved")
    .map((item) => ({
      id: item.id,
      brandName: item.brandName ?? item.sponsorName ?? "Sponsor",
      packageName: item.packageName ?? null,
      ctaButtonText: item.ctaButtonText ?? null,
      ctaDestinationLink: item.ctaDestinationLink ?? null,
      status: item.status
    }));
  const publicParticipantStatuses = new Set(["approved", "active", "joined", "checked_in", "submitted"]);
  const participants = publicParticipantsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>))
    .filter((item) => publicParticipantStatuses.has(String(item.status ?? "joined")))
    .map((item) => ({
      id: String(item.id),
      displayName: String(item.displayName ?? item.name ?? item.userName ?? item.username ?? "Challenge Suite member"),
      username: typeof item.username === "string" ? item.username : typeof item.userName === "string" ? item.userName : null,
      avatarUrl: typeof item.avatarUrl === "string" ? item.avatarUrl : typeof item.photoURL === "string" ? item.photoURL : null,
      participantStatus: String(item.status ?? "joined"),
      entryStatus: typeof item.submissionStatus === "string" ? item.submissionStatus : null,
      profilePath: typeof item.username === "string" ? `/profile/${item.username}` : typeof item.userName === "string" ? `/profile/${item.userName}` : "/profile"
    }));
  const votes: Array<Record<string, unknown>> = votesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const userVotes = user ? votes.filter((vote) => vote.userId === user.uid || vote.voterId === user.uid) : [];
  const { challenge: _challenge, ...leaderboardPayload } = leaderboard;

  const publicChallenge = publicChallengeFields(challengeData);

  return ok({
    challenge: { id: challengeSnap.id, ...publicChallenge },
    submissions: leaderboard.entries,
    leaderboard: leaderboardPayload,
    sponsorships,
    participants,
    prizePool: publicPrizePoolFields(prizePoolSnap.exists ? prizePoolSnap.data() : null),
    voteCount: votes.length,
    userState: user ? {
      authenticated: true,
      joined: Boolean(participantSnap?.exists),
      votedSubmissionIds: userVotes.map((vote) => vote.submissionId).filter(Boolean),
      voteCount: userVotes.length,
      saved: Boolean(engagementSnap?.data()?.saved),
      watchLater: Boolean(engagementSnap?.data()?.watchLater),
      interested: Boolean(engagementSnap?.data()?.interested),
      reminderStatus: engagementSnap?.data()?.reminderStatus ?? null
    } : {
      authenticated: false,
      joined: false,
      votedSubmissionIds: [],
      voteCount: 0
    }
  }, "Challenge details loaded.");
}


