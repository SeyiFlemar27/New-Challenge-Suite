import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { advanceWinner, canUseLegacyTournamentAdminResultOverride, cumulativeTournamentScore, finalPlacements, resolveMatchResult, resolveTournamentVoteEventSequence, tournamentMatchVoteOutcome } from "@/lib/server/tournament-operations";
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
  if ((tournament as TournamentFoundation & { financialHold?: boolean }).financialHold === true) return fail("Tournament financial reconciliation is required before results can advance.", 409, undefined, "TOURNAMENT_FINANCIAL_HOLD");
  const permission = canPerformTournamentRole({ uid: user.uid, role: user.role, isAdmin: user.isAdmin }, tournament, ["host", "manager", "moderator"]);
  if (!permission.allowed) return fail("Tournament result permission is required.", 403, permission, "TOURNAMENT_RESULT_PERMISSION_REQUIRED");
  const match = { id: matchSnap.id, ...matchSnap.data() } as TournamentMatchFoundation;
  if ((match as TournamentMatchFoundation & { financialHold?: boolean }).financialHold === true) return fail("This match is held for financial reconciliation.", 409, undefined, "TOURNAMENT_MATCH_FINANCIAL_HOLD");
  if (match.resultMethod !== "creator_decision" && match.resultMethod !== "votes" && !user.isAdmin) return fail("This match result must be confirmed through its configured competition method.", 403, undefined, "TOURNAMENT_RESULT_METHOD_REQUIRED");
  let winnerParticipantId = String(body.winnerParticipantId ?? "");
  let loserParticipantId = String(body.loserParticipantId ?? "");
  const configVersion = Number(tournament.configVersion ?? 1);
  const hasAdminOverride = canUseLegacyTournamentAdminResultOverride({ configVersion, isAdmin: user.isAdmin === true, reason: typeof body.overrideReason === "string" ? body.overrideReason : "" });
  if (configVersion >= 3 && typeof body.overrideReason === "string" && body.overrideReason.trim()) {
    return fail("Tournament V3 results must be derived from verified competition evidence. Admin corrections require a separately auditable evidence-based review.", 409, undefined, "VERIFIABLE_CORRECTION_REQUIRES_REVIEW");
  }
  let voteOutcome: ReturnType<typeof tournamentMatchVoteOutcome> | null = null;
  if (configVersion >= 3 && !hasAdminOverride) {
    if (tournament.resultMethod !== "votes" || match.resultMethod !== "votes") return fail("New Tournament results require the verified public-vote method.", 409, undefined, "TOURNAMENT_RESULT_METHOD_REQUIRED");
    const voteEvents = await db.collection("tournamentVotes").where("tournamentId", "==", id).where("matchId", "==", matchId).orderBy("voteSequence", "asc").limit(5001).get();
    const resolved = resolveTournamentVoteEventSequence({ match, votes: voteEvents.docs.map((doc) => doc.data()) });
    if (!resolved.valid) return fail("Tournament vote records require integrity review before the result can advance.", 409, { code: resolved.code }, "TOURNAMENT_VOTE_RESULT_REQUIRES_REVIEW");
    if (resolved.totalVotes === 0) {
      const emptySubmissionSnaps = await Promise.all([match.participantAId, match.participantBId].map((participantId) => db.collection("tournamentSubmissions").doc(`${id}_${matchId}_${participantId}`).get()));
      if (emptySubmissionSnaps.some((snapshot) => !snapshot.exists || !["submitted", "approved", "active"].includes(String(snapshot.data()?.status ?? "")))) return fail("A 0–0 result requires valid submissions from both assigned competitors.", 409, undefined, "TOURNAMENT_EMPTY_RESULT_SUBMISSIONS_REQUIRED");
    }
    const resolvedWinner = String(resolved.winnerParticipantId ?? "");
    winnerParticipantId = resolvedWinner;
    loserParticipantId = resolvedWinner === match.participantAId ? String(match.participantBId ?? "") : String(match.participantAId ?? "");
    voteOutcome = { votesA: resolved.votesA, votesB: resolved.votesB, winnerParticipantId: resolved.winnerParticipantId, tied: resolved.tied, totalVotes: resolved.totalVotes };
  }
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
  let advancement = advanceWinner({ match: { ...match, winnerParticipantId, loserParticipantId }, existingNextMatch: nextMatch });
  if (!winnerParticipantSnap.exists || !loserParticipantSnap.exists) return fail("Tournament competitor records need attention before confirming this result.", 409, undefined, "TOURNAMENT_COMPETITOR_RECORD_MISSING");
  let previousLosses = Number(loserParticipantSnap.data()?.lossCount ?? 0);
  let nextLosses = previousLosses + 1;
  const publicVotingMatch = match.resultMethod === "votes";
  let winnerScore = cumulativeTournamentScore(Number(winnerParticipantSnap.data()?.cumulativeScore ?? 0), publicVotingMatch ? 0 : Number(body.winnerScore ?? 0));
  let loserScore = cumulativeTournamentScore(Number(loserParticipantSnap.data()?.cumulativeScore ?? 0), publicVotingMatch ? 0 : Number(body.loserScore ?? 0));
  if (!winnerScore.valid || !loserScore.valid) return fail("Match scores must be valid non-negative numbers.", 422, undefined, "TOURNAMENT_MATCH_SCORE_INVALID");
  let requiresGrandFinalReset = tournament.format === "double_elimination" && match.bracket === "grand_final" && Boolean(match.resetMatchId) && previousLosses === 0;
  let loserContinues = Boolean(loserNextMatch) && (tournament.format === "single_elimination" || nextLosses < 2);
  try {
    await db.runTransaction(async (transaction) => {
    const [currentTournamentSnap, currentMatchSnap] = await Promise.all([
      transaction.get(db.collection("tournaments").doc(id)),
      transaction.get(db.collection("tournamentMatches").doc(match.id))
    ]);
    if (!currentTournamentSnap.exists) throw Object.assign(new Error("Tournament not found."), { code: "TOURNAMENT_NOT_FOUND" });
    if (!currentMatchSnap.exists) throw Object.assign(new Error("Tournament match is required."), { code: "TOURNAMENT_MATCH_NOT_FOUND" });
    const currentTournament = { id: currentTournamentSnap.id, ...currentTournamentSnap.data() } as TournamentFoundation;
    const currentMatch = { id: currentMatchSnap.id, ...currentMatchSnap.data() } as TournamentMatchFoundation;
    if (currentMatch.tournamentId !== id) throw Object.assign(new Error("The match does not belong to this Tournament."), { code: "TOURNAMENT_MATCH_MISMATCH" });
    if ((currentTournament as TournamentFoundation & { financialHold?: boolean }).financialHold === true) throw Object.assign(new Error("Tournament financial reconciliation is required before results can advance."), { code: "TOURNAMENT_FINANCIAL_HOLD" });
    if ((currentMatch as TournamentMatchFoundation & { financialHold?: boolean }).financialHold === true) throw Object.assign(new Error("This match is held for financial reconciliation."), { code: "TOURNAMENT_MATCH_FINANCIAL_HOLD" });
    if (["confirmed", "forfeit", "bye"].includes(currentMatch.status)) throw Object.assign(new Error("This match result has already been recorded."), { code: "MATCH_RESULT_ALREADY_RECORDED" });
    if (currentMatch.resultMethod !== match.resultMethod) throw Object.assign(new Error("The configured match decision method changed. Refresh and try again."), { code: "TOURNAMENT_RESULT_METHOD_CHANGED" });
    const currentCompetitors = new Set([currentMatch.participantAId, currentMatch.participantBId].filter(Boolean));
    if (!currentCompetitors.has(winnerParticipantId) || !currentCompetitors.has(loserParticipantId)) throw Object.assign(new Error("The match competitors changed. Refresh before confirming the result."), { code: "MATCH_PARTICIPANTS_CHANGED" });
    const currentNextRef = currentMatch.nextMatchId ? db.collection("tournamentMatches").doc(currentMatch.nextMatchId) : null;
    const currentLoserNextRef = currentMatch.loserNextMatchId ? db.collection("tournamentMatches").doc(currentMatch.loserNextMatchId) : null;
    const currentWinnerParticipantRef = db.collection(competitorCollection).doc(winnerParticipantId);
    const currentLoserParticipantRef = db.collection(competitorCollection).doc(loserParticipantId);
    const currentResetRef = currentMatch.resetMatchId ? db.collection("tournamentMatches").doc(currentMatch.resetMatchId) : null;
    const [currentNextSnap, currentLoserNextSnap, currentWinnerParticipantSnap, currentLoserParticipantSnap, currentResetSnap] = await Promise.all([
      currentNextRef ? transaction.get(currentNextRef) : Promise.resolve(null),
      currentLoserNextRef ? transaction.get(currentLoserNextRef) : Promise.resolve(null),
      transaction.get(currentWinnerParticipantRef),
      transaction.get(currentLoserParticipantRef),
      currentResetRef ? transaction.get(currentResetRef) : Promise.resolve(null)
    ]);
    const dependentRoundIds = [...new Set([currentNextSnap?.data()?.roundId, currentLoserNextSnap?.data()?.roundId, currentResetSnap?.data()?.roundId].filter((roundId): roundId is string => typeof roundId === "string" && Boolean(roundId)))];
    const dependentRoundRefs = dependentRoundIds.map((roundId) => db.collection("tournamentRounds").doc(roundId));
    const dependentRoundSnaps = await Promise.all(dependentRoundRefs.map((ref) => transaction.get(ref)));
    if (!currentWinnerParticipantSnap.exists || !currentLoserParticipantSnap.exists) throw Object.assign(new Error("Tournament competitor records need attention before confirming this result."), { code: "TOURNAMENT_COMPETITOR_RECORD_MISSING" });
    const currentNextMatch = currentNextSnap?.exists ? { id: currentNextSnap.id, ...currentNextSnap.data() } as TournamentMatchFoundation : null;
    const currentLoserNextMatch = currentLoserNextSnap?.exists ? { id: currentLoserNextSnap.id, ...currentLoserNextSnap.data() } as TournamentMatchFoundation : null;
    advancement = advanceWinner({ match: { ...currentMatch, winnerParticipantId, loserParticipantId }, existingNextMatch: currentNextMatch });
    if (!advancement.advanced && advancement.code !== "FINAL_PLACEMENT_READY") throw Object.assign(new Error("Tournament advancement conflicts with an already assigned bracket slot."), { code: "TOURNAMENT_ADVANCEMENT_CONFLICT" });
    previousLosses = Number(currentLoserParticipantSnap.data()?.lossCount ?? 0);
    nextLosses = previousLosses + 1;
    winnerScore = cumulativeTournamentScore(Number(currentWinnerParticipantSnap.data()?.cumulativeScore ?? 0), publicVotingMatch ? 0 : Number(body.winnerScore ?? 0));
    loserScore = cumulativeTournamentScore(Number(currentLoserParticipantSnap.data()?.cumulativeScore ?? 0), publicVotingMatch ? 0 : Number(body.loserScore ?? 0));
    if (!winnerScore.valid || !loserScore.valid) throw Object.assign(new Error("Tournament match scores are invalid."), { code: "TOURNAMENT_MATCH_SCORE_INVALID" });
    requiresGrandFinalReset = currentTournament.format === "double_elimination" && currentMatch.bracket === "grand_final" && Boolean(currentMatch.resetMatchId) && previousLosses === 0;
    loserContinues = Boolean(currentLoserNextMatch) && (currentTournament.format === "single_elimination" || nextLosses < 2);
    if (currentMatch.resultMethod === "votes") {
      const currentIsV3 = Number(currentTournament.configVersion ?? 1) >= 3;
      const matchIsInVotingResultPhase = currentIsV3 ? ["voting_open", "voting_closed"].includes(currentMatch.status) : currentMatch.status === "active";
      if (currentTournament.resultMethod !== "votes" || !["active", "round_active"].includes(currentTournament.status) || !matchIsInVotingResultPhase) throw Object.assign(new Error("Public voting is not active for this Tournament match."), { code: "TOURNAMENT_VOTING_NOT_CONFIGURED" });
      const currentRoundSnap = await transaction.get(db.collection("tournamentRounds").doc(currentMatch.roundId));
      const closesAt = Date.parse(String(Number(currentTournament.configVersion ?? 1) >= 3 ? currentMatch.votingClosesAt ?? "" : currentRoundSnap.data()?.votingClosesAt ?? ""));
      if (!currentRoundSnap.exists || currentRoundSnap.data()?.tournamentId !== id || currentRoundSnap.id !== currentMatch.roundId) throw Object.assign(new Error("Tournament round is invalid."), { code: "TOURNAMENT_ROUND_MISMATCH" });
      if (currentIsV3 && currentMatch.status !== "voting_open" && currentMatch.status !== "voting_closed") throw Object.assign(new Error("This match has not entered its authoritative voting phase."), { code: "TOURNAMENT_VOTING_NOT_OPEN" });
      if (!Number.isFinite(closesAt) || Date.now() < closesAt) throw Object.assign(new Error("Voting must close before the result is confirmed."), { code: "TOURNAMENT_VOTING_STILL_OPEN" });
      if (Number(currentTournament.configVersion ?? 1) >= 3 && !hasAdminOverride) {
        const voteEventsSnap = await transaction.get(db.collection("tournamentVotes").where("tournamentId", "==", id).where("matchId", "==", matchId).orderBy("voteSequence", "asc").limit(5001));
        const resolved = resolveTournamentVoteEventSequence({ match: currentMatch, votes: voteEventsSnap.docs.map((doc) => doc.data()) });
        if (!resolved.valid || resolved.winnerParticipantId !== winnerParticipantId) throw Object.assign(new Error("Tournament vote records changed or failed integrity validation. Review is required."), { code: resolved.code === "VOTE_EVENT_LIMIT_EXCEEDED" ? "TOURNAMENT_VOTE_EVENT_LIMIT_EXCEEDED" : "TOURNAMENT_VOTE_RESULT_REQUIRES_REVIEW" });
        if (resolved.totalVotes === 0) {
          const emptySubmissions = await Promise.all([currentMatch.participantAId, currentMatch.participantBId].map((participantId) => transaction.get(db.collection("tournamentSubmissions").doc(`${id}_${matchId}_${participantId}`))));
          if (emptySubmissions.some((snapshot) => !snapshot.exists || !["submitted", "approved", "active"].includes(String(snapshot.data()?.status ?? "")))) throw Object.assign(new Error("A 0–0 result requires valid submissions from both assigned competitors."), { code: "TOURNAMENT_EMPTY_RESULT_SUBMISSIONS_REQUIRED" });
        }
        voteOutcome = { votesA: resolved.votesA, votesB: resolved.votesB, winnerParticipantId: resolved.winnerParticipantId, tied: resolved.tied, totalVotes: resolved.totalVotes };
      } else if (Number(currentTournament.configVersion ?? 1) < 3) {
        voteOutcome = tournamentMatchVoteOutcome(currentMatch);
        if (voteOutcome.totalVotes === 0) throw Object.assign(new Error("At least one valid public vote is required before confirming this match result."), { code: "TOURNAMENT_VOTES_REQUIRED" });
        if (voteOutcome.tied && currentTournament.tieBreaker !== "host_review") throw Object.assign(new Error("The configured Tournament tie-breaker must resolve this tied vote before advancement."), { code: "TOURNAMENT_VOTE_TIE_REQUIRES_REVIEW" });
        if (!voteOutcome.tied && voteOutcome.winnerParticipantId !== winnerParticipantId) throw Object.assign(new Error("The selected winner does not match the verified public vote result."), { code: "TOURNAMENT_VOTE_RESULT_MISMATCH" });
      }
    }
    transaction.set(db.collection("tournamentMatches").doc(match.id), {
      winnerParticipantId,
      loserParticipantId,
      resultStatus: result.status,
      status: "confirmed",
      ...(publicVotingMatch && voteOutcome ? { verifiedVoteCountA: voteOutcome.votesA, verifiedVoteCountB: voteOutcome.votesB, verifiedVoteTotal: voteOutcome.totalVotes } : {}),
      confirmedAt: new Date().toISOString(),
      confirmedBy: user.uid
    }, { merge: true });
    const submissionDurationMs = Number(currentTournament.submissionDurationHours ?? 48) * 60 * 60 * 1000;
    const openedAt = new Date().toISOString();
    const openedNextMatch = (next: TournamentMatchFoundation | null) => {
      if (!next?.participantAId || !next.participantBId || ["confirmed", "forfeit", "bye", "completed"].includes(next.status)) return next;
      if (Number(currentTournament.configVersion ?? 1) < 3) return { ...next, status: "ready" as const, updatedAt: openedAt };
      return { ...next, status: "submissions_open" as const, openedAt, submissionsOpenedAt: openedAt, submissionDeadlineAt: new Date(Date.parse(openedAt) + submissionDurationMs).toISOString(), updatedAt: openedAt };
    };
    const nextMatchToPersist = advancement.nextMatch ? openedNextMatch(advancement.nextMatch) : null;
    if (nextMatchToPersist) transaction.set(db.collection("tournamentMatches").doc(nextMatchToPersist.id), nextMatchToPersist, { merge: true });
    const openedRoundIds = new Set([nextMatchToPersist, loserContinues && currentLoserNextMatch ? openedNextMatch({ ...currentLoserNextMatch, ...(match.loserNextSlot === "A" ? { participantAId: loserParticipantId } : match.loserNextSlot === "B" ? { participantBId: loserParticipantId } : {}) }) : null, requiresGrandFinalReset && currentResetSnap?.exists ? openedNextMatch({ ...({ id: currentResetSnap.id, ...currentResetSnap.data() } as TournamentMatchFoundation), participantAId: winnerParticipantId, participantBId: loserParticipantId }) : null].filter((candidate): candidate is TournamentMatchFoundation => Boolean(candidate?.status === "submissions_open")).map((candidate) => candidate.roundId));
    dependentRoundSnaps.forEach((roundSnap, index) => {
      if (openedRoundIds.has(dependentRoundIds[index]) && roundSnap.exists && roundSnap.data()?.tournamentId === id) transaction.set(roundSnap.ref, { status: "active", startsAt: roundSnap.data()?.startsAt ?? openedAt, updatedAt: openedAt }, { merge: true });
    });
    transaction.set(db.collection(competitorCollection).doc(winnerParticipantId), { cumulativeScore: winnerScore.score, status: "active", updatedAt: new Date().toISOString() }, { merge: true });
    transaction.set(db.collection(competitorCollection).doc(loserParticipantId), { cumulativeScore: loserScore.score, lossCount: nextLosses, status: loserContinues ? "active" : "eliminated", updatedAt: new Date().toISOString() }, { merge: true });
    if (loserContinues && currentLoserNextMatch) {
      const updatedLoserMatch = { ...currentLoserNextMatch };
      if (match.loserNextSlot === "A") updatedLoserMatch.participantAId = loserParticipantId;
      if (match.loserNextSlot === "B") updatedLoserMatch.participantBId = loserParticipantId;
      const loserMatchToPersist = openedNextMatch(updatedLoserMatch);
      transaction.set(db.collection("tournamentMatches").doc(loserMatchToPersist?.id ?? updatedLoserMatch.id), loserMatchToPersist ?? updatedLoserMatch, { merge: true });
    }
    if (requiresGrandFinalReset && currentResetSnap?.exists) {
      const resetMatch = { ...({ id: currentResetSnap.id, ...currentResetSnap.data() } as TournamentMatchFoundation), participantAId: winnerParticipantId, participantBId: loserParticipantId };
      transaction.set(currentResetSnap.ref, openedNextMatch(resetMatch) ?? { ...resetMatch, status: "ready", updatedAt: new Date().toISOString() }, { merge: true });
    }
    transaction.set(db.collection("tournamentAuditEvents").doc(`${match.id}_result_confirmed`), { id: `${match.id}_result_confirmed`, tournamentId: id, actorId: user.uid, action: body.overrideReason ? "result_overridden" : "result_confirmed", reason: String(body.overrideReason ?? ""), createdAt: new Date().toISOString(), metadata: { matchId: match.id, advancement: advancement.code } });
    if (match.bracket === "bronze") {
      transaction.set(db.collection("tournamentPlacements").doc(`${id}_3`), { id: `${id}_3`, tournamentId: id, placement: 3, participantId: winnerParticipantId, userId: tournament.participationMode === "team" ? null : winnerParticipantId, teamId: tournament.participationMode === "team" ? winnerParticipantId : null, sourceMatchId: match.id, lockedAt: new Date().toISOString(), payoutStatus: "pending_admin_review" }, { merge: true });
    } else if (tournament.format === "double_elimination" && match.bracket === "losers" && match.nextMatchId?.endsWith("_grand_final")) {
      transaction.set(db.collection("tournamentPlacements").doc(`${id}_3`), { id: `${id}_3`, tournamentId: id, placement: 3, participantId: loserParticipantId, userId: tournament.participationMode === "team" ? null : loserParticipantId, teamId: tournament.participationMode === "team" ? loserParticipantId : null, sourceMatchId: match.id, lockedAt: new Date().toISOString(), payoutStatus: "pending_admin_review" }, { merge: true });
    } else if (!match.nextMatchId && match.bracket !== "losers" && !requiresGrandFinalReset) {
      const placementRows = finalPlacements({ finalMatch: { ...match, winnerParticipantId, loserParticipantId }, bronzeMatch: null });
      placementRows.forEach((placement) => transaction.set(db.collection("tournamentPlacements").doc(`${id}_${placement.placement}`), { ...placement, id: `${id}_${placement.placement}`, tournamentId: id, userId: tournament.participationMode === "team" ? null : placement.participantId, teamId: tournament.participationMode === "team" ? placement.participantId : null, lockedAt: new Date().toISOString(), payoutStatus: "pending_admin_review" }, { merge: true }));
      transaction.set(db.collection("tournaments").doc(id), { status: "under_review", resultsUnderReviewAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
    }
    });
  } catch (error) {
    const failure = error as Error & { code?: string };
    if (failure.code) return fail(failure.message, 409, undefined, failure.code);
    throw error;
  }
  return ok({ result, advancement, voteOutcome, grandFinalResetRequired: requiresGrandFinalReset }, requiresGrandFinalReset ? "A Grand Final reset is required because both finalists now have one loss." : "Tournament result confirmed server-side. Payout remains admin and ledger-gated.");
}
