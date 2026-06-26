export type RefundStatus = "requested" | "pending_review" | "approved_placeholder" | "rejected" | "cancelled";

export type RefundFoundation = {
  id: string;
  userId: string;
  sourceType: "dorocoin_purchase" | "subscription" | "sponsorship" | "manual_review";
  sourceId: string;
  status: RefundStatus;
  amountCents: number;
  currency: string;
  automaticRefundEnabled: false;
  transferEnabled: false;
  createdAt: string;
  updatedAt: string;
};

export function createRefundPlaceholder(input: { id: string; userId: string; sourceType: RefundFoundation["sourceType"]; sourceId: string; amountCents?: number; currency?: string; now?: string; status?: RefundStatus }): RefundFoundation {
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id,
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    status: input.status ?? "pending_review",
    amountCents: Number(input.amountCents ?? 0),
    currency: input.currency ?? "USD",
    automaticRefundEnabled: false,
    transferEnabled: false,
    createdAt: now,
    updatedAt: now
  };
}

export function areAutomaticRefundsEnabled() {
  return false;
}
