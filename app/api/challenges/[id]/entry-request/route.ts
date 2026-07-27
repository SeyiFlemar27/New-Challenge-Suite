import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { writeAuditLog } from "@/lib/server/audit";
import { createNotification } from "@/lib/server/notifications";
import { challengeForPlanAccess, userOwnsChallenge } from "@/lib/server/challenge-access";
import { evaluateChallengeEligibility } from "@/lib/server/challenge-viewer-state";
import { isPaidEntryChallenge } from "@/lib/server/monetization-payments";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Entry request");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = (parsed.body ?? {}) as Record<string, unknown>;
  if (body.entryAgreementAccepted !== true) return validationError({ entryAgreementAccepted: "Accept the challenge rules before requesting entry." });
  const { id } = await params;
  const [challengeSnap, accountSnap, profileSnap, participantSnap, existingRequestSnap] = await Promise.all([
    db.collection("challenges").doc(id).get(),
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get(),
    db.collection("challengeParticipants").doc(`${id}_${user.uid}`).get(),
    db.collection("challengeEntryRequests").doc(`${id}_${user.uid}`).get()
  ]);
  if (!challengeSnap.exists) return fail("Challenge not found.", 404, undefined, "CHALLENGE_NOT_FOUND");
  const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
  const profile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) };
  const accessContext = await challengeForPlanAccess(db, challenge, user.uid);
  const eligibility = evaluateChallengeEligibility({ challenge: accessContext.challenge, userId: user.uid, profile, participant: participantSnap.exists ? participantSnap.data() ?? {} : null, hasPrivateAccess: accessContext.hasAccessGrant });
  if (!eligibility.eligible) return fail(eligibility.blockers[0]?.message ?? "You are not eligible to request entry.", 403, { blockers: eligibility.blockers }, eligibility.blockers[0]?.code ?? "NOT_ELIGIBLE");
  if (userOwnsChallenge(challenge, user.uid)) return fail("Creators and hosts cannot compete in their own challenge.", 403, undefined, "SELF_ENTRY_NOT_ALLOWED");
  if (participantSnap.exists) return fail("You already joined this challenge.", 409, undefined, "ALREADY_JOINED");
  const manual = challenge.participantApprovalMode === "manual" || challenge.requiresParticipantApproval === true || challenge.privateApprovalRequired === true;
  if (!manual) return fail("This challenge uses automatic entry. Join directly instead.", 409, { action: isPaidEntryChallenge(challenge) ? "pay_entry_fee" : "join" }, "ENTRY_REQUEST_NOT_REQUIRED");
  const now = new Date().toISOString();
  const requestId = `${id}_${user.uid}`;
  const requestRecord = {
    id: requestId,
    challengeId: id,
    userId: user.uid,
    status: existingRequestSnap.exists && existingRequestSnap.data()?.status === "approved" ? "approved" : "pending",
    entryAgreementAccepted: true,
    entryAgreementAcceptedAt: now,
    paidEntryRequired: isPaidEntryChallenge(challenge),
    paymentWindowStatus: "not_started",
    paymentDeadline: null,
    createdAt: existingRequestSnap.data()?.createdAt ?? now,
    updatedAt: now
  };
  await db.collection("challengeEntryRequests").doc(requestId).set(requestRecord, { merge: true });
  await writeAuditLog({ actorId: user.uid, actorType: "user", action: "entry_request.created", targetType: "challenge", targetId: id, after: requestRecord, metadata: { manualApproval: true } }, db).catch(() => undefined);
  const creatorId = String(challenge.creatorId ?? challenge.ownerId ?? "");
  if (creatorId) await createNotification(db, { userId: creatorId, type: "entry_request_created", title: "Entry request received", body: "A participant requested access to your challenge.", targetId: id });
  return ok({ entryRequest: requestRecord }, "Entry request submitted.");
}
