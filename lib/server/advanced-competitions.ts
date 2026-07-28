export const HYBRID_STAGE_ORDER = ["online_qualification", "shortlist", "final_round", "admin_review", "completed"] as const;
export type HybridStage = typeof HYBRID_STAGE_ORDER[number];

function text(value: unknown) { return String(value ?? "").trim(); }

export function evaluateHybridStageTransition(input: {
  currentStage: unknown;
  nextStage: unknown;
  eligibleSubmissionCount?: number;
  finalistCount?: number;
  finalResultCount?: number;
  winnersReviewed?: boolean;
  actorAuthorized?: boolean;
}) {
  const current = (HYBRID_STAGE_ORDER.includes(text(input.currentStage) as HybridStage) ? text(input.currentStage) : "online_qualification") as HybridStage;
  const next = text(input.nextStage) as HybridStage;
  if (!input.actorAuthorized) return { allowed: false, code: "HYBRID_MANAGER_REQUIRED", current, next };
  if (!HYBRID_STAGE_ORDER.includes(next)) return { allowed: false, code: "HYBRID_STAGE_INVALID", current, next };
  if (HYBRID_STAGE_ORDER.indexOf(next) !== HYBRID_STAGE_ORDER.indexOf(current) + 1) return { allowed: false, code: "HYBRID_STAGE_ORDER_INVALID", current, next };
  if (next === "shortlist" && Number(input.eligibleSubmissionCount ?? 0) < 1) return { allowed: false, code: "ELIGIBLE_SUBMISSIONS_REQUIRED", current, next };
  if (next === "final_round" && Number(input.finalistCount ?? 0) < 1) return { allowed: false, code: "FINALISTS_REQUIRED", current, next };
  if (next === "admin_review" && Number(input.finalResultCount ?? 0) < 1) return { allowed: false, code: "FINAL_RESULTS_REQUIRED", current, next };
  if (next === "completed" && input.winnersReviewed !== true) return { allowed: false, code: "WINNER_REVIEW_REQUIRED", current, next };
  return { allowed: true, code: "HYBRID_STAGE_TRANSITION_ALLOWED", current, next };
}

export function advancedCompetitionDetailRoute(record: Record<string, unknown>) {
  const id = text(record.id);
  const type = text(record.type ?? record.competitionType).toLowerCase();
  if (type.includes("tournament")) return `/tournaments/${id}`;
  if (record.isLiveEvent === true || type.includes("live event")) return record.challengeId ? `/challenges/${text(record.challengeId)}` : `/live-events/${id}/register`;
  return `/challenges/${id}`;
}