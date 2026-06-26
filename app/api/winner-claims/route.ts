import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable, validationError } from "@/lib/server/responses";

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Winner claims");

  const formData = await request.formData();
  const identityDocument = formData.get("identityDocument");
  if (!(identityDocument instanceof File)) {
    return validationError({ identityDocument: "Identity document upload is required." });
  }
  const submissionId = String(formData.get("submissionId") ?? "");
  if (!submissionId) return validationError({ submissionId: "Submission ID is required." });

  const [submissionSnap, winnerSnap] = await Promise.all([
    db.collection("submissions").doc(submissionId).get(),
    db.collection("winners").where("submissionId", "==", submissionId).limit(1).get()
  ]);
  const submission = submissionSnap.exists ? { id: submissionSnap.id, ...submissionSnap.data() } as Record<string, unknown> : null;
  const winner = !winnerSnap.empty ? { id: winnerSnap.docs[0].id, ...winnerSnap.docs[0].data() } as Record<string, unknown> : null;
  const ownsSubmission = submission?.userId === user.uid;
  const ownsWinner = winner?.userId === user.uid;
  if (!ownsSubmission && !ownsWinner) {
    return fail("Only the winning submission owner can submit this claim.", 403, undefined, "WINNER_CLAIM_FORBIDDEN");
  }
  const winnerStatus = String(winner?.status ?? submission?.status ?? "").toLowerCase();
  if (!winner && submission?.isWinner !== true && winnerStatus !== "winner") {
    return fail("This submission is not marked as a winner yet.", 409, undefined, "WINNER_NOT_VERIFIED");
  }

  const now = new Date().toISOString();
  const ref = db.collection("winnerClaims").doc();
  const claim = {
    id: ref.id,
    userId: user.uid,
    challengeId: String(winner?.challengeId ?? submission?.challengeId ?? ""),
    submissionId,
    winnerId: winner?.id ?? null,
    status: "pending_review",
    payoutStatus: "pending_review",
    identityDocumentName: identityDocument.name,
    identityDocumentPath: null,
    payoutMethod: null,
    taxAcknowledged: Boolean(formData.get("taxAcknowledged") === "true"),
    createdAt: now,
    updatedAt: now,
    reviewedBy: null,
    reviewedAt: null
  };
  await ref.set(claim);
  return ok({ claim }, "Winner claim submitted for review.");
}

