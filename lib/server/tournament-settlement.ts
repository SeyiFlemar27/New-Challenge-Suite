import type { Firestore } from "firebase-admin/firestore";
import { createInternalChallengeSettlement, type SettlementWinner } from "@/lib/server/challenge-settlement";
import { deterministicId } from "@/lib/server/idempotency";

type Row = Record<string, unknown> & { id: string };

function amount(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function confirmed(record: Record<string, unknown>) {
  return record.webhookConfirmed === true && ["paid", "confirmed"].includes(String(record.status ?? ""));
}

async function confirmedRows(db: Firestore, collection: string, tournamentId: string) {
  const snap = await db.collection(collection).where("tournamentId", "==", tournamentId).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Row)).filter(confirmed);
}

export function tournamentPlacementFingerprint(placements: Row[]) {
  return deterministicId("tournament_placements", ...placements
    .slice()
    .sort((a, b) => Number(a.placement) - Number(b.placement))
    .map((item) => `${item.placement}:${String(item.userId ?? item.teamId ?? item.participantId)}:${String(item.sourceMatchId ?? "")}`));
}

async function tournamentConfirmedSources(db: Firestore, tournamentId: string) {
  const [entries, paidVotes, sponsors, creatorPrize] = await Promise.all([
    confirmedRows(db, "challengeEntryPayments", tournamentId),
    confirmedRows(db, "paidVotePurchases", tournamentId),
    confirmedRows(db, "sponsorContributions", tournamentId),
    confirmedRows(db, "creatorPrizeFundingPayments", tournamentId)
  ]);
  const prizeSponsors = sponsors.filter((item) => ["prize", "prize_funding", "winner_prize"].includes(String(item.fundingPurpose ?? item.sponsorshipPurpose ?? "prize")));
  const gross = (rows: Row[]) => rows.reduce((sum, item) => sum + amount(item.amountCents ?? item.amount ?? item.grossAmountCents), 0);
  return {
    confirmedEntryRevenueCents: gross(entries),
    confirmedPaidVoteRevenueCents: gross(paidVotes),
    confirmedSponsorPrizeCents: gross(prizeSponsors),
    confirmedCreatorPrizeCents: gross(creatorPrize),
    entryPaymentCount: entries.length,
    paidVotePaymentCount: paidVotes.length,
    sponsorPaymentCount: prizeSponsors.length,
    creatorPrizePaymentCount: creatorPrize.length,
    sourceBreakdown: {
      confirmedEntryPaymentIds: entries.map((item) => item.id),
      confirmedPaidVotePaymentIds: paidVotes.map((item) => item.id),
      confirmedSponsorPaymentIds: prizeSponsors.map((item) => item.id),
      confirmedCreatorPrizePaymentIds: creatorPrize.map((item) => item.id),
      excludedNonPrizeSponsorPaymentIds: sponsors.filter((item) => !prizeSponsors.includes(item)).map((item) => item.id)
    },
    confirmedOnly: true as const,
    pendingFailedCancelledExcluded: true as const
  };
}

async function resolveIndividualWinner(db: Firestore, tournamentId: string, placement: Row): Promise<SettlementWinner> {
  const participantId = String(placement.participantId ?? "");
  const participant = await db.collection("tournamentParticipants").doc(participantId).get();
  const userId = String(participant.data()?.userId ?? placement.userId ?? "");
  if (!participant.exists || !userId || participant.data()?.tournamentId !== tournamentId) throw new Error("TOURNAMENT_PLACEMENT_PARTICIPANT_INVALID");
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
    const payoutHold = account.withdrawalRestricted === true || account.payoutHold === true || account.accountStatus === "suspended";
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
  const tournamentRef = db.collection("tournaments").doc(input.tournamentId);
  const [tournamentSnap, placementsSnap] = await Promise.all([
    tournamentRef.get(),
    db.collection("tournamentPlacements").where("tournamentId", "==", input.tournamentId).get()
  ]);
  if (!tournamentSnap.exists) throw new Error("TOURNAMENT_NOT_FOUND");
  const tournament = { id: tournamentSnap.id, ...tournamentSnap.data() } as Row;
  if (!["under_review", "final", "completed", "winners_announced"].includes(String(tournament.status ?? ""))) throw new Error("TOURNAMENT_RESULTS_NOT_FINAL");
  const expectedEndAt = Date.parse(String(tournament.expectedEndAt ?? ""));
  if (Number.isFinite(expectedEndAt) && expectedEndAt > Date.now()) throw new Error("TOURNAMENT_RESULTS_NOT_FINAL");
  const placements = placementsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Row)).filter((item) => [1, 2, 3].includes(Number(item.placement)));
  if (!placements.some((item) => Number(item.placement) === 1)) throw new Error("TOURNAMENT_OFFICIAL_PLACEMENTS_REQUIRED");
  const orderedPositions = placements.map((item) => Number(item.placement)).sort((a, b) => a - b);
  if (new Set(orderedPositions).size !== orderedPositions.length || orderedPositions.some((position, index) => position !== index + 1)) throw new Error("TOURNAMENT_OFFICIAL_PLACEMENTS_REQUIRED");
  const fingerprint = tournamentPlacementFingerprint(placements);
  if (tournament.creatorPlacementReviewFingerprint !== fingerprint) throw new Error("TOURNAMENT_CREATOR_REVIEW_REQUIRED");
  if (tournament.settlementPlacementFingerprint && tournament.settlementPlacementFingerprint !== fingerprint) throw new Error("TOURNAMENT_SETTLEMENT_CORRECTION_REQUIRED");

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
  const sources = await tournamentConfirmedSources(db, input.tournamentId);
  const settlement = await createInternalChallengeSettlement(db, {
    challengeId: input.tournamentId,
    proposalId,
    adminId: input.adminId,
    challenge: { ...tournament, creatorId: tournament.hostId, ownerId: tournament.hostId },
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
    sourceProvenance: { tournamentId: input.tournamentId, placementFingerprint: fingerprint, placementIds: placements.map((item) => item.id), participationMode: tournament.participationMode, lockedRosterAuthority: tournament.participationMode === "team", lockedRosterSnapshots }
  });
  const batch = db.batch();
  placements.forEach((placement) => batch.set(db.collection("tournamentPlacements").doc(placement.id), { payoutStatus: "pending_admin_review", settlementId: settlement.settlement.id, settlementProposalId: proposalId, settlementPlacementFingerprint: fingerprint, updatedAt: now }, { merge: true }));
  batch.set(tournamentRef, { status: "winners_announced", officialPlacementsFinalizedAt: now, officialPlacementsFinalizedBy: input.adminId, settlementId: settlement.settlement.id, settlementStatus: settlement.settlement.status, settlementPlacementFingerprint: fingerprint, payoutExecutionEnabled: false, updatedAt: now }, { merge: true });
  batch.set(db.collection("tournamentAuditEvents").doc(deterministicId("tournament_settlement_finalized", input.tournamentId, fingerprint)), { id: deterministicId("tournament_settlement_finalized", input.tournamentId, fingerprint), tournamentId: input.tournamentId, actorId: input.adminId, action: "official_placements_finalized_and_settlement_prepared", reason: input.reason, createdAt: now, metadata: { proposalId, settlementId: settlement.settlement.id, placementFingerprint: fingerprint, externalPayoutExecuted: false } }, { merge: true });
  await batch.commit();
  return { settlement, proposalId, placementFingerprint: fingerprint, winnerAllocationCount: winners.length, confirmedSources: sources, payoutProviderCalled: false, externalPayoutExecuted: false };
}
