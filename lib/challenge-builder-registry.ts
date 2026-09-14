import type { BuilderGuideContent } from "@/components/challenge-builder-frame";

export type CanonicalBuilderType = "normal" | "private" | "tournament" | "live_event";

export type CanonicalBuilderStep = {
  key: string;
  label: string;
  guide: BuilderGuideContent;
};

export const CHALLENGE_BUILDER_REGISTRY: Record<CanonicalBuilderType, readonly CanonicalBuilderStep[]> = {
  normal: [
    ["overview", "Overview"], ["eligibility", "Eligibility"], ["monetization", "Monetization & Prize Pool"],
    ["media", "Media & Branding"], ["schedule", "Schedule"], ["submission", "Entry & Submission"],
    ["review", "Review"], ["publish", "Publish"]
  ].map(([key, label]) => ({ key, label, guide: { title: label, description: "Complete this section using the challenge details participants and reviewers need.", points: ["Required fields are checked before you continue.", "Your draft saves after it has been created.", "You can return to completed steps before submission."] } })),
  private: [
    ["overview", "Overview"], ["access", "Access"], ["eligibility", "Eligibility"],
    ["monetization", "Monetization & Prize Pool"], ["media", "Media & Branding"], ["schedule", "Schedule"],
    ["submission", "Entry & Submission"], ["review", "Review"], ["publish", "Publish"]
  ].map(([key, label]) => ({ key, label, guide: { title: label, description: "Configure the private challenge without exposing protected access details.", points: ["Link and code access is verified by the server.", "Eligibility still applies after access verification.", "Private drafts never appear in public discovery."] } })),
  tournament: [
    ["overview", "Overview"], ["format", "Tournament Format"], ["eligibility", "Eligibility & Participation"],
    ["monetization", "Monetization & Prize Pool"], ["media", "Media & Branding"], ["method", "Competition Method"],
    ["schedule", "Schedule & Round Timing"], ["submissions", "Entry & Round Submissions"], ["review", "Review"],
    ["publish", "Publish"]
  ].map(([key, label]) => ({ key, label, guide: { title: label, description: "Configure a tournament using bracket-safe operational rules.", points: ["Bracket size is the tournament capacity.", "Round results control advancement.", "Competition state is locked when live play begins."] } })),
  live_event: [
    ["basics", "Basics"], ["venue", "Venue & Schedule"], ["registration", "Registration & Tickets"],
    ["participants", "Participants"], ["format", "Format"], ["judging", "Voting & Judging"],
    ["prize", "Prize Setup"], ["media", "Media & Branding"], ["sponsors", "Sponsors"],
    ["review", "Review & Submit"]
  ].map(([key, label]) => ({ key, label, guide: { title: label, description: "Prepare a physical event with clear registration and event-day operations.", points: ["Registration is automatic when eligibility, capacity, and payment pass.", "Check-in is verified server-side.", "Only relevant competition controls are shown."] } }))
};

export function canonicalBuilderSteps(type: CanonicalBuilderType) {
  return CHALLENGE_BUILDER_REGISTRY[type].map((step) => step.label);
}
