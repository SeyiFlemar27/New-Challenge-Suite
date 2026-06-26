export type PayoutStatus = "pending_review" | "needs_info" | "approved_placeholder" | "blocked" | "cancelled";
export type PayoutReleaseStatus = "not_active";

export type PayoutFoundation = {
  id: string;
  userId: string;
  challengeId?: string | null;
  submissionId?: string | null;
  winnerClaimId?: string | null;
  sourceType: "winner_claim" | "manual_review";
  sourceId: string;
  status: PayoutStatus;
  reviewStatus: "pending_review";
  releaseStatus: PayoutReleaseStatus;
  amountCents: number;
  currency: string;
  payoutProviderConnected: false;
  transferEnabled: false;
  createdAt: string;
  updatedAt: string;
};

export function createPayoutPlaceholder(input: { id: string; userId: string; challengeId?: string | null; submissionId?: string | null; winnerClaimId?: string | null; amountCents?: number; currency?: string; now?: string; sourceType?: "winner_claim" | "manual_review"; sourceId?: string }): PayoutFoundation {
  const now = input.now ?? new Date().toISOString();
  const sourceId = input.sourceId ?? input.winnerClaimId ?? input.id;
  return {
    id: input.id,
    userId: input.userId,
    challengeId: input.challengeId ?? null,
    submissionId: input.submissionId ?? null,
    winnerClaimId: input.winnerClaimId ?? null,
    sourceType: input.sourceType ?? "winner_claim",
    sourceId,
    status: "pending_review",
    reviewStatus: "pending_review",
    releaseStatus: "not_active",
    amountCents: Number(input.amountCents ?? 0),
    currency: input.currency ?? "USD",
    payoutProviderConnected: false,
    transferEnabled: false,
    createdAt: now,
    updatedAt: now
  };
}

export function arePayoutTransfersEnabled() {
  return false;
}
