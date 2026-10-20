import { NORMAL_CHALLENGE_STEP_DEFINITIONS } from "@/lib/challenge-builder-foundation";
import { getNormalChallengeReadiness, normalChallengeSubmitIssue, type NormalChallengeIssue, type NormalChallengeReadiness } from "@/lib/normal-challenge-readiness";
import { normalChallengePayload, type NormalChallengeForm } from "@/lib/normal-challenge-builder-model";

// The API still stores eight-step positions. Keep that wire contract unchanged.
export const NORMAL_FRONTEND_SERVER_STEPS = [0, 2, 3, 4, 5, 6, 7] as const;
export const NORMAL_FRONTEND_STEPS = NORMAL_FRONTEND_SERVER_STEPS.map((position) => {
  const definition = NORMAL_CHALLENGE_STEP_DEFINITIONS[position];
  return {
    ...definition,
    fields: definition.key === "monetization" ? definition.fields.filter((field) => field !== "votingSettings")
      : definition.key === "submission" ? [...definition.fields, "votingSettings"] : definition.fields,
    description: definition.key === "publish" ? "Check the essential requirements, then publish."
      : definition.key === "monetization" ? "Choose an optional Base Prize and plan-eligible monetization." : definition.description,
    guide: definition.key === "review"
      ? ["Review every section before publishing.", "A positive Base Prize must be fully creator-funded before publishing.", "Unconfirmed sponsor interest and projected revenue are not prize funds."]
      : definition.key === "monetization"
        ? ["Base Prize funding is optional; a positive guarantee must be fully confirmed before publishing.", "Only confirmed creator or authorized owner funding satisfies your Base Prize.", "Sponsor prize funds remain separate and do not replace your obligation."]
      : definition.key === "submission"
        ? ["Instructions are optional in this form.", "Choose the submission format and supported voting configuration.", "Publish explains any remaining server-policy requirements."]
        : definition.guide
  };
});
export type NormalFrontendStepKey = typeof NORMAL_FRONTEND_STEPS[number]["key"];
export function normalStepIndex(key: NormalFrontendStepKey) { return NORMAL_FRONTEND_STEPS.findIndex((step) => step.key === key); }
export function normalServerStep(position: number) { return NORMAL_FRONTEND_SERVER_STEPS[position] ?? 0; }
export function normalRestoredStep(value: unknown) {
  const position = Number(value);
  if (!Number.isInteger(position)) return 0;
  return Math.max(0, NORMAL_FRONTEND_SERVER_STEPS.indexOf(position as typeof NORMAL_FRONTEND_SERVER_STEPS[number]));
}

// UI-only optional fields cannot unlock the older API's validation boundary.
// Save all edits at an allowed wire position; publication still uses strict validation.
export function normalFrontendDraftProgress(payload: Record<string, unknown>, position: number, unlocked: number, authoritative: Record<string, unknown> | null) {
  const optionalBoundary = getNormalChallengeReadiness({ ...authoritative, ...payload }).issues
    .filter((issue) => issue.step === 1 || issue.code === "SUBMISSION_INSTRUCTIONS_REQUIRED" || (issue.code === "PRIZE_AMOUNTS_INVALID" && Number(payload.prizeValue) === 0))
    .reduce((boundary, issue) => Math.min(boundary, issue.step), 7);
  const stored = Number(authoritative?.maxUnlockedStep ?? authoritative?.creationStep ?? 1);
  const serverBoundary = Math.min(optionalBoundary, Number.isInteger(stored) && stored >= 0 && stored <= 7 ? stored + 1 : 1);
  return { builderCurrentStep: Math.min(normalServerStep(position), serverBoundary), maxUnlockedStep: Math.min(normalServerStep(Math.max(position, unlocked)), serverBoundary) };
}

