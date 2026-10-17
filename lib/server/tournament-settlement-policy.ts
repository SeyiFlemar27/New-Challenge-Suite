import { deterministicId } from "@/lib/server/idempotency";
import { createHash } from "node:crypto";
import { TOURNAMENT_PRODUCT_POLICY } from "@/lib/tournament-builder-policy";

export function tournamentPlacementFingerprint(placements: Array<Record<string, unknown> & { id: string }>, productPolicyVersion?: unknown) {
  if (productPolicyVersion === TOURNAMENT_PRODUCT_POLICY) return `tournament_placements_v2_${createHash("sha256").update(JSON.stringify(placements.slice().sort((a, b) => Number(a.placement) - Number(b.placement)).map(item => [item.placement, item.participantId ?? null, item.userId ?? null, item.teamId ?? null, item.sourceMatchId ?? null]))).digest("hex")}`;
  return deterministicId("tournament_placements", ...placements.slice().sort((a, b) => Number(a.placement) - Number(b.placement))
    .map(item => `${item.placement}:${String(item.userId ?? item.teamId ?? item.participantId)}:${String(item.sourceMatchId ?? "")}`));
}

export function validateTournamentPlacementEvidence(tournament: Record<string, unknown>, placement: Record<string, unknown>, match: Record<string, unknown>) {
  const position = Number(placement.placement);
  const participantId = String(placement.participantId ?? "");
  if (!participantId || match.tournamentId !== tournament.id || !["confirmed", "forfeit"].includes(String(match.status ?? ""))) return false;
  const winnerId = String(match.winnerParticipantId ?? "");
  const loserId = String(match.loserParticipantId ?? "");
  if (!winnerId || !loserId || winnerId === loserId || ![match.participantAId, match.participantBId].includes(winnerId) || ![match.participantAId, match.participantBId].includes(loserId)) return false;
  if (position === 1) {
    return participantId === winnerId && (tournament.format === "double_elimination" ? match.bracket === "grand_final" : !match.nextMatchId && match.bracket !== "bronze");
  }
  if (position === 2) {
    return participantId === loserId && (tournament.format === "double_elimination" ? match.bracket === "grand_final" : !match.nextMatchId && match.bracket !== "bronze");
  }
  if (position === 3 && tournament.format === "single_elimination") return match.bracket === "bronze" && participantId === winnerId;
  if (position === 3 && tournament.format === "double_elimination") return match.bracket === "losers" && String(match.nextMatchId ?? "").endsWith("_grand_final") && participantId === loserId;
  return false;
}
