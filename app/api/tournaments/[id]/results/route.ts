import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { advanceWinner, cumulativeTournamentScore, finalPlacements, resolveMatchResult } from "@/lib/server/tournament-operations";
import { canPerformTournamentRole } from "@/lib/server/tournament-permissions";
import type { TournamentFoundation, TournamentMatchFoundation } from "@/lib/tournament-types";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament result confirmation");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const { id } = await context.params;
  const matchId = String(body.matchId ?? "");
  const [tournamentSnap, matchSnap] = await Promise.all([db.collection("tournaments").doc(id).get(), db.collection("tournamentMatches").doc(matchId).get()]);
  if (!tournamentSnap.exists || !matchSnap.exists) return fail("Tournament match is required.", 404, undefined, "TOURNAMENT_MATCH_NOT_FOUND");
  const tournament = { id: tournamentSnap.id, ...tournamentSnap.data() } as TournamentFoundation;
  const permission = canPerformTournamentRole({ uid: user.uid, role: user.role, isAdmin: user.isAdmin }, tournament, ["host", "manager", "moderator"]);
  if (!permission.allowed) return fail("Tournament result permission is required.", 403, permission, "TOURNAMENT_RESULT_PERMISSION_REQUIRED");
  const match = { id: matchSnap.id, ...matchSnap.data() } as TournamentMatchFoundation;
  if (match.resultMethod !== "creator_decision" && !user.isAdmin) return fail("This match result must be confirmed through its configured competition method.", 403, undefined, "TOURNAMENT_RESULT_METHOD_REQUIRED");
  const winnerParticipantId = String(body.winnerParticipantId ?? "");
  const loserParticipantId = String(body.loserParticipantId ?? "");
  const competitors = new Set([match.participantAId, match.participantBId].filter(Boolean));
  if (!winnerParticipantId || !loserParticipantId || winnerParticipantId === loserParticipantId || !competitors.has(winnerParticipantId) || !competitors.has(loserParticipantId)) return fail("Winner and loser must be the two participants assigned to this match.", 400, undefined, "MATCH_PARTICIPANTS_INVALID");
  if (["confirmed", "forfeit", "bye"].includes(match.status)) return fail("This match result has already been recorded.", 409, undefined, "MATCH_RESULT_ALREADY_RECORDED");
  const result = resolveMatchResult({ match, winnerParticipantId, loserParticipantId, fraudFlag: Boolean(body.fraudFlag), moderationIssue: Boolean(body.moderationIssue), unresolvedTie: Boolean(body.unresolvedTie), overrideReason: typeof body.overrideReason === "string" ? body.overrideReason : "", actor: { uid: user.uid, isAdmin: user.isAdmin, role: user.role } });
  if (!result.confirmed) return fail("Match result requires review before advancement.", 409, result, result.code);
  const competitorCollection = tournament.participationMode === "team" ? "tournamentTeams" : "tournamentParticipants";
  const [nextMatchSnap, loserNextMatchSnap, winnerParticipantSnap, loserParticipantSnap, resetMatchSnap] = await Promise.all([
    match.nextMatchId ? db.collection("tournamentMatches").doc(match.nextMatchId).get() : null,
    match.loserNextMatchId ? db.collection("tournamentMatches").doc(match.loserNextMatchId).get() : null,
    db.collection(competitorCollection).doc(winnerParticipantId).get(),
    db.collection(competitorCollection).doc(loserParticipantId).get(),
    match.resetMatchId ? db.collection("tournamentMatches").doc(match.resetMatchId).get() : null
  ]);
  const nextMatch = nextMatchSnap?.exists ? { id: nextMatchSnap.id, ...nextMatchSnap.data() } as TournamentMatchFoundation : null;
  const loserNextMatch = loserNextMatchSnap?.exists ? { id: loserNextMatchSnap.id, ...loserNextMatchSnap.data() } as TournamentMatchFoundation : null;
  const advancement = advanceWinner({ match: { ...match, winnerParticipantId, loserParticipantId }, existingNextMatch: nextMatch });
  if (!winnerParticipantSnap.exists || !loserParticipantSnap.exists) return fail("Tournament competitor records need attention before confirming this result.", 409, undefined, "TOURNAMENT_COMPETITOR_RECORD_MISSING");
  const previousLosses = Number(loserParticipantSnap.data()?.lossCount ?? 0);
  const nextLosses = previousLosses + 1;
  const winnerScore = cumulativeTournamentScore(Number(winnerParticipantSnap.data()?.cumulativeScore ?? 0), Number(body.winnerScore ?? 0));
  const loserScore = cumulativeTournamentScore(Number(loserParticipantSnap.data()?.cumulativeScore ?? 0), Number(body.loserScore ?? 0));
  if (!winnerScore.valid || !loserScore.valid) return fail("Match scores must be valid non-negative numbers.", 422, undefined, "TOURNAMENT_MATCH_SCORE_INVALID");
  const requiresGrandFinalReset = tournament.format === "double_elimination" && match.bracket === "grand_final" && Boolean(match.resetMatchId) && previousLosses === 0;
  const loserContinues = Boolean(loserNextMatch) && (tournament.format === "single_elimination" || nextLosses < 2);
  await db.runTransaction(async (transaction) => {
    transaction.set(db.collection("tournamentMatches").doc(match.id), { winnerParticipantId, loserParticipantId, resultStatus: result.status, status: "confirmed", confirmedAt: new Date().toISOString(), confirmedBy: user.uid }, { merge: true });
    if (advancement.nextMatch) transaction.set(db.collection("tournamentMatches").doc(advancement.nextMatch.id), advancement.nextMatch, { merge: true });
    transaction.set(db.collection(competitorCollection).doc(winnerParticipantId), { cumulativeScore: winnerScore.score, status: "active", updatedAt: new Date().toISOString() }, { merge: true });
    transaction.set(db.collection(competitorCollection).doc(loserParticipantId), { cumulativeScore: loserScore.score, lossCount: nextLosses, status: loserContinues ? "active" : "eliminated", updatedAt: new Date().toISOString() }, { merge: true });
    if (loserContinues && loserNextMatch) {
      const updatedLoserMatch = { ...loserNextMatch };
      if (match.loserNextSlot === "A") updatedLoserMatch.participantAId = loserParticipantId;
      if (match.loserNextSlot === "B") updatedLoserMatch.participantBId = loserParticipantId;
      if (updatedLoserMatch.participantAId && updatedLoserMatch.participantBId) updatedLoserMatch.status = "ready";
      transaction.set(db.collection("tournamentMatches").doc(updatedLoserMatch.id), updatedLoserMatch, { merge: true });
    }
    if (requiresGrandFinalReset && resetMatchSnap?.exists) {
      transaction.set(resetMatchSnap.ref, { participantAId: winnerParticipantId, participantBId: loserParticipantId, status: "ready", updatedAt: new Date().toISOString() }, { merge: true });
    }
    transaction.set(db.collection("tournamentAuditEvents").doc(`${match.id}_result_confirmed`), { id: `${match.id}_result_confirmed`, tournamentId: id, actorId: user.uid, action: body.overrideReason ? "result_overridden" : "result_confirmed", reason: String(body.overrideReason ?? ""), createdAt: new Date().toISOString(), metadata: { matchId: match.id, advancement: advancement.code } });
    if (match.bracket === "bronze") {
      transaction.set(db.collection("tournamentPlacements").doc(`${id}_3`), { id: `${id}_3`, tournamentId: id, placement: 3, participantId: winnerParticipantId, userId: tournament.participationMode === "team" ? null : winnerParticipantId, teamId: tournament.participationMode === "team" ? winnerParticipantId : null, sourceMatchId: match.id, lockedAt: new Date().toISOString(), payoutStatus: "pending_admin_review" }, { merge: true });
    } else if (tournament.format === "double_elimination" && match.bracket === "losers" && match.nextMatchId?.endsWith("_grand_final")) {
      transaction.set(db.collection("tournamentPlacements").doc(`${id}_3`), { id: `${id}_3`, tournamentId: id, placement: 3, participantId: loserParticipantId, userId: tournament.participationMode === "team" ? null : loserParticipantId, teamId: tournament.participationMode === "team" ? loserParticipantId : null, sourceMatchId: match.id, lockedAt: new Date().toISOString(), payoutStatus: "pending_admin_review" }, { merge: true });
    } else if (!match.nextMatchId && match.bracket !== "losers" && !requiresGrandFinalReset) {
      const placementRows = finalPlacements({ finalMatch: { ...match, winnerParticipantId, loserParticipantId }, bronzeMatch: null });
      placementRows.forEach((placement) => transaction.set(db.collection("tournamentPlacements").doc(`${id}_${placement.placement}`), { ...placement, id: `${id}_${placement.placement}`, tournamentId: id, userId: tournament.participationMode === "team" ? null : placement.participantId, teamId: tournament.participationMode === "team" ? placement.participantId : null, lockedAt: new Date().toISOString(), payoutStatus: "pending_admin_review" }, { merge: true }));
    }
  });
  return ok({ result, advancement, grandFinalResetRequired: requiresGrandFinalReset }, requiresGrandFinalReset ? "A Grand Final reset is required because both finalists now have one loss." : "Tournament result confirmed server-side. Payout remains admin and ledger-gated.");
}
