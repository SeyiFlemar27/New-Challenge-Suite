export const challengeIntegritySources = [
  ["challengeParticipants", "challengeId", "participants"],
  ["submissions", "challengeId", "submissions"],
  ["votes", "challengeId", "votes"],
  ["challengeVotes", "challengeId", "votes"],
  ["challengeEntryPayments", "challengeId", "payments"],
  ["paidVotePurchases", "challengeId", "payments"],
  ["sponsorContributions", "challengeId", "sponsors"],
  ["creatorPrizeFundingPayments", "challengeId", "funding"],
  ["winnerProposals", "challengeId", "winners"],
  ["challengeReports", "challengeId", "reports"],
  ["appeals", "challengeId", "appeals"],
  ["challengeSettlements", "challengeId", "settlements"],
  ["cashLedger", "challengeId", "ledger"]
] as const;

export function challengeLifecycleActions(statusValue: unknown, activityFlags: string[]) {
  const status = String(statusValue ?? "draft").toLowerCase();
  const hardDeleteAllowed = activityFlags.length === 0 && ["draft", "incomplete", "pending_review", "rejected"].includes(status);
  const cancelAllowed = !["completed", "cancelled", "canceled", "deleted", "archived", "winners_announced"].includes(status);
  const archiveAllowed = ["completed", "cancelled", "canceled", "winners_announced", "voting_closed"].includes(status);
  return { hardDeleteAllowed, cancelAllowed, archiveAllowed, requestAdminDeletionAllowed: !hardDeleteAllowed && activityFlags.length > 0 };
}
