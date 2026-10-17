import type { TournamentMatchFoundation } from "@/lib/tournament-types";

/** Constant-memory verifier for a complete, ascending stream of persisted votes. */
export function createTournamentVoteSequenceVerifier(match: TournamentMatchFoundation) {
  let count = 0;
  let votesA = 0;
  let votesB = 0;
  let lastA = 0;
  let lastB = 0;
  let integrityFailed = false;
  return {
    accept(event: Record<string, unknown>) {
      count += 1;
      const sequence = Number(event.voteSequence);
      const participantId = String(event.selectedParticipantId ?? event.participantId ?? "");
      if (!Number.isSafeInteger(sequence) || sequence !== count || event.status !== "recorded"
        || ![match.participantAId, match.participantBId].includes(participantId)
        || (event.tournamentId !== undefined && event.tournamentId !== match.tournamentId)
        || (event.matchId !== undefined && event.matchId !== match.id)) {
        integrityFailed = true;
        return;
      }
      if (participantId === match.participantAId) { votesA += 1; lastA = sequence; }
      else { votesB += 1; lastB = sequence; }
    },
    finish() {
      const summary = { votesA, votesB, tied: votesA === votesB, totalVotes: count };
      const held = (code: string) => ({ ...summary, valid: false, code, winnerParticipantId: null, resolution: "held" as const });
      if (integrityFailed) return held("VOTE_EVENT_INTEGRITY_FAILED");
      if (!Number.isSafeInteger(Number(match.voteSequence ?? 0)) || count !== Number(match.voteSequence ?? 0)) return held("VOTE_EVENT_SEQUENCE_MISMATCH");
      if (votesA !== Number(match.voteCountA ?? 0) || votesB !== Number(match.voteCountB ?? 0)) return held("VOTE_TALLY_MISMATCH");
      if (votesA !== votesB) return { ...summary, valid: true, code: "VOTE_SEQUENCE_WINNER", winnerParticipantId: votesA > votesB ? match.participantAId : match.participantBId, resolution: "vote_total" as const };
      if (votesA > 0) return { ...summary, valid: true, code: "TIE_RESOLVED_BY_FINAL_TALLY_SEQUENCE", winnerParticipantId: lastA < lastB ? match.participantAId : match.participantBId, resolution: "final_tally_sequence" as const };
      const priority = match.tiePrioritySlot === "A" ? match.participantAId : match.tiePrioritySlot === "B" ? match.participantBId : null;
      if (!priority) return held("TIE_PRIORITY_MISSING");
      return { ...summary, valid: true, code: "TIE_RESOLVED_BY_PRE_RECORDED_PRIORITY", winnerParticipantId: priority, resolution: "pre_recorded_priority" as const };
    }
  };
}
