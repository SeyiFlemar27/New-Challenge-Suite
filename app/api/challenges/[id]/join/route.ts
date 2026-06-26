import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { createNotification } from "@/lib/server/notifications";
import { ok, serverUnavailable, fail, readJson, validationError } from "@/lib/server/responses";
import { canAccessChallenge } from "@/lib/plan-access";
import { writeAuditLog } from "@/lib/server/audit";
import {
  isChallengeJoinable,
  isSponsorProfile,
  normalizeParticipantStatus,
  resolveParticipantStatus
} from "@/lib/server/submission-lifecycle";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge joining");

  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = (parsed.body ?? {}) as Record<string, unknown>;
  if (body.entryAgreementAccepted !== true) {
    return validationError({ entryAgreementAccepted: "Accept the challenge rules and entry agreement before joining." });
  }

  let result: { alreadyJoined: boolean; participant: Record<string, unknown> };
  try {
    const [accountSnap, profileSnap] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get()
    ]);
    const planProfile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) };
    if (isSponsorProfile(planProfile)) {
      return fail("Sponsor accounts use sponsor tools and cannot join normal user challenges.", 403, undefined, "SPONSOR_ACCOUNT_BLOCKED");
    }

    result = await db.runTransaction(async (transaction) => {
      const challengeRef = db.collection("challenges").doc(id);
      const participantRef = db.collection("challengeParticipants").doc(`${id}_${user.uid}`);
      const [challengeSnap, participantSnap] = await Promise.all([
        transaction.get(challengeRef),
        transaction.get(participantRef)
      ]);
      if (!challengeSnap.exists) throw new Error("Challenge not found.");
      const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
      const access = canAccessChallenge(planProfile, challenge);
      if (!access.allowed) throw new Error(access.code ?? "PREMIUM_REQUIRED");
      const joinable = isChallengeJoinable(challenge);
      if (!joinable.allowed) throw new Error(joinable.reason ?? "Registration is closed for this challenge.");

      const now = new Date().toISOString();
      if (participantSnap.exists) {
        const current = participantSnap.data() ?? {};
        const participant = {
          ...current,
          id: participantRef.id,
          status: normalizeParticipantStatus(current.status),
          entryAgreementAccepted: true,
          entryAgreementAcceptedAt: current.entryAgreementAcceptedAt ?? now,
          updatedAt: now
        };
        transaction.set(participantRef, participant, { merge: true });
        return { alreadyJoined: true, participant };
      }

      const status = resolveParticipantStatus(challenge);
      const participant = {
        id: participantRef.id,
        challengeId: id,
        userId: user.uid,
        status,
        registeredAt: now,
        joinedAt: now,
        entryAgreementAccepted: true,
        entryAgreementAcceptedAt: now,
        paidEntryEnabled: false,
        entryFeeCents: 0,
        planId: planProfile.planId ?? "free",
        accountType: planProfile.accountType ?? "user",
        createdAt: now,
        updatedAt: now
      };
      transaction.set(participantRef, participant);
      transaction.set(challengeRef, { participantCount: Number(challenge.participantCount ?? 0) + 1, updatedAt: now }, { merge: true });
      return { alreadyJoined: false, participant };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Challenge could not be joined.";
    if (message === "PREMIUM_REQUIRED") return fail("Premium membership is required to join this challenge.", 403, undefined, "PREMIUM_REQUIRED");
    if (message === "CREATOR_PRO_REQUIRED") return fail("Creator Pro is required to join this private or exclusive challenge.", 403, undefined, "CREATOR_PRO_REQUIRED");
    return fail(message, message === "Challenge not found." ? 404 : 409, undefined, message === "Challenge not found." ? "NOT_FOUND" : "CHALLENGE_JOIN_REJECTED");
  }

  void writeAuditLog({
    actorId: user.uid,
    actorType: "user",
    action: result.alreadyJoined ? "challenge.join_existing" : "challenge.entry_registered",
    targetType: "challenge",
    targetId: id,
    after: result.participant,
    metadata: { alreadyJoined: result.alreadyJoined }
  }, db).catch((error) => console.warn("[audit] challenge join audit failed", { challengeId: id, userId: user.uid, error: error instanceof Error ? error.message : "unknown" }));

  await createNotification(db, { userId: user.uid, type: "challenge_joined", title: "Challenge joined", body: result.alreadyJoined ? "You were already registered for this challenge." : "You successfully registered for the challenge.", targetId: id });
  return ok(result, result.alreadyJoined ? "You already joined this challenge." : "Challenge joined successfully.");
}
