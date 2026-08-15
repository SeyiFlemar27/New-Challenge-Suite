import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
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
  if (participantUserId) await createNotification(db, { userId: participantUserId, type: "entry_request_approved", title: "Entry request approved", body: "Your challenge entry request was approved.", targetId: id });
  return ok(result, "Entry request approved.");
}
