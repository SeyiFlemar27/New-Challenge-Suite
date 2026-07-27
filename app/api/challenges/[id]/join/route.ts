import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { createNotification } from "@/lib/server/notifications";
import { ok, serverUnavailable, fail, readJson, validationError } from "@/lib/server/responses";
import { canAccessChallenge } from "@/lib/plan-access";
import { writeAuditLog } from "@/lib/server/audit";
import { isPrivateChallengeRecord, userOwnsChallenge } from "@/lib/server/challenge-access";
import {
  isChallengeJoinable,
  isSponsorProfile,
  normalizeParticipantStatus,
  resolveParticipantStatus
} from "@/lib/server/submission-lifecycle";
import { isPaidEntryChallenge } from "@/lib/server/monetization-payments";

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
      const accessRef = db.collection("privateChallengeAccess").doc(`${id}_${user.uid}`);
      const [challengeSnap, participantSnap, accessSnap] = await Promise.all([
        transaction.get(challengeRef),
        transaction.get(participantRef),
        transaction.get(accessRef)
      ]);
      if (!challengeSnap.exists) throw new Error("Challenge not found.");
      const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
      const privateOnly = isPrivateChallengeRecord(challenge);
      const isOwner = userOwnsChallenge(challenge, user.uid);
      if (isOwner) throw new Error("SELF_ENTRY_NOT_ALLOWED");
      const manualApproval = challenge.participantApprovalMode === "manual" || challenge.requiresParticipantApproval === true || challenge.privateApprovalRequired === true;
      if (manualApproval) throw new Error("ENTRY_REQUEST_REQUIRED");
      const hasAccessGrant = accessSnap.exists && accessSnap.data()?.status === "approved";
      if (privateOnly && !hasAccessGrant) throw new Error("PRIVATE_INVITE_REQUIRED");
      const accessChallenge = privateOnly && hasAccessGrant ? { ...challenge, visibility: "public" } : challenge;
      const access = canAccessChallenge(planProfile, accessChallenge);
      if (!access.allowed) throw new Error(access.code ?? "PREMIUM_REQUIRED");
      const joinable = isChallengeJoinable(challenge);
      if (!joinable.allowed) throw new Error(joinable.reason ?? "Registration is closed for this challenge.");
      const paidEntry = isPaidEntryChallenge(challenge);

      const now = new Date().toISOString();
      if (participantSnap.exists) {
        const current = participantSnap.data() ?? {};
        if (paidEntry && !["paid", "confirmed"].includes(String(current.entryPaymentStatus ?? ""))) throw new Error("PAID_ENTRY_PAYMENT_REQUIRED");
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

      if (paidEntry) throw new Error("PAID_ENTRY_PAYMENT_REQUIRED");
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
    if (message === "PRIVATE_INVITE_REQUIRED") return fail("A valid private challenge invite or approval is required.", 403, { redirectTo: "/private-exclusive" }, "PRIVATE_INVITE_REQUIRED");
    if (message === "SELF_ENTRY_NOT_ALLOWED") return fail("Creators and hosts cannot compete in their own challenge.", 403, undefined, "SELF_ENTRY_NOT_ALLOWED");
    if (message === "ENTRY_REQUEST_REQUIRED") return fail("Request entry before joining this challenge.", 409, { action: "request_entry", requestUrl: `/api/challenges/${id}/entry-request` }, "ENTRY_REQUEST_REQUIRED");
    if (message === "PAID_ENTRY_PAYMENT_REQUIRED") return fail("Entry fee payment is required before submitting to this challenge.", 402, { checkoutUrl: `/api/challenges/${id}/entry-checkout`, challengePath: `/challenges/${id}`, action: "pay_entry_fee" }, "PAID_ENTRY_PAYMENT_REQUIRED");
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