export function normalFrontendPayload(form: NormalChallengeForm, id = "", authoritative: Record<string, unknown> | null = null) {
  const payload: Record<string, unknown> = { ...normalChallengePayload(form, id) };
  // Removed controls are omitted from PATCHes, preserving existing server records.
  const preservedParticipation = ["participationMode", "requiresParticipantApproval", "participantApprovalMode", "locationEligibility", "eligibleCountries", "eligibleCountry", "ageRestrictionMode", "minimumAge", "capacityMode", "maxParticipants", "waitlistEnabled", "hideParticipantList", "teamParticipationEnabled"];
  for (const field of preservedParticipation) delete payload[field];
  for (const field of preservedParticipation) {
    if (authoritative && Object.hasOwn(authoritative, field)) payload[field] = authoritative[field];
  }
  const monetization = { ...(payload.monetization as Record<string, unknown>) };
  const serverOwned = ["enabled", "status", "paymentActive", "checkoutActive", "ledgerCreationEnabled", "prizeReleaseActive", "payoutReleaseActive"];
  for (const field of ["sponsorshipGoal", "preferredSponsorCategory", "sponsorNote", "placements", ...serverOwned]) delete monetization[field];
  const persisted = authoritative?.monetization as Record<string, unknown> | undefined;
  for (const field of ["sponsorshipGoal", "preferredSponsorCategory", "sponsorNote", "placements", ...serverOwned]) {
    if (persisted && Object.hasOwn(persisted, field)) monetization[field] = persisted[field];
  }
  payload.monetization = monetization;
  if (form.builderVersion !== "normal_v2") payload.prizeValue = Number(form.basePrizeAmount || 0);
  return payload;
}

export type CreatorBasePrizeFunding = {
  enteredCents: number; requiredCents: number; confirmedCents: number | null; outstandingCents: number;
  satisfied: boolean; status: "none" | "unknown" | "pending" | "failed" | "partial" | "funded" | "required";
};
export function creatorBasePrizeFunding(amount: string, authoritative: Record<string, unknown> | null): CreatorBasePrizeFunding {
  const enteredCents = Math.max(0, Math.round(Number(amount || 0) * 100)) || 0;
  const monetization = authoritative?.monetization as Record<string, unknown> | undefined;
  const persistedRequired = Number(monetization?.creatorPrizeFundingRequiredCents ?? 0);
  const requiredCents = Math.max(enteredCents, Number.isSafeInteger(persistedRequired) && persistedRequired > 0 ? persistedRequired : 0);
  const raw = authoritative?.confirmedCreatorPrizeFundingCents ?? monetization?.confirmedCreatorPrizeFundingCents;
  const value = raw ?? 0;
  const confirmedCents = authoritative && (typeof value === "number" || typeof value === "string" && value.trim() !== "") && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const providerState = String(monetization?.creatorPrizeFundingStatus ?? authoritative?.creatorPrizeFundingStatus ?? "");
  const outstandingCents = Math.max(0, requiredCents - (confirmedCents ?? 0));
  const status = !requiredCents ? "none" : confirmedCents === null ? "unknown" : outstandingCents === 0 ? "funded" : confirmedCents > 0 ? "partial" : /pending|processing/.test(providerState) ? "pending" : /failed|cancel/.test(providerState) ? "failed" : "required";
  return { enteredCents, requiredCents, confirmedCents, outstandingCents, satisfied: requiredCents === 0 || (confirmedCents !== null && confirmedCents >= requiredCents), status };
}

