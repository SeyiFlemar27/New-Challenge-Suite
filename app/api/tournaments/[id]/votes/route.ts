import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { validateTournamentVote } from "@/lib/server/tournament-operations";
import type { TournamentFoundation, TournamentMatchFoundation } from "@/lib/tournament-types";

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
  const matchId = String(body.matchId ?? "");
  const submissionId = String(body.submissionId ?? "");
  const [tournamentSnap, matchSnap, existingVoteSnap] = await Promise.all([
    db.collection("tournaments").doc(id).get(),
    db.collection("tournamentMatches").doc(matchId).get(),
    db.collection("tournamentVotes").where("tournamentId", "==", id).where("matchId", "==", matchId).where("voterId", "==", user.uid).limit(1).get()
  ]);
  if (!tournamentSnap.exists || !matchSnap.exists) return fail("Tournament match is required.", 404, undefined, "TOURNAMENT_MATCH_NOT_FOUND");
  const tournament = { id: tournamentSnap.id, ...tournamentSnap.data() } as TournamentFoundation;
  const match = { id: matchSnap.id, ...matchSnap.data() } as TournamentMatchFoundation;
  const validation = validateTournamentVote({ tournament, match, existingVote: !existingVoteSnap.empty, strictOneVote: Boolean((tournament.voting as Record<string, unknown>)?.strictOneAccountOneVote), votingOpen: true });
  if (!validation.valid) return fail(validation.message, 409, validation, validation.code);
  const ref = db.collection("tournamentVotes").doc(`${id}_${matchId}_${user.uid}`);
  const vote = { id: ref.id, tournamentId: id, roundId: match.roundId, matchId, voterId: user.uid, submissionId, selectedParticipantId: String(body.selectedParticipantId ?? ""), voteType: String(body.voteType ?? "free") === "paid" ? "paid" : "free", status: "recorded", createdAt: new Date().toISOString() };
  await ref.set(vote);
  return ok({ vote }, "Tournament vote recorded server-side.");
}
