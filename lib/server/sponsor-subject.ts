import { createHash } from "node:crypto";
import { tournamentSponsorCutoff } from "@/lib/server/tournament-sponsor-cutoff";

export type SponsorSubjectType = "challenge" | "tournament";
export function sponsorSubjectType(request: Request): SponsorSubjectType {
  const value = new URL(request.url).searchParams.get("subjectType");
  if (value && value !== "challenge" && value !== "tournament") throw new Error("SPONSOR_SUBJECT_INVALID");
  return value === "tournament" ? "tournament" : "challenge";
}
export const sponsorSubjectCollection = (type: SponsorSubjectType) => type === "tournament" ? "tournaments" : "challenges";
export function tournamentSponsorFundingWindow(tournament: Record<string, unknown>, now = new Date()) {
  const cutoff = tournamentSponsorCutoff(tournament);
  const sponsorship = tournament.sponsorship as Record<string, unknown> | undefined;
  const sponsorReady = sponsorship?.sponsorReady === true;
  const published = tournament.privacy === "public" && ["registration_open", "registration_closed", "seeding", "ready", "active", "round_active", "round_review", "final"].includes(String(tournament.status));
  const terminal = Boolean(tournament.financialHold || tournament.settlementRestricted || tournament.winnersApprovedAt || tournament.adminWinnersApprovedAt || tournament.settlementId);
  // A persisted occurrence closes new reservations permanently, including after pauses.
  const votingStarted = cutoff !== null;
  const allowed = sponsorReady && published && !terminal && !votingStarted && Number.isFinite(now.getTime());
  return { allowed, sponsorReady, published, terminal, votingStarted, closesAt: cutoff !== null && Number.isFinite(cutoff) ? new Date(cutoff).toISOString() : null,
    reason: allowed ? "sponsor_funding_open" : !sponsorReady ? "challenge_not_sponsor_ready" : !published ? "challenge_not_published" : terminal ? "challenge_terminal_or_winners_approved" : "voting_started" };
}
export function sponsorTermsFingerprint(terms: Record<string, unknown>) {
  const canonical = Object.keys(terms).sort().map(key => [key, terms[key]]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
export const sponsorSubjectPrefix = (type: SponsorSubjectType, prefix: string) => type === "tournament" ? `tournament_${prefix}` : prefix;
