export const FREE_BASIC_CHALLENGE_LIFETIME_LIMIT = 3;

const COUNTED_FREE_STATUSES = new Set([
  "published",
  "scheduled",
  "active",
  "registration_open",
  "submission_open",
  "voting_open",
  "voting_closed",
  "winners_announced",
  "completed",
  "pending_review"
]);

export function isCountedFreeBasicChallenge(data: Record<string, unknown>) {
  const creatorPlanId = String(data.creatorPlanId ?? data.planId ?? "free").toLowerCase();
  const status = String(data.status ?? data.lifecycleStatus ?? "").toLowerCase();
  return creatorPlanId === "free"
    && COUNTED_FREE_STATUSES.has(status)
    && data.freeBasicChallenge === true;
}

export function freeBasicUsage(challenges: Array<{ data(): FirebaseFirestore.DocumentData }>) {
  return challenges.filter((doc) => isCountedFreeBasicChallenge(doc.data())).length;
}

export function freeBasicRemaining(used: number) {
  return Math.max(0, FREE_BASIC_CHALLENGE_LIFETIME_LIMIT - used);
}

export function freeBasicLimitMessage(used: number) {
  return `Free Basic Challenges Used: ${used} of ${FREE_BASIC_CHALLENGE_LIFETIME_LIMIT}`;
}
