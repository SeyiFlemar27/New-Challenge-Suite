import { getTournamentFundingSources } from "@/lib/server/tournament-funding-sources";
import type { Firestore } from "firebase-admin/firestore";
import { createInternalChallengeSettlement, type SettlementWinner } from "@/lib/server/challenge-settlement";
import { deterministicId } from "@/lib/server/idempotency";
import { tournamentPlacementFingerprint, validateTournamentPlacementEvidence } from "@/lib/server/tournament-settlement-policy";
export { tournamentPlacementFingerprint } from "@/lib/server/tournament-settlement-policy";

type Row = Record<string, unknown> & { id: string };

async function resolveIndividualWinner(db: Firestore, tournamentId: string, placement: Row): Promise<SettlementWinner> {
  const participantId = String(placement.participantId ?? "");
  const participant = await db.collection("tournamentParticipants").doc(participantId).get();
  const userId = String(participant.data()?.userId ?? placement.userId ?? "");
  if (!participant.exists || !userId || participant.data()?.tournamentId !== tournamentId || ["disqualified", "withdrawn", "rejected", "refunded"].includes(String(participant.data()?.status))) throw new Error("TOURNAMENT_PLACEMENT_PARTICIPANT_INVALID");
  return { userId, submissionId: null, placement: Number(placement.placement), splitPercent: 0, payoutStatus: "pending_admin_review" };
}

async function resolveTeamWinners(db: Firestore, tournamentId: string, placement: Row): Promise<SettlementWinner[]> {
  const teamId = String(placement.teamId ?? placement.participantId ?? "");
  const team = await db.collection("tournamentTeams").doc(teamId).get();
  const data = team.data() ?? {};
  if (!team.exists || data.tournamentId !== tournamentId || !data.rosterLockedAt) throw new Error("TOURNAMENT_LOCKED_ROSTER_REQUIRED");
  const roster = Array.isArray(data.memberUserIds) ? [...new Set(data.memberUserIds.filter((value): value is string => typeof value === "string" && Boolean(value)))] : [];
  if (!roster.length) throw new Error("TOURNAMENT_LOCKED_ROSTER_REQUIRED");
  const accountSnaps = await Promise.all(roster.map((userId) => db.collection("users").doc(userId).get()));
  const disqualified = new Set(Array.isArray(data.disqualifiedMemberUserIds) ? data.disqualifiedMemberUserIds : []);
  const winners = roster.map((userId, allocationOrder) => {
    const account = accountSnaps[allocationOrder]?.data() ?? {};
    const payoutHold = data.memberEligibilityDecisions?.[userId] === "temporary_hold" || account.withdrawalRestricted === true || account.payoutHold === true || account.accountStatus === "suspended";
    return {
      userId,
      submissionId: null,
      placement: Number(placement.placement),
      splitPercent: 0,
      teamId,
      rosterSnapshotReference: `tournamentTeams/${teamId}@${String(data.rosterLockedAt)}`,
      allocationOrder,
      payoutStatus: payoutHold ? "pending_hold" : "pending_admin_review"
    } satisfies SettlementWinner;
  }).filter((winner) => !disqualified.has(winner.userId));
  if (!winners.length) throw new Error("TOURNAMENT_LOCKED_ROSTER_REQUIRED");
  return winners;
}