const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
export function getNormalFrontendReadiness(payload: Record<string, unknown>, funding: CreatorBasePrizeFunding): NormalChallengeReadiness {
  const issues: NormalChallengeIssue[] = [];
  const publishStep = normalStepIndex("publish");
  for (const original of getNormalChallengeReadiness(payload).issues) {
    const optionalInstructions = original.code === "SUBMISSION_INSTRUCTIONS_REQUIRED";
    const optionalPrize = original.code === "PRIZE_AMOUNTS_INVALID" && funding.enteredCents === 0;
    const retiredControl = original.step === 1;
    issues.push({ ...original, code: retiredControl ? `LEGACY_PARTICIPATION_${original.code}` : original.code, step: optionalInstructions || optionalPrize || retiredControl ? publishStep : normalRestoredStep(original.step),
      message: optionalInstructions ? "Instructions are optional in this form, but the current server still requires at least one before submission. A backend policy update is required for an empty list."
        : optionalPrize ? "No Base Prize funding is required for this selection, but the current server still requires positive cash amounts for winner placements. Zero-prize submission requires a backend policy update."
          : retiredControl ? `An existing participation setting requires server attention: ${original.message}` : original.message });
  }
  const approvalMode = String(payload.participantApprovalMode ?? "automatic").toLowerCase();
  if (payload.requiresParticipantApproval === true || payload.requiresParticipantApproval === "true" || approvalMode !== "automatic") issues.push({ code: "LEGACY_JOINING_POLICY", field: "legacyParticipation", step: publishStep, message: "Your stored joining policy is preserved. The current Normal publication service forces automatic joining, so this legacy draft needs backend compatibility review before submission." });
  const locationMode = String(payload.locationEligibility ?? (payload.eligibleCountry ? "selected" : "worldwide"));
  if (payload.builderVersion === "normal_v3" && (locationMode !== "worldwide" || Boolean(payload.eligibleCountry) || Array.isArray(payload.eligibleCountries) && payload.eligibleCountries.length > 0 || payload.ageRestrictionMode === "minimum" || Number(payload.minimumAge ?? 0) > 0)) issues.push({ code: "LEGACY_ELIGIBILITY_POLICY", field: "legacyParticipation", step: publishStep, message: "Stored age/location restrictions are preserved. The current server rejects these restrictions for normal_v3; backend compatibility review is required rather than silently removing them." });
  if (!Number.isFinite(Number(payload.prizeValue)) || Number(payload.prizeValue) < 0) issues.push({ code: "BASE_PRIZE_INVALID", field: "prizeValue", step: normalStepIndex("monetization"), message: "Enter zero or a valid positive Base Prize amount." });
  if (!funding.satisfied) issues.push({ code: "CREATOR_BASE_PRIZE_UNFUNDED", field: "creatorFunding", step: publishStep, message: funding.confirmedCents === null
    ? `Your Base Prize is ${usd(funding.requiredCents)}. Refresh the confirmed creator funding record before publishing.`
    : `Your Base Prize is ${usd(funding.requiredCents)}, but only ${usd(funding.confirmedCents)} has been confirmed. Fund the remaining ${usd(funding.outstandingCents)} before publishing.` });
  if (funding.requiredCents > 0 && funding.requiredCents < 500 && !funding.satisfied) issues.push({ code: "FUNDING_SERVICE_MINIMUM", field: "creatorFunding", step: publishStep, message: "The existing creator funding checkout requires at least $5. This smaller Base Prize cannot be funded through the current service; backend policy alignment is required." });
  const steps = NORMAL_FRONTEND_STEPS.map((definition, position) => ({ label: definition.navLabel, issues: issues.filter((item) => item.step === position), complete: definition.key === "review" ? !issues.some((item) => item.step < position) : !issues.some((item) => item.step === position) }));
  const firstIncomplete = steps.findIndex((step) => !step.complete);
  return { ready: issues.length === 0, steps, issues, nextRequiredStep: firstIncomplete < 0 ? publishStep : firstIncomplete };
}
export function normalFrontendSubmitIssue(details: unknown) {
  const issue = normalChallengeSubmitIssue(details);
  if (issue && (issue.field === "votingSettings" || issue.field.startsWith("votingSettings.") || issue.field === "paidVotesRequested" || issue.field === "monetization.paidVotesRequested")) return { ...issue, field: "votingSettings", step: normalStepIndex("submission") };
  if (issue) {
    const field = issue.field.split(".")[0];
    const mapped = NORMAL_FRONTEND_STEPS.findIndex((step) => step.fields.some((candidate) => candidate === field));
    if (mapped >= 0) return { ...issue, field, step: mapped };
  }
  return issue ? { ...issue, step: issue.step === null ? null : issue.step === 1 ? normalStepIndex("publish") : normalRestoredStep(issue.step) } : null;
}
