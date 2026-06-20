import { getAdminDb } from "@/lib/firebase/admin";
import { canJoinChallenge } from "@/lib/challenge-status";
import { requireRequestUser } from "@/lib/server/auth";
import { createNotification } from "@/lib/server/notifications";
import { ok, serverUnavailable, fail } from "@/lib/server/responses";
import { canAccessChallenge } from "@/lib/plan-access";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge joining");

  let result: { alreadyJoined: boolean };
  try {
    const [accountSnap, profileSnap] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get()
    ]);
    const planProfile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) };
    result = await db.runTransaction(async (transaction) => {
      const challengeRef = db.collection("challenges").doc(id);
      const challengeSnap = await transaction.get(challengeRef);
      if (!challengeSnap.exists) throw new Error("Challenge not found.");
      const challenge = challengeSnap.data()!;
      const access = canAccessChallenge(planProfile, challenge);
      if (!access.allowed) throw new Error(access.code ?? "PREMIUM_REQUIRED");
      if (!canJoinChallenge(challenge as any)) throw new Error("Registration is closed for this challenge.");
      const participantRef = db.collection("challengeParticipants").doc(`${id}_${user.uid}`);
      const participantSnap = await transaction.get(participantRef);
      if (participantSnap.exists) return { alreadyJoined: true };
      const now = new Date().toISOString();
      transaction.set(participantRef, { id: participantRef.id, challengeId: id, userId: user.uid, status: "joined", joinedAt: now });
      transaction.set(challengeRef, { participantCount: Number(challenge.participantCount ?? 0) + 1, updatedAt: now }, { merge: true });
      return { alreadyJoined: false };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Challenge could not be joined.";
    if (message === "PREMIUM_REQUIRED") return fail("Premium membership is required to join this challenge.", 403, undefined, "PREMIUM_REQUIRED");
    if (message === "CREATOR_PRO_REQUIRED") return fail("Creator Pro is required to join this private or exclusive challenge.", 403, undefined, "CREATOR_PRO_REQUIRED");
    return fail(message, message === "Challenge not found." ? 404 : 409, undefined, message === "Challenge not found." ? "NOT_FOUND" : "CHALLENGE_JOIN_REJECTED");
  }

  await createNotification(db, { userId: user.uid, type: "challenge_joined", title: "Challenge joined", body: result.alreadyJoined ? "You were already joined." : "You successfully joined the challenge.", targetId: id });
  return ok(result, result.alreadyJoined ? "You already joined this challenge." : "Challenge joined successfully.");
}
