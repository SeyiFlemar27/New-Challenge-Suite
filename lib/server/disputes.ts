export type DisputeStatus = "open" | "reviewing" | "resolved" | "dismissed";

export type DisputeFoundation = {
  id: string;
  userId: string;
  targetType: "challenge" | "submission" | "vote" | "sponsorship" | "wallet" | "payout" | "other";
  targetId: string;
  status: DisputeStatus;
  reason: string;
  resolutionEnabled: false;
  adminUiEnabled: false;
  createdAt: string;
  updatedAt: string;
};

export function createDisputePlaceholder(input: { id: string; userId: string; targetType: DisputeFoundation["targetType"]; targetId: string; reason: string; now?: string; status?: DisputeStatus }): DisputeFoundation {
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id,
    userId: input.userId,
    targetType: input.targetType,
    targetId: input.targetId,
    status: input.status ?? "open",
    reason: input.reason,
    resolutionEnabled: false,
    adminUiEnabled: false,
    createdAt: now,
    updatedAt: now
  };
}
