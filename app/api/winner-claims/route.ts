import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable, validationError } from "@/lib/server/responses";
import { writeCashTransactionPlaceholder } from "@/lib/server/cash-transactions";
import { createPayoutPlaceholder } from "@/lib/server/payouts";

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Winner claims");

  const formData = await request.formData();
  const identityDocument = formData.get("identityDocument");
  if (!(identityDocument instanceof File)) {
    return validationError({ identityDocument: "Identity document upload is required for review. Document storage and KYC processing are not active yet." });
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
  const challengeId = String(winner?.challengeId ?? submission?.challengeId ?? "");
  const ref = db.collection("winnerClaims").doc();
  const payoutRef = db.collection("payouts").doc();
  const claim = {
    id: ref.id,
    userId: user.uid,
    challengeId,
    submissionId,
    winnerId: winner?.id ?? null,
    status: "pending_review",
    reviewStatus: "pending_review",
    payoutStatus: "pending_review",
    payoutId: payoutRef.id,
    payoutProviderConnected: false,
    transferEnabled: false,
    identityDocumentStorageStatus: "not_processed",
    kycProcessingStatus: "not_active",
    identityDocumentName: identityDocument.name,
    identityDocumentPath: null,
    payoutMethod: null,
    taxAcknowledged: Boolean(formData.get("taxAcknowledged") === "true"),
    createdAt: now,
    updatedAt: now,
    reviewedBy: null,
    reviewedAt: null
  };
  const payout = createPayoutPlaceholder({
    id: payoutRef.id,
    userId: user.uid,
    challengeId,
    submissionId,
    winnerClaimId: ref.id,
    amountCents: 0,
    now
  });
  await Promise.all([
    ref.set(claim),
    payoutRef.set(payout),
    writeCashTransactionPlaceholder(db, {
      id: `winner-claim-${ref.id}-payout-review`,
      userId: user.uid,
      type: "payout_review_created",
      status: "pending_review",
      amountCents: 0,
      currency: "USD",
      sourceType: "winner_claim",
      sourceId: ref.id,
      challengeId,
      submissionId,
      winnerClaimId: ref.id,
      payoutId: payoutRef.id,
      description: "Winner claim payout review placeholder. No cash payout, transfer, or KYC processing is active yet.",
      now
    })
  ]);
  return ok({ claim, payout }, "Winner claim submitted for review. Payout processing is not active yet.");
}

