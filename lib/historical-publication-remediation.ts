import { publicationSafetyHold, withPublishingDefaults } from "@/lib/publishing-policy";
import { validateChallengeForPublish } from "@/lib/server/challenge-validation";
import { validateTournamentFoundation } from "@/lib/server/tournament-validation";
import { evaluateTournamentReadiness } from "@/lib/server/tournaments";

/** Read-only candidate assessment. An exported verification record is never permission to publish. */
export function assessHistoricalPublication(input: { id: string; source: "challenges" | "tournaments"; record: Record<string, unknown>; account?: Record<string, unknown> }, now = new Date()) {
  const record = input.record, reasons: string[] = [];
  if (record.status !== "pending_review") reasons.push("NOT_HISTORICAL_PENDING_REVIEW");
  const safety = publicationSafetyHold(input.account ?? {}, record);
  if (safety) reasons.push(safety);
  if (record.flagged === true || record.suspiciousActivity === true || record.suspectedFraud === true || record.financialRestriction || record.settlementRestricted === true || record.stripeDisputeRestricted === true) reasons.push("EXISTING_SAFETY_OR_FINANCIAL_EXCEPTION");
  if (!input.account) reasons.push("ACCOUNT_REVALIDATION_REQUIRED");
  const candidate = withPublishingDefaults(record);
  if (input.source === "tournaments") {
    const validation = validateTournamentFoundation(candidate, { publish: true, ownerId: String(record.hostId), validateMedia: true });
    reasons.push(...validation.errors.map(issue => `FIELD:${issue.field}`));
    if (!evaluateTournamentReadiness(candidate).ready) reasons.push("TOURNAMENT_CONFIGURATION_REQUIRED");
    if (!record.creatorMediaVerification) reasons.push("MANDATORY_MEDIA_VERIFICATION_MISSING");
  } else {
    reasons.push(...validateChallengeForPublish({ ...candidate, id: input.id }, { now, userId: String(record.creatorId ?? record.hostId) }).errors.filter(issue => issue.severity === "error").map(issue => issue.code));
    if ((record.mediaVerification as Record<string, unknown> | undefined)?.status !== "verified") reasons.push("MANDATORY_MEDIA_VERIFICATION_MISSING");
  }
  const requiredCents = input.source === "tournaments" ? Number(record.basePrizeAmountMinor ?? 0) : record.prizeType === "money" ? Math.round(Number(record.prizeValue ?? 0) * 100) : 0;
  if (!Number.isSafeInteger(requiredCents) || requiredCents < 0) reasons.push("BASE_PRIZE_INVALID");
  const confirmed = Number(record.confirmedCreatorPrizeFundingCents ?? 0);
  if (requiredCents > confirmed) reasons.push("CREATOR_FUNDING_RECONCILIATION_REQUIRED");
  return { id: input.id, source: input.source, result: reasons.length ? "needs_attention" : "candidate_for_revalidation", reasons: [...new Set(reasons)], publishable: false, nextStep: "Freshly verify stored media, current permissions, actual provider-confirmed funding and record version through the shared publication policy before any separately authorized apply operation." };
}
