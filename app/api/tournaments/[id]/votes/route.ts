import { getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { isTournamentCompetitorVoter, validateTournamentVote } from "@/lib/server/tournament-operations";
import { DOROCOIN_COST_PER_VOTE, validVotingTimeZone, voteDateKeyForTimeZone } from "@/lib/server/voting";
import { getActiveEconomyRules } from "@/lib/server/economy-rules";
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
  if (!["free", "dorocoin"].includes(requestedVoteType)) return fail("Choose a supported Tournament vote type.", 400, undefined, "TOURNAMENT_VOTE_TYPE_INVALID");
  const requestKey = String(body.idempotencyKey ?? "").trim();
  if (requestedVoteType === "dorocoin" && (!requestKey || requestKey.length > 128)) return fail("A valid idempotency key is required for DoroCoin voting.", 400, undefined, "IDEMPOTENCY_KEY_REQUIRED");
  const tournamentConfigSnap = await db.collection("tournaments").doc(id).get();
  const requestConfigVersion = Number(tournamentConfigSnap.data()?.configVersion ?? 1);
  const profileSnap = await db.collection("profiles").doc(user.uid).get();
  const configuredTimeZone = validVotingTimeZone(String(profileSnap.data()?.timeZone ?? profileSnap.data()?.timezone ?? (user as typeof user & { timeZone?: string }).timeZone ?? "UTC"));
  const voteDate = voteDateKeyForTimeZone(new Date(), configuredTimeZone);
  const requestHash = createHash("sha256").update(requestedVoteType === "dorocoin" ? requestKey : voteDate).digest("hex").slice(0, 32);
  const voteRef = db.collection("tournamentVotes").doc(requestConfigVersion >= 3 ? `${id}_${matchId}_${user.uid}_${requestedVoteType}_${requestHash}` : `${id}_${matchId}_${user.uid}`);
  const freeGuardRef = db.collection("tournamentFreeVoteDailyGuards").doc(createHash("sha256").update(`${id}:${matchId}:${user.uid}:${voteDate}`).digest("hex"));
  const paidGuardRef = db.collection("tournamentPaidVoteDailyGuards").doc(createHash("sha256").update(`${id}:${matchId}:${user.uid}:${voteDate}`).digest("hex"));
  const submissionRef = db.collection("tournamentSubmissions").doc(submissionId);
  const tournamentRef = db.collection("tournaments").doc(id);
  const matchRef = db.collection("tournamentMatches").doc(matchId);
  const now = new Date();
  const economyRules = requestedVoteType === "dorocoin" ? await getActiveEconomyRules(db) : null;
  let recordedVote: Record<string, unknown> | null = null;
  let idempotentReplay = false;
  try {
    await db.runTransaction(async (transaction) => {
      const [tournamentSnap, matchSnap, submissionSnap, voteSnap, voterSnap, membershipSnap, voteGuardSnap, walletSnap] = await Promise.all([
        transaction.get(tournamentRef),
        transaction.get(matchRef),
        transaction.get(submissionRef),
        transaction.get(voteRef),
        transaction.get(db.collection("users").doc(user.uid)),
        transaction.get(db.collection("tournamentTeamMemberships").doc(`${id}_${user.uid}`)),
        transaction.get(requestedVoteType === "free" ? freeGuardRef : paidGuardRef),
        requestedVoteType === "dorocoin" ? transaction.get(db.collection("doroCoinWallets").doc(user.uid)) : Promise.resolve(null)
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
        if (existingVote.tournamentId === id && existingVote.matchId === matchId && existingVote.voterId === user.uid && existingVote.submissionId === submissionId && existingVote.participantId === selectedParticipantId && existingVote.status === "recorded" && existingVote.voteType === requestedVoteType) {
          recordedVote = { id: voteSnap.id, ...existingVote };
          idempotentReplay = true;
          return;
        }
        throw Object.assign(new Error("This idempotency key has already been used for a different Tournament vote."), { code: "DUPLICATE_VOTE_BLOCKED", status: 409 });
      }
      const configVersion = Number(tournament.configVersion ?? 1);
      if (configVersion !== requestConfigVersion) throw Object.assign(new Error("Tournament configuration changed. Retry this vote."), { code: "TOURNAMENT_CONFIG_CHANGED", status: 409 });
      if (configVersion >= 3 && requestedVoteType === "dorocoin" && ((tournament.voting as Record<string, unknown>)?.paidVotesActive !== true || !economyRules?.voting.paidVotingEnabled)) throw Object.assign(new Error("Additional DoroCoin Tournament voting is not enabled."), { code: "PAID_VOTING_DISABLED", status: 403 });
      if (configVersion < 3 && requestedVoteType !== "free") throw Object.assign(new Error("Legacy Tournament voting supports free votes only."), { code: "TOURNAMENT_PAID_VOTING_UNSUPPORTED", status: 400 });
      const voterAccount = voterSnap.data() ?? {};
      const voterTimeZone = configuredTimeZone;
      if (tournament.hostId === user.uid) throw Object.assign(new Error("Tournament hosts and competitors in this match cannot vote in it."), { code: "TOURNAMENT_SELF_VOTING_BLOCKED", status: 403 });
      const roundRef = db.collection("tournamentRounds").doc(match.roundId);
      const competitorCollection = tournament.participationMode === "team" ? "tournamentTeams" : "tournamentParticipants";
      const competitorRef = db.collection(competitorCollection).doc(selectedParticipantId);
      const [roundSnap, competitorSnap, duplicateSnap] = await Promise.all([
        transaction.get(roundRef),
        transaction.get(competitorRef),
        configVersion < 3 ? transaction.get(db.collection("tournamentVotes").where("tournamentId", "==", id).where("matchId", "==", matchId).where("voterId", "==", user.uid).limit(1)) : Promise.resolve(null)
      ]);
      if (!roundSnap.exists) throw Object.assign(new Error("The match round does not exist."), { code: "TOURNAMENT_ROUND_NOT_FOUND", status: 404 });
      const round = { id: roundSnap.id, ...roundSnap.data() } as TournamentRoundFoundation;
      const validation = validateTournamentVote({ tournament, match, round, now });
      if (!validation.valid) throw Object.assign(new Error(validation.message), { code: validation.code, status: 409, details: validation });
      if (!competitorSnap.exists) throw Object.assign(new Error("The selected competitor is not part of this Tournament."), { code: "TOURNAMENT_COMPETITOR_NOT_FOUND", status: 403 });
      const competitor = competitorSnap.data() ?? {};
      const allowedCompetitorStatuses = tournament.participationMode === "team" ? ["checked_in", "active"] : ["registered", "checked_in", "active"];
      if (competitor.tournamentId !== id || !allowedCompetitorStatuses.includes(String(competitor.status ?? ""))) throw Object.assign(new Error("The selected competitor is not eligible in this Tournament."), { code: "TOURNAMENT_COMPETITOR_INELIGIBLE", status: 403 });
      if (isTournamentCompetitorVoter({ userId: user.uid, participationMode: tournament.participationMode, competitor, membership: membershipSnap.data() ?? null, teamId: selectedParticipantId })) throw Object.assign(new Error("Tournament competitors cannot vote in their own match."), { code: "TOURNAMENT_SELF_VOTING_BLOCKED", status: 403 });
      if (![match.participantAId, match.participantBId].includes(selectedParticipantId)) throw Object.assign(new Error("The selected competitor is not assigned to this match."), { code: "TOURNAMENT_MATCH_TARGET_MISMATCH", status: 403 });
      if (submission.tournamentId !== id || submission.matchId !== matchId || submission.roundId !== match.roundId || submission.participantId !== selectedParticipantId) throw Object.assign(new Error("The submission is not assigned to the selected competitor and match."), { code: "TOURNAMENT_SUBMISSION_TARGET_MISMATCH", status: 403 });
      if (!["submitted", "approved", "active"].includes(String(submission.status ?? ""))) throw Object.assign(new Error("This submission is not eligible for Tournament voting."), { code: "TOURNAMENT_SUBMISSION_INELIGIBLE", status: 409 });
      if (tournament.participationMode === "team" && submission.teamId !== selectedParticipantId) throw Object.assign(new Error("The submission does not belong to the selected Team."), { code: "TOURNAMENT_TEAM_SUBMISSION_MISMATCH", status: 403 });
      if (configVersion < 3 && duplicateSnap && !duplicateSnap.empty) throw Object.assign(new Error("One vote per verified account per match has already been recorded."), { code: "DUPLICATE_VOTE_BLOCKED", status: 409 });
      if (configVersion >= 3 && requestedVoteType === "free" && voteGuardSnap?.exists) throw Object.assign(new Error("One free Tournament vote per match and local calendar day has already been recorded."), { code: "DUPLICATE_VOTE_BLOCKED", status: 409 });
      let paidWalletBefore: number | null = null;
      if (configVersion >= 3 && requestedVoteType === "dorocoin") {
        const guard = voteGuardSnap?.data() ?? {};
        const quantity = Number(guard.quantity ?? 0);
        const dailyLimit = Number(economyRules?.voting.paidVoteDailyLimit ?? 0);
        if (quantity >= dailyLimit) throw Object.assign(new Error("The daily additional Tournament vote limit has been reached."), { code: "PAID_VOTE_DAILY_LIMIT", status: 409 });
        const wallet = walletSnap?.data() ?? {};
        const balance = Number(wallet.balance ?? 0);
        if (!Number.isFinite(balance) || balance < DOROCOIN_COST_PER_VOTE) throw Object.assign(new Error("Five DoroCoins are required for an additional Tournament vote."), { code: "INSUFFICIENT_DOROCOINS", status: 422 });
        paidWalletBefore = balance;
      }
      const sequence = Number(match.voteSequence ?? 0) + 1;
      const vote = {
        id: voteRef.id,
        tournamentId: id,
        roundId: round.id,
        matchId,
        voterId: user.uid,
        submissionId,
        participantId: selectedParticipantId,
        selectedParticipantId,
        voteType: requestedVoteType,
        voteDate,
        timeZone: voterTimeZone,
        voteSequence: sequence,
        status: "recorded",
        validationVersion: 2,
        createdAt: now.toISOString()
      };
      transaction.create(voteRef, vote);
      const voteCountField = selectedParticipantId === match.participantAId ? "voteCountA" : "voteCountB";
      transaction.update(matchRef, { [voteCountField]: FieldValue.increment(1), voteSequence: sequence, updatedAt: now.toISOString() });
      if (configVersion >= 3 && requestedVoteType === "free") transaction.create(freeGuardRef, { id: freeGuardRef.id, tournamentId: id, matchId, voterId: user.uid, voteDate, timeZone: voterTimeZone, createdAt: now.toISOString() });
      if (configVersion >= 3 && requestedVoteType === "dorocoin") {
        const walletRef = db.collection("doroCoinWallets").doc(user.uid);
        const after = Number(paidWalletBefore) - DOROCOIN_COST_PER_VOTE;
        const transactionRef = db.collection("doroCoinTransactions").doc(`tournament_vote_${voteRef.id}`);
        transaction.update(walletRef, { balance: after, withdrawable: false, updatedAt: now.toISOString() });
        transaction.create(transactionRef, { id: transactionRef.id, userId: user.uid, category: "dorocoin", amount: DOROCOIN_COST_PER_VOTE, signedAmount: -DOROCOIN_COST_PER_VOTE, direction: "debit", balanceBefore: paidWalletBefore, balanceAfter: after, type: "tournament_vote_spend", sourceType: "tournament_vote_spend", sourceId: voteRef.id, tournamentId: id, matchId, idempotencyKey: requestKey, immutable: true, cashOutEnabled: false, withdrawable: false, createdBy: user.uid, createdAt: now.toISOString() });
        transaction.set(paidGuardRef, { id: paidGuardRef.id, tournamentId: id, matchId, userId: user.uid, voteDate, timeZone: voterTimeZone, quantity: Number(voteGuardSnap?.data()?.quantity ?? 0) + 1, maximum: Number(economyRules?.voting.paidVoteDailyLimit ?? 0), updatedAt: now.toISOString() }, { merge: true });
        const holdRef = db.collection("paidVoteEconomyHolds").doc(`tournament_${voteRef.id}`);
        transaction.create(holdRef, { id: holdRef.id, userId: user.uid, tournamentId: id, matchId, quantity: 1, doroCoinsSpent: DOROCOIN_COST_PER_VOTE, status: "held_pending_tournament_completion", releaseRequiresTournamentCompletion: true, releaseRequiresFraudClearance: true, releaseRequiresDisputeClearance: true, cashEquivalentAmountCents: null, distributionStatus: "non_cash_tournament_vote", ruleVersion: economyRules?.version ?? null, createdAt: now.toISOString(), updatedAt: now.toISOString() });
      }
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
