export const NORMAL_CHALLENGE_STEPS = [
  "Overview",
  "Eligibility",
  "Monetization & Prize Pool",
  "Media & Branding",
  "Schedule",
  "Entry & Submission",
  "Review",
  "Publish"
] as const;
export const NORMAL_CHALLENGE_MAX_STEP = NORMAL_CHALLENGE_STEPS.length - 1;

export type BuilderChallengeType = "normal" | "private" | "tournament" | "live_event";
export type BuilderPlan = "free" | "creator" | "pro" | "host" | "enterprise";

export const CHALLENGE_TYPE_OPTIONS: Array<{ id: BuilderChallengeType; title: string; requirement: string }> = [
  { id: "normal", title: "Normal Challenge", requirement: "Available on every plan." },
  { id: "private", title: "Private Challenge", requirement: "Requires Creator plan or higher." },
  { id: "tournament", title: "Tournament Challenge", requirement: "Requires Pro plan or higher." },
  { id: "live_event", title: "Live Event Challenge", requirement: "Requires Host plan or Enterprise." }
];

export const CHALLENGE_DRAFT_LIMITS: Record<BuilderPlan, number> = {
  free: 3,
  creator: 8,
  pro: 16,
  host: 16,
  enterprise: 16
};

const planRank: Record<BuilderPlan, number> = { free: 0, creator: 1, pro: 2, host: 3, enterprise: 4 };
const requiredPlan: Record<BuilderChallengeType, BuilderPlan> = { normal: "free", private: "creator", tournament: "pro", live_event: "host" };

export function normalizeBuilderPlan(value: unknown): BuilderPlan {
  const plan = String(value ?? "free").toLowerCase();
  return plan === "creator" || plan === "pro" || plan === "host" || plan === "enterprise" ? plan : "free";
}

export function canCreateBuilderType(planValue: unknown, type: BuilderChallengeType) {
  const plan = normalizeBuilderPlan(planValue);
  return type === "live_event" ? plan === "host" || plan === "enterprise" : planRank[plan] >= planRank[requiredPlan[type]];
}

export function draftLimitForPlan(planValue: unknown) {
  return CHALLENGE_DRAFT_LIMITS[normalizeBuilderPlan(planValue)];
}

export function normalizeBuilderChallengeType(value: unknown): BuilderChallengeType {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("private") || text.includes("exclusive")) return "private";
  if (text.includes("tournament") || text.includes("bracket")) return "tournament";
  if (text.includes("live") || text.includes("event")) return "live_event";
  return "normal";
}

export const UNFINISHED_DRAFT_STATUSES = new Set(["draft", "incomplete", "requires_changes", "needs_info", "changes_requested", "rejected"]);

export function isUnfinishedChallengeDraft(record: Record<string, unknown>) {
  const status = String(record.status ?? record.lifecycleStatus ?? "draft").toLowerCase();
  return UNFINISHED_DRAFT_STATUSES.has(status) && !record.deletedAt && record.draftDeleted !== true;
}

export function inferLegacyMaxUnlockedStep(challenge: Record<string, unknown>) {
  const stored = Number(challenge.maxUnlockedStep ?? challenge.creationStep);
  if (Number.isFinite(stored)) return Math.max(1, Math.min(NORMAL_CHALLENGE_MAX_STEP, Math.trunc(stored)));
  return 1;
}

export function normalizeNormalChallengeStep(
  value: unknown,
  readiness: { ready: boolean; nextRequiredStep: number }
) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 0 && parsed <= NORMAL_CHALLENGE_MAX_STEP) return parsed;
  if (readiness.ready) return NORMAL_CHALLENGE_MAX_STEP;
  const nextRequiredStep = Number(readiness.nextRequiredStep);
  return Number.isInteger(nextRequiredStep) && nextRequiredStep >= 0 && nextRequiredStep < NORMAL_CHALLENGE_MAX_STEP
    ? nextRequiredStep
    : 0;
}
