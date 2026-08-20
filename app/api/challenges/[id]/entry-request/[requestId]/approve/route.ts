import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { writeAuditLog } from "@/lib/server/audit";
import { createNotification } from "@/lib/server/notifications";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { isPaidEntryChallenge } from "@/lib/server/monetization-payments";
import { resolveParticipantStatus } from "@/lib/server/submission-lifecycle";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Entry request approval");
  const { id, requestId } = await params;
  const now = new Date().toISOString();
  try {
  const result = await db.runTransaction(async (transaction) => {
    const challengeRef = db.collection("challenges").doc(id);
    const requestRef = db.collection("challengeEntryRequests").doc(requestId);
    const participantRef = db.collection("challengeParticipants").doc(requestId);
    const [challengeSnap, requestSnap, participantSnap] = await Promise.all([transaction.get(challengeRef), transaction.get(requestRef), transaction.get(participantRef)]);
    if (!challengeSnap.exists) throw new Error("CHALLENGE_NOT_FOUND");
    if (!requestSnap.exists) throw new Error("ENTRY_REQUEST_NOT_FOUND");
    const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
    const entryRequest = { id: requestSnap.id, ...requestSnap.data() } as Record<string, unknown>;
    if (!user.isAdmin && !userOwnsChallenge(challenge, user.uid)) throw new Error("PERMISSION_DENIED");
    if (String(entryRequest.challengeId) !== id) throw new Error("ENTRY_REQUEST_MISMATCH");
    if (String(entryRequest.status) === "approved") return { entryRequest, duplicate: true };
    const participantId = `${id}_${entryRequest.userId}`;
    const maxParticipants = Math.trunc(Number(challenge.maxParticipants ?? challenge.participantLimit ?? 0) || 0);
    const participantCount = Math.max(0, Math.trunc(Number(challenge.participantCount ?? 0) || 0));
    if (maxParticipants > 0 && participantCount >= maxParticipants && !participantSnap.exists) throw new Error("CHALLENGE_CAPACITY_FULL");
    const paid = isPaidEntryChallenge(challenge);
    const paidParticipant = paid ? (participantSnap.exists ? participantSnap.data() ?? {} : null) : null;
    if (paid && (!paidParticipant || !["paid", "confirmed"].includes(String(paidParticipant.entryPaymentStatus ?? "").toLowerCase()))) throw new Error("PAYMENT_CONFIRMATION_REQUIRED");
    const update = paid ? {
      status: "approved",
      approvedAt: now,
      approvedBy: user.uid,
      paymentWindowStatus: "confirmed",
      paymentDeadline: null,
      participantId,
      updatedAt: now
    } : {
      status: "approved",
      approvedAt: now,
      approvedBy: user.uid,
      paymentWindowStatus: "not_required",
      participantId,
      updatedAt: now
    };
    transaction.set(requestRef, update, { merge: true });
    if (paid) {
      transaction.set(participantRef, {
        status: "active",
        fullEntryGranted: true,
        entryRequestId: requestId,
        approvedAt: now,
        approvedBy: user.uid,
        updatedAt: now
      }, { merge: true });
    } else {
      transaction.set(db.collection("challengeParticipants").doc(participantId), {
        id: participantId,
        challengeId: id,
        userId: entryRequest.userId,
        status: resolveParticipantStatus({ ...challenge, requiresParticipantApproval: false }),
        entryRequestId: requestId,
        entryAgreementAccepted: true,
        entryAgreementAcceptedAt: entryRequest.entryAgreementAcceptedAt ?? now,
        joinedAt: now,
        registeredAt: now,
        createdAt: now,
        updatedAt: now
      }, { merge: true });
      transaction.set(challengeRef, { participantCount: Number(challenge.participantCount ?? 0) + 1, updatedAt: now }, { merge: true });
    }
    return { entryRequest: { ...entryRequest, ...update }, duplicate: false };
  });
  await writeAuditLog({ actorId: user.uid, actorType: "creator", action: "entry_request.approved", targetType: "challenge", targetId: id, after: result.entryRequest, metadata: { duplicate: result.duplicate } }, db).catch(() => undefined);
  const participantUserId = String(result.entryRequest.userId ?? "");
  if (participantUserId) await createNotification(db, { userId: participantUserId, type: "entry_request_approved", title: "Entry request approved", body: "Your challenge entry request was approved.", entityType: "challenge", entityId: id, targetId: id, actionUrl: `/challenges/${id}`, metadata: { challengeId: id, requestId } });
  return ok(result, "Entry request approved.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CHALLENGE_NOT_FOUND") return fail("Challenge not found.", 404, undefined, code);
    if (code === "ENTRY_REQUEST_NOT_FOUND") return fail("Entry request not found.", 404, undefined, code);
    if (code === "PERMISSION_DENIED") return fail("Only the challenge owner or an admin can approve this request.", 403, undefined, code);
    if (code === "ENTRY_REQUEST_MISMATCH") return fail("This request does not belong to the selected challenge.", 409, undefined, code);
    if (code === "PAYMENT_CONFIRMATION_REQUIRED") return fail("Payment must be confirmed before this request can be approved.", 409, undefined, code);
    if (code === "CHALLENGE_CAPACITY_FULL") return fail("This challenge has reached capacity. The request remains pending until you decide what to do next.", 409, { requestStatus: "pending" }, code);
    return serverError("Entry request could not be approved.", code);
  }
}
