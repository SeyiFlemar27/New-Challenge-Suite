import { createHash } from "crypto";

export const PENDING_ACCOUNT_DELETION_STATUSES = new Set(["deletion_requested", "deactivated", "scheduled_for_deletion"]);
export const FINAL_ACCOUNT_DELETION_STATUSES = new Set(["deleted", "anonymized"]);

export const accountHistorySources = [
  ["cashLedger", "userId", "walletHistory"],
  ["walletTransactions", "userId", "walletHistory"],
  ["challengeEntryPayments", "userId", "paymentHistory"],
  ["paidVotePurchases", "userId", "paymentHistory"],
  ["doroCoinPurchases", "userId", "paymentHistory"],
  ["withdrawalRequests", "userId", "withdrawalHistory"],
  ["kycRecords", "userId", "kycHistory"],
  ["challenges", "creatorId", "challengeHistory"],
  ["challengeParticipants", "userId", "challengeHistory"],
  ["submissions", "userId", "challengeHistory"],
  ["sponsorContributions", "sponsorId", "sponsorHistory"],
  ["sponsorProfiles", "userId", "sponsorHistory"],
  ["challengeSettlements", "userId", "settlementAuditHistory"],
  ["creatorEarnings", "userId", "creatorHistory"],
  ["challengeReports", "userId", "disputeAppealHistory"],
  ["appeals", "userId", "disputeAppealHistory"],
  ["safetyEnforcements", "userId", "safetyHistory"],
  ["auditLogs", "targetId", "settlementAuditHistory"]
] as const;

export type AccountHistoryFlag = typeof accountHistorySources[number][2];

export function normalizeAccountDeletionStatus(value: unknown) {
  const status = String(value ?? "active").toLowerCase();
  if (PENDING_ACCOUNT_DELETION_STATUSES.has(status) || FINAL_ACCOUNT_DELETION_STATUSES.has(status)) return status;
  if (["deactivated_pending_privacy_review", "pending_deletion", "deletion_pending"].includes(status)) return "deletion_requested";
  return "active";
}

export function normalizedEmailHash(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function seriousEnforcementState(record: Record<string, unknown>) {
  const value = [record.accountStatus, record.enforcementStatus, record.safetyStatus, record.banStatus].map((item) => String(item ?? "").toLowerCase()).join(" ");
  return /banned|suspended|fraud|chargeback_abuse|payment_abuse|safety_abuse|platform_ban/.test(value);
}

export function historyFlagsFromSnapshots(snapshots: Array<{ empty: boolean }>, account: Record<string, unknown>) {
  const flags = new Set<AccountHistoryFlag>();
  snapshots.forEach((snapshot, index) => { if (!snapshot.empty) flags.add(accountHistorySources[index][2]); });
  const kycStatus = String(account.kycStatus ?? "").toLowerCase();
  if (!['', 'not_started', 'not_required', 'provider_not_configured'].includes(kycStatus) || account.sumsubApplicantId) flags.add("kycHistory");
  if ([account.providerCustomerId, account.stripeCustomerId, account.subscriptionId, account.stripeSubscriptionId].some(Boolean)) flags.add("paymentHistory");
  if (account.payoutAccount && typeof account.payoutAccount === "object" && Object.keys(account.payoutAccount as object).length) flags.add("withdrawalHistory");
  if (seriousEnforcementState(account)) flags.add("safetyHistory");
  return [...flags];
}