export async function finalizeTournamentSettlement(db: Firestore, input: { tournamentId: string; adminId: string; reason: string }) {
  if (!input.adminId || input.reason.trim().length < 5) throw new Error("TOURNAMENT_ADMIN_REASON_REQUIRED");
  const tournamentRef = db.collection("tournaments").doc(input.tournamentId);
  const [tournamentSnap, placementsSnap] = await Promise.all([
    tournamentRef.get(),
    db.collection("tournamentPlacements").where("tournamentId", "==", input.tournamentId).get()
  ]);
  if (!tournamentSnap.exists) throw new Error("TOURNAMENT_NOT_FOUND");
  const tournament = { id: tournamentSnap.id, ...tournamentSnap.data() } as Row;
  if (tournament.financialHold === true) throw new Error("TOURNAMENT_FINANCIAL_HOLD");
  if (!["under_review", "final", "completed", "winners_announced"].includes(String(tournament.status ?? ""))) throw new Error("TOURNAMENT_RESULTS_NOT_FINAL");
  const expectedEndAt = Date.parse(String(tournament.expectedEndAt ?? ""));
  if (Number.isFinite(expectedEndAt) && expectedEndAt > Date.now()) throw new Error("TOURNAMENT_RESULTS_NOT_FINAL");
  const placements = placementsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Row)).filter((item) => [1, 2, 3].includes(Number(item.placement)));
  if (!placements.some((item) => Number(item.placement) === 1)) throw new Error("TOURNAMENT_OFFICIAL_PLACEMENTS_REQUIRED");
  const orderedPositions = placements.map((item) => Number(item.placement)).sort((a, b) => a - b);
  if (new Set(orderedPositions).size !== orderedPositions.length || orderedPositions.some((position, index) => position !== index + 1)) throw new Error("TOURNAMENT_OFFICIAL_PLACEMENTS_REQUIRED");
  let unawardedThirdPlaceMatchId: string | null = null;
  if (Number(tournament.configVersion ?? 1) >= 3 && !orderedPositions.includes(3)) {
    if (tournament.format !== "single_elimination" || !orderedPositions.includes(2)) throw new Error("TOURNAMENT_OFFICIAL_PLACEMENTS_REQUIRED");
    const bronze = await db.collection("tournamentMatches").where("tournamentId", "==", input.tournamentId).where("bracket", "==", "bronze").get();
    if (bronze.size !== 1 || bronze.docs[0].data().status !== "double_forfeit_hold" || bronze.docs[0].data().noSubmissionExtensionUsed !== true) throw new Error("TOURNAMENT_THIRD_PLACE_UNRESOLVED");
    unawardedThirdPlaceMatchId = bronze.docs[0].id;
  }
  const placedCompetitors = placements.map((item) => String(item.participantId ?? ""));
  if (placedCompetitors.some((id) => !id) || new Set(placedCompetitors).size !== placedCompetitors.length) throw new Error("TOURNAMENT_OFFICIAL_PLACEMENTS_REQUIRED");
  const evidence = await Promise.all(placements.map(async (placement) => {
    const sourceMatchId = String(placement.sourceMatchId ?? "");
    if (!sourceMatchId) return false;
    const source = await db.collection("tournamentMatches").doc(sourceMatchId).get();
    return source.exists && validateTournamentPlacementEvidence(tournament, placement, { id: source.id, ...source.data() });
  }));
  if (evidence.some((valid) => !valid)) throw new Error("TOURNAMENT_PLACEMENT_SOURCE_MATCH_INVALID");
  const fingerprint = tournamentPlacementFingerprint(placements, tournament.productPolicyVersion);
  if (tournament.creatorPlacementReviewFingerprint !== fingerprint) throw new Error("TOURNAMENT_CREATOR_REVIEW_REQUIRED");
  if (tournament.settlementPlacementFingerprint && tournament.settlementPlacementFingerprint !== fingerprint) throw new Error("TOURNAMENT_SETTLEMENT_CORRECTION_REQUIRED");

  const competitorCollection = tournament.participationMode === "team" ? "tournamentTeams" : "tournamentParticipants";
  const placedCompetitorSnaps = await Promise.all(placedCompetitors.map((competitorId) => db.collection(competitorCollection).doc(competitorId).get()));
  if (placedCompetitorSnaps.some((snapshot) => !snapshot.exists || snapshot.data()?.tournamentId !== input.tournamentId)) throw new Error("TOURNAMENT_PLACEMENT_PARTICIPANT_INVALID");
  const winnerGroups = await Promise.all(placements.map((placement) => tournament.participationMode === "team"
    ? resolveTeamWinners(db, input.tournamentId, placement)
    : resolveIndividualWinner(db, input.tournamentId, placement).then((winner) => [winner])));
  const winners = winnerGroups.flat();
  const lockedRosterSnapshots = tournament.participationMode === "team"
    ? winnerGroups.map((group) => ({
      teamId: group[0]?.teamId ?? null,
      rosterSnapshotReference: group[0]?.rosterSnapshotReference ?? null,
      memberUserIds: group.slice().sort((a, b) => Number(a.allocationOrder) - Number(b.allocationOrder)).map((winner) => winner.userId)
    }))
    : [];
  const proposalId = deterministicId("tournament_winner_proposal", input.tournamentId, fingerprint);
  const now = new Date().toISOString();
  const sources = await getTournamentFundingSources(db, input.tournamentId);
  const settlement = await createInternalChallengeSettlement(db, {
    challengeId: input.tournamentId,
    proposalId,
    adminId: input.adminId,
    challenge: { ...tournament, ...(unawardedThirdPlaceMatchId ? { thirdPlaceOutcome: "unawarded" } : {}), settlementEntityType: "tournament", creatorId: tournament.hostId, ownerId: tournament.hostId },
    winners,
    approvedAt: now,
    entityCollection: "tournaments",
    confirmedSources: sources,
    proposalMetadata: {
      id: proposalId,
      challengeId: input.tournamentId,
      tournamentId: input.tournamentId,
      entityType: "tournament",
      status: "approved",
      source: "competition_derived_tournament_placements",
      placementFingerprint: fingerprint,
      placementIds: placements.map((item) => item.id),
      winners,
      lockedRosterSnapshots,
      reviewedAt: now,
      reviewedByAdminId: input.adminId,
      adminDecision: "approved",
      adminNote: input.reason,
      payoutExecutionEnabled: false,
      updatedAt: now,
      createdAt: now
    },
    sourceProvenance: { tournamentId: input.tournamentId, placementFingerprint: fingerprint, placementIds: placements.map((item) => item.id), participationMode: tournament.participationMode, unawardedThirdPlaceMatchId, lockedRosterAuthority: tournament.participationMode === "team", lockedRosterSnapshots }
  });
  return { settlement, proposalId, placementFingerprint: fingerprint, winnerAllocationCount: winners.length, confirmedSources: sources, payoutProviderCalled: false, externalPayoutExecuted: false };
}
