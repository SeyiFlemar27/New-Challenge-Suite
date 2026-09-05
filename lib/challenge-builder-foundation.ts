export const NORMAL_CHALLENGE_STEP_DEFINITIONS = [
  { key: "overview", navLabel: "Overview", title: "Overview", description: "Give people a clear reason to join and compete.", fields: ["title", "category", "subcategory", "shortDescription", "description", "challengeRules"], guide: ["Lead with one clear outcome.", "Use plain language participants can scan quickly.", "Add only rules that materially affect an entry."] },
  { key: "eligibility", navLabel: "Eligibility", title: "Eligibility", description: "Decide who can join and how participation is approved.", fields: ["participationMode", "locationEligibility", "eligibleCountries", "minimumAge", "maxParticipants", "waitlistEnabled", "hideParticipantList"], guide: ["Keep access broad unless the challenge genuinely needs restrictions.", "Approval is useful when every participant needs review.", "A blank capacity means there is no fixed limit."] },
  { key: "monetization", navLabel: "Monetization & Prize Pool", title: "Monetization & Prize Pool", description: "Set the guaranteed cash prize and optional challenge monetization.", fields: ["numberOfWinners", "winnerPrizeAmountsCents", "entryFeeAmountCents", "sponsorReady", "votingSettings"], guide: ["Placement amounts combine into the Base Prize.", "Confirmed creator funding goes directly to the prize pool.", "Sponsor funds remain separate from challenge-generated revenue."] },
  { key: "media", navLabel: "Media & Branding", title: "Media & Branding", description: "Build a clear gallery that helps people understand your challenge.", fields: ["challengeImages", "challengeVideo"], guide: ["Image 1 is the public cover.", "Use consistent, high-quality imagery.", "Video is optional and appears first in public galleries."] },
  { key: "schedule", navLabel: "Schedule", title: "Schedule", description: "Plan the Join, Submit, Vote, and Results lifecycle.", fields: ["timeZone", "registrationOpensAt", "registrationDeadline", "submissionStartAt", "submissionDeadline", "votingStartsAt", "votingDeadline", "winnerAnnouncementAt"], guide: ["Use one timezone for the whole challenge.", "Exact boundary transitions are allowed.", "Results appear only after the scheduled time and admin confirmation."] },
  { key: "submission", navLabel: "Entry & Submission", title: "Entry & Submission", description: "Explain exactly what participants need to submit.", fields: ["acceptedSubmissionTypes", "challengeGuidelines", "submissionRequirementsList", "fixAndResubmitEnabled"], guide: ["Keep instructions concise and testable.", "Choose only formats you can review.", "Correction windows begin only after an explicit request."] },
  { key: "review", navLabel: "Review", title: "Review Your Challenge", description: "Check your challenge before you continue.", fields: [], guide: ["Review every section as a participant would see it.", "Use Edit to return to any section that needs attention.", "Partial prize funding does not block admin review."] },
  { key: "publish", navLabel: "Publish", title: "Ready to Submit?", description: "Your challenge is complete. Submit it for review when you're ready.", fields: ["publishConfirmations"], guide: ["Submission sends the challenge to admin review.", "Editing pauses while review is in progress.", "You can resubmit if an admin requests changes."] }
] as const;

export const NORMAL_CHALLENGE_STEPS = NORMAL_CHALLENGE_STEP_DEFINITIONS.map((step) => step.navLabel) as readonly string[];
export const NORMAL_CHALLENGE_MAX_STEP = NORMAL_CHALLENGE_STEPS.length - 1;

export type BuilderChallengeType = "normal" | "private" | "tournament" | "live_event";
export type BuilderPlan = "free" | "creator" | "pro" | "host" | "enterprise";

export const CHALLENGE_TYPE_OPTIONS: Array<{ id: BuilderChallengeType; title: string; requirement: string }> = [
  { id: "normal", title: "Normal Challenge", requirement: "Available on every plan." },
  { id: "private", title: "Private Challenge", requirement: "Requires Creator plan or higher." },
  { id: "tournament", title: "Tournament Challenge", requirement: "Requires Creator or Host access." },
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
