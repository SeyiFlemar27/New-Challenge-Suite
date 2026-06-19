import { getAdminDb } from "@/lib/firebase/admin";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge details");

  const challengeSnap = await db.collection("challenges").doc(id).get();
  if (!challengeSnap.exists) {
    return fail("Challenge not found.", 404, { fieldErrors: { id: "Challenge does not exist." } }, "NOT_FOUND");
  }

  const user = await getOptionalRequestUser(request);
  const [submissionsSnap, sponsorshipsSnap, votesSnap, participantSnap] = await Promise.all([
    db.collection("submissions").where("challengeId", "==", id).orderBy("weightedVoteCount", "desc").limit(50).get(),
    db.collection("sponsorships").where("challengeId", "==", id).limit(20).get(),
    db.collection("votes").where("challengeId", "==", id).limit(500).get(),
    user ? db.collection("challengeParticipants").doc(`${id}_${user.uid}`).get() : Promise.resolve(null)
  ]);

  const submissions: Array<Record<string, unknown>> = submissionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const sponsorships: Array<Record<string, unknown>> = sponsorshipsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const votes: Array<Record<string, unknown>> = votesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const userVotes = user ? votes.filter((vote) => vote.userId === user.uid) : [];

  return ok({
    challenge: { id: challengeSnap.id, ...challengeSnap.data() },
    submissions,
    sponsorships,
    voteCount: votes.length,
    userState: user ? {
      authenticated: true,
      joined: Boolean(participantSnap?.exists),
      votedSubmissionIds: userVotes.map((vote) => vote.submissionId).filter(Boolean),
      voteCount: userVotes.length
    } : {
      authenticated: false,
      joined: false,
      votedSubmissionIds: [],
      voteCount: 0
    }
  }, "Challenge details loaded.");
}
