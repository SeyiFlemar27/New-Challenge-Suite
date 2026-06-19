import { getAdminDb } from "@/lib/firebase/admin";
import { ok, serverUnavailable } from "@/lib/server/responses";

type WinnerResult = Record<string, unknown>;

async function enrichWinner(db: NonNullable<ReturnType<typeof getAdminDb>>, submission: WinnerResult, rank: number | null) {
  const challengeId = String(submission.challengeId ?? "");
  const userId = String(submission.userId ?? "");
  const [challengeSnap, profileSnap] = await Promise.all([
    challengeId ? db.collection("challenges").doc(challengeId).get() : Promise.resolve(null),
    userId ? db.collection("profiles").doc(userId).get() : Promise.resolve(null)
  ]);

  const challenge: Record<string, unknown> | null = challengeSnap?.exists ? { id: challengeSnap.id, ...challengeSnap.data() } : null;
  const profile = profileSnap?.exists ? profileSnap.data() : {};

  return {
    ...submission,
    isWinner: true,
    rank: rank ?? 1,
    challenge,
    challengeTitle: submission.challengeTitle ?? challenge?.title ?? "",
    challengeCategory: submission.challengeCategory ?? challenge?.category ?? "",
    challengeEndsAt: challenge?.endsAt ?? null,
    prizeType: challenge?.prizeType ?? null,
    prizePool: challenge?.prizePool ?? null,
    userName: submission.userName ?? profile?.displayName ?? "Participant",
    userInitials: submission.userInitials ?? profile?.initials ?? "??",
    userPlanId: submission.userPlanId ?? profile?.planId ?? undefined
  };
}

export async function GET() {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Winners");

  const winnerDocs = await db.collection("winners").orderBy("createdAt", "desc").limit(24).get().catch(() => null);
  if (winnerDocs && !winnerDocs.empty) {
    const submissions = await Promise.all(winnerDocs.docs.map(async (doc) => {
      const winner = { id: doc.id, ...doc.data() } as WinnerResult;
      const submissionId = String(winner.submissionId ?? "");
      const submissionSnap = submissionId ? await db.collection("submissions").doc(submissionId).get() : null;
      const submission = submissionSnap?.exists ? { id: submissionSnap.id, ...submissionSnap.data(), ...winner } : winner;
      return enrichWinner(db, submission, Number(winner.rank ?? 1));
    }));
    return ok({ winners: submissions }, "Winners loaded.");
  }

  const explicitWinners = await db.collection("submissions").where("isWinner", "==", true).limit(24).get();
  if (!explicitWinners.empty) {
    const winners = await Promise.all(explicitWinners.docs.map((doc, index) => enrichWinner(db, { id: doc.id, ...doc.data() }, index + 1)));
    return ok({ winners }, "Winners loaded.");
  }

  const completedChallenges = await db.collection("challenges").where("status", "==", "completed").limit(24).get();
  const derived = await Promise.all(completedChallenges.docs.map(async (challengeDoc) => {
    const submissionSnap = await db.collection("submissions")
      .where("challengeId", "==", challengeDoc.id)
      .where("status", "in", ["approved", "winner"])
      .orderBy("weightedVoteCount", "desc")
      .limit(1)
      .get();
    if (submissionSnap.empty) return null;
    const topSubmission = submissionSnap.docs[0];
    return enrichWinner(db, { id: topSubmission.id, ...topSubmission.data(), challenge: { id: challengeDoc.id, ...challengeDoc.data() } }, 1);
  }));

  return ok({ winners: derived.filter(Boolean) }, "Winners loaded.");
}
