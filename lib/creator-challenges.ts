export const CREATOR_CHALLENGE_TABS = ["active", "pending_review", "requires_changes", "scheduled", "drafts", "completed", "cancelled"] as const;
export type CreatorChallengeTab = (typeof CREATOR_CHALLENGE_TABS)[number];

export const CREATOR_CHALLENGE_TAB_LABELS: Record<CreatorChallengeTab, string> = {
  active: "Active",
  pending_review: "Pending Review",
  requires_changes: "Requires Changes",
  scheduled: "Scheduled",
  drafts: "Drafts",
  completed: "Completed",
  cancelled: "Cancelled"
};

export function creatorChallengeTab(challenge: Record<string, unknown>): CreatorChallengeTab {
  const status = String(challenge.status ?? challenge.lifecycleStatus ?? "draft").trim().toLowerCase();
  if (["pending_review", "submitted", "in_review"].includes(status)) return "pending_review";
  if (["changes_requested", "revision_requested", "review_changes_requested"].includes(status)) return "requires_changes";
  if (["scheduled", "registration_not_open", "upcoming"].includes(status)) return "scheduled";
  if (["completed", "winners_announced", "results_published"].includes(status)) return "completed";
  if (["cancelled", "canceled", "archived", "deleted"].includes(status)) return "cancelled";
  if (status === "draft") return "drafts";
  return "active";
}

export function creatorChallengeCounts(challenges: Record<string, unknown>[]) {
  return Object.fromEntries(CREATOR_CHALLENGE_TABS.map((tab) => [tab, challenges.filter((challenge) => creatorChallengeTab(challenge) === tab).length])) as Record<CreatorChallengeTab, number>;
}
