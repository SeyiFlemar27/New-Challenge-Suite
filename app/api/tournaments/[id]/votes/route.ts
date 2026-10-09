import { getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { validateTournamentVote } from "@/lib/server/tournament-operations";
import type { TournamentFoundation, TournamentMatchFoundation, TournamentRoundFoundation } from "@/lib/tournament-types";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament voting");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const { id } = await context.params;
  const matchId = String(body.matchId ?? "").trim();
  const submissionId = String(body.submissionId ?? "").trim();
  const selectedParticipantId = String(body.selectedParticipantId ?? "").trim();
  const requestedVoteType = String(body.voteType ?? "free").trim().toLowerCase();
  if (!matchId || !submissionId || !selectedParticipantId) return fail("Match, participant, and submission are required.", 400, undefined, "TOURNAMENT_VOTE_TARGET_REQUIRED");
  if (requestedVoteType !== "free") return fail("Tournament voting currently supports free public votes only.", 400, undefined, "TOURNAMENT_PAID_VOTING_UNSUPPORTED");
  const voteRef = db.collection("tournamentVotes").doc(`${id}_${matchId}_${user.uid}`);
  const submissionRef = db.collection("tournamentSubmissions").doc(submissionId);
  const tournamentRef = db.collection("tournaments").doc(id);
  const matchRef = db.collection("tournamentMatches").doc(matchId);
  const now = new Date();
  let recordedVote: Record<string, unknown> | null = null;
  let idempotentReplay = false;
  try {
    await db.runTransaction(async (transaction) => {
      const [tournamentSnap, matchSnap, submissionSnap, voteSnap, voterSnap] = await Promise.all([
        transaction.get(tournamentRef),
        transaction.get(matchRef),
        transaction.get(submissionRef),
        transaction.get(voteRef),
        transaction.get(db.collection("users").doc(user.uid))
      ]);
      if (!tournamentSnap.exists || !matchSnap.exists) throw Object.assign(new Error("Tournament match is required."), { code: "TOURNAMENT_MATCH_NOT_FOUND", status: 404 });
      if (!submissionSnap.exists) throw Object.assign(new Error("Tournament submission is required."), { code: "TOURNAMENT_SUBMISSION_NOT_FOUND", status: 404 });
      const tournament = { id: tournamentSnap.id, ...tournamentSnap.data() } as TournamentFoundation;
      const match = { id: matchSnap.id, ...matchSnap.data() } as TournamentMatchFoundation;
      const submission = submissionSnap.data() ?? {};
      if (!voterSnap.exists || String(voterSnap.data()?.accountStatus ?? "active") !== "active") throw Object.assign(new Error("An active account is required to vote."), { code: "TOURNAMENT_VOTER_INELIGIBLE", status: 403 });
      if (match.tournamentId !== id) throw Object.assign(new Error("The match does not belong to this Tournament."), { code: "TOURNAMENT_MATCH_MISMATCH", status: 403 });
      if (voteSnap.exists) {
        const existingVote = voteSnap.data() ?? {};
        if (existingVote.tournamentId === id && existingVote.matchId === matchId && existingVote.voterId === user.uid && existingVote.submissionId === submissionId && existingVote.participantId === selectedParticipantId && existingVote.status === "recorded") {
          recordedVote = { id: voteSnap.id, ...existingVote };
          idempotentReplay = true;
          return;
        }
        throw Object.assign(new Error("One vote per verified account per match has already been recorded for a different target."), { code: "DUPLICATE_VOTE_BLOCKED", status: 409 });
      }
      const roundRef = db.collection("tournamentRounds").doc(match.roundId);
      const competitorCollection = tournament.participationMode === "team" ? "tournamentTeams" : "tournamentParticipants";
      const competitorRef = db.collection(competitorCollection).doc(selectedParticipantId);
      const [roundSnap, competitorSnap, duplicateSnap] = await Promise.all([
        transaction.get(roundRef),
        transaction.get(competitorRef),
        transaction.get(db.collection("tournamentVotes").where("tournamentId", "==", id).where("matchId", "==", matchId).where("voterId", "==", user.uid).limit(1))
      ]);
      if (!roundSnap.exists) throw Object.assign(new Error("The match round does not exist."), { code: "TOURNAMENT_ROUND_NOT_FOUND", status: 404 });
      const round = { id: roundSnap.id, ...roundSnap.data() } as TournamentRoundFoundation;
      const validation = validateTournamentVote({ tournament, match, round, now });
      if (!validation.valid) throw Object.assign(new Error(validation.message), { code: validation.code, status: 409, details: validation });
      if (!competitorSnap.exists) throw Object.assign(new Error("The selected competitor is not part of this Tournament."), { code: "TOURNAMENT_COMPETITOR_NOT_FOUND", status: 403 });
      const competitor = competitorSnap.data() ?? {};
      const allowedCompetitorStatuses = tournament.participationMode === "team" ? ["checked_in", "active"] : ["registered", "checked_in", "active"];
      if (competitor.tournamentId !== id || !allowedCompetitorStatuses.includes(String(competitor.status ?? ""))) throw Object.assign(new Error("The selected competitor is not eligible in this Tournament."), { code: "TOURNAMENT_COMPETITOR_INELIGIBLE", status: 403 });
      if (![match.participantAId, match.participantBId].includes(selectedParticipantId)) throw Object.assign(new Error("The selected competitor is not assigned to this match."), { code: "TOURNAMENT_MATCH_TARGET_MISMATCH", status: 403 });
      if (submission.tournamentId !== id || submission.matchId !== matchId || submission.roundId !== match.roundId || submission.participantId !== selectedParticipantId) throw Object.assign(new Error("The submission is not assigned to the selected competitor and match."), { code: "TOURNAMENT_SUBMISSION_TARGET_MISMATCH", status: 403 });
      if (!["submitted", "approved", "active"].includes(String(submission.status ?? ""))) throw Object.assign(new Error("This submission is not eligible for Tournament voting."), { code: "TOURNAMENT_SUBMISSION_INELIGIBLE", status: 409 });
      if (tournament.participationMode === "team" && submission.teamId !== selectedParticipantId) throw Object.assign(new Error("The submission does not belong to the selected Team."), { code: "TOURNAMENT_TEAM_SUBMISSION_MISMATCH", status: 403 });
      if (!duplicateSnap.empty) throw Object.assign(new Error("One vote per verified account per match has already been recorded."), { code: "DUPLICATE_VOTE_BLOCKED", status: 409 });
      const vote = {
        id: voteRef.id,
        tournamentId: id,
        roundId: round.id,
        matchId,
        voterId: user.uid,
        submissionId,
        participantId: selectedParticipantId,
        selectedParticipantId,
        voteType: "free",
        status: "recorded",
        validationVersion: 2,
        createdAt: now.toISOString()
      };
      transaction.create(voteRef, vote);
      const voteCountField = selectedParticipantId === match.participantAId ? "voteCountA" : "voteCountB";
      transaction.update(matchRef, { [voteCountField]: FieldValue.increment(1), updatedAt: now.toISOString() });
      recordedVote = vote;
    });
  } catch (error) {
    const failure = error as Error & { code?: string; status?: number; details?: unknown };
    const existingSnap = await voteRef.get().catch(() => null);
    const existingVote = existingSnap?.data();
    if (existingSnap?.exists && existingVote?.tournamentId === id && existingVote?.matchId === matchId && existingVote?.voterId === user.uid && existingVote?.submissionId === submissionId && existingVote?.participantId === selectedParticipantId && existingVote?.status === "recorded") {
      return ok({ vote: { id: existingSnap.id, ...existingVote }, idempotentReplay: true }, "The existing Tournament vote was returned safely.");
    }
    if (failure.code === "DUPLICATE_VOTE_BLOCKED") return fail(failure.message, 409, undefined, failure.code);
    if (failure.code) return fail(failure.message, failure.status ?? 409, failure.details, failure.code);
    throw error;
  }
  return ok({ vote: recordedVote, idempotentReplay }, idempotentReplay ? "The existing Tournament vote was returned safely." : "Tournament vote recorded server-side.");
}
