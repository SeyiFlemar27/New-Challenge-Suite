import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { writeAuditLog } from "@/lib/server/audit";
import { createNotification } from "@/lib/server/notifications";
import { userOwnsChallenge } from "@/lib/server/challenge-access";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Entry request rejection");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const note = typeof parsed.body?.reason === "string" ? parsed.body.reason.trim().slice(0, 1000) : typeof parsed.body?.note === "string" ? parsed.body.note.trim().slice(0, 1000) : "";
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
    const update = { status: "rejected", rejectedAt: now, rejectedBy: user.uid, rejectionReason: note || null, updatedAt: now };
    transaction.set(requestRef, update, { merge: true });
    if (participantSnap.exists && ["paid", "confirmed"].includes(String(participantSnap.data()?.entryPaymentStatus ?? "").toLowerCase())) {
      transaction.set(participantRef, { status: "rejected", fullEntryGranted: false, refundStatus: "refund_review", refundExecutionEnabled: false, rejectedAt: now, updatedAt: now }, { merge: true });
      const entryPaymentId = String(participantSnap.data()?.entryPaymentId ?? "");
      if (entryPaymentId) transaction.set(db.collection("challengeEntryPayments").doc(entryPaymentId), { refundStatus: "refund_review", refundExecutionEnabled: false, reviewReason: "entry_request_rejected_after_confirmed_payment", updatedAt: now }, { merge: true });
    }
    return { entryRequest: { ...entryRequest, ...update } };
  });
  await writeAuditLog({ actorId: user.uid, actorType: "creator", action: "entry_request.rejected", targetType: "challenge", targetId: id, after: result.entryRequest }, db).catch(() => undefined);
  const participantUserId = String((result.entryRequest as Record<string, unknown>).userId ?? "");
  if (participantUserId) await createNotification(db, { userId: participantUserId, type: "entry_request_rejected", title: "Entry request declined", body: note || "Your challenge entry request was declined.", targetId: id });
  return ok(result, "Entry request rejected.");
}

