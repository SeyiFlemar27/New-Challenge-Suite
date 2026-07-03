import { getAdminDb } from "@/lib/firebase/admin";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
import { canAccessChallenge } from "@/lib/plan-access";
import { buildChallengeLeaderboard } from "@/lib/server/leaderboard";
import { publicChallengeFields } from "@/lib/server/public-challenge";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge details");

  const challengeSnap = await db.collection("challenges").doc(id).get();
  if (!challengeSnap.exists) {
    return fail("Challenge not found.", 404, { fieldErrors: { id: "Challenge does not exist." } }, "NOT_FOUND");
  }

  const user = await getOptionalRequestUser(request);
  if (user) {
    const [accountSnap, profileSnap] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get()
    ]);
    const access = canAccessChallenge({ ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) }, challengeSnap.data() ?? {});
    if (!access.allowed) {
      return fail(access.code === "PREMIUM_REQUIRED" ? "Premium membership is required to view this challenge." : "Creator Pro is required to view this private or exclusive challenge.", 403, undefined, access.code ?? "PLAN_ACCESS_DENIED");
    }
  }

  const [leaderboard, sponsorshipsSnap, votesSnap, participantSnap, engagementSnap] = await Promise.all([
    buildChallengeLeaderboard(db, id, { limit: 50 }),
    db.collection("sponsorships").where("challengeId", "==", id).limit(20).get(),
    db.collection("votes").where("challengeId", "==", id).limit(500).get(),
    user ? db.collection("challengeParticipants").doc(`${id}_${user.uid}`).get() : Promise.resolve(null),
    user ? db.collection("challengeEngagements").doc(`${id}_${user.uid}`).get() : Promise.resolve(null)
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
  const votes: Array<Record<string, unknown>> = votesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const userVotes = user ? votes.filter((vote) => vote.userId === user.uid || vote.voterId === user.uid) : [];
  const { challenge: _challenge, ...leaderboardPayload } = leaderboard;

  const publicChallenge = publicChallengeFields(challengeSnap.data() ?? {});

  return ok({
    challenge: { id: challengeSnap.id, ...publicChallenge },
    submissions: leaderboard.entries,
    leaderboard: leaderboardPayload,
    sponsorships,
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
