import { queueInAppNotification } from "@/lib/server/notifications";
import type { Firestore } from "firebase-admin/firestore";
import { isIndividualTournamentPolicy } from "@/lib/individual-tournament-policy";
import { assertIndividualSettlementClearance } from "@/lib/server/individual-settlement-clearance";
import { finalizeVerifiedIndividualSettlement } from "@/lib/server/tournament-settlement";
import { getTournamentFundingSources } from "@/lib/server/tournament-funding-sources";
import { CASH_EARNING_HOLD_HOURS } from "@/lib/server/payout-structure";
import { getTournamentCreatorFunding } from "@/lib/server/tournament-creator-funding";

export async function clearIndividualTournamentEarnings(db: Firestore, tournamentId: string, now = new Date()) {
  const credits = await db.collection("cashLedger").where("challengeId", "==", tournamentId).get();
  let cleared = 0;
  for (const item of credits.docs) {
    if (item.data().automaticIndividual !== true || !["challenge_winner_prize", "sponsor_prize"].includes(String(item.data().sourceType))) continue;
    const changed = await db.runTransaction(async transaction => {
      const credit = await transaction.get(item.ref), source = credit.data() ?? {};
      if (!credit.exists || source.automaticIndividual !== true || source.status !== "pending_review" || source.balanceBucket !== "pending" || source.disputeRestricted === true || source.stripeDisputeRestricted === true || source.financialRestriction || Number(source.reservedAmountCents ?? 0) !== 0) return false;
      const [tournament, settlement, wallet] = await Promise.all([
        transaction.get(db.collection("tournaments").doc(tournamentId)), transaction.get(db.collection("challengeSettlements").doc(String(source.settlementId))), transaction.get(db.collection("cashWallets").doc(String(source.userId)))
      ]);
      const data = settlement.data() ?? {}, winnerRows = Array.isArray(data.winnerDistribution) ? data.winnerDistribution : [];
      const winners = [...new Set(winnerRows.map(row => String(row.userId)))];
      if (!tournament.exists || !settlement.exists || data.automaticIndividual !== true || data.challengeId !== tournamentId || tournament.data()?.settlementId !== settlement.id || data.disputeRestricted === true) return false;
      await assertIndividualSettlementClearance(db, transaction, tournamentId, tournament.data()!, winners);
      const sources = await getTournamentFundingSources(db, tournamentId, transaction);
      const creatorFunding = await getTournamentCreatorFunding(db, tournamentId, tournament.data()!, transaction);
      if (creatorFunding.reviewCount || creatorFunding.pendingCount || creatorFunding.confirmedCreatorCents !== sources.confirmedCreatorPrizeCents) throw new Error("INDIVIDUAL_CLEARANCE_FUNDING_CHANGED");
      if (JSON.stringify(sources.sourceBreakdown) !== JSON.stringify(data.sourceBreakdown) || sources.confirmedEntryRevenueCents + sources.confirmedPaidVoteRevenueCents !== Number(data.grossConfirmedChallengeRevenue) || sources.confirmedCreatorPrizeCents !== Number(data.grossConfirmedCreatorPrizeAmount) || sources.confirmedSponsorPrizeCents !== Number(data.grossConfirmedSponsorPrizeAmount)) throw new Error("INDIVIDUAL_CLEARANCE_FUNDING_CHANGED");
      const created = Date.parse(String(source.createdAt)), until = Date.parse(String(source.holdUntil));
      if (!Number.isFinite(created) || !Number.isFinite(until) || now.getTime() < Math.max(until, created + CASH_EARNING_HOLD_HOURS * 3_600_000)) return false;
      const amount = Number(source.netAmountCents), pending = Number(wallet.data()?.pendingBalanceCents), available = Number(wallet.data()?.availableBalanceCents ?? 0);
      if (!wallet.exists || wallet.data()?.currency !== "USD" || !Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(pending) || pending < amount || !Number.isSafeInteger(available) || available < 0 || !Number.isSafeInteger(available + amount)) throw new Error("INDIVIDUAL_CLEARANCE_BALANCE_RECONCILIATION_REQUIRED");
      transaction.update(wallet.ref, { pendingBalanceCents: pending - amount, availableBalanceCents: available + amount, updatedAt: now.toISOString() });
      transaction.update(credit.ref, { status: "available", balanceBucket: "available", availableAmountCents: amount, reservedAmountCents: 0, availableAt: now.toISOString(), updatedAt: now.toISOString() });
      if (typeof source.userId === "string" && source.userId) queueInAppNotification(db, transaction, { eventId: `individual_clearance_${credit.id}`, userId: source.userId, type: "prize_cleared", title: "Tournament prize clearance recorded", message: "Verified eligible prize funds moved to your available wallet balance. Withdrawal remains separately authorized; no external payout was executed.", actionUrl: "/wallet", createdAt: now.toISOString() });
      transaction.create(db.collection("auditLogs").doc(`individual_clearance_${credit.id}`), { action: "individual.earning_cleared", actorId: "system_individual_settlement", userId: source.userId, tournamentId, targetId: credit.id, amountCents: amount, externalPayoutExecuted: false, createdAt: now.toISOString() });
      return true;
    });
    if (changed) cleared++;
  }
  return { cleared, externalPayoutExecuted: false };
}

export async function reconcileAutomaticIndividualSettlement(db: Firestore, tournamentId: string, now = new Date()) {
  const ref = db.collection("tournaments").doc(tournamentId), snapshot = await ref.get();
  if (!snapshot.exists || !isIndividualTournamentPolicy(snapshot.data()!) || !["under_review", "final", "winners_announced", "completed"].includes(String(snapshot.data()?.status))) return { status: "not_applicable" };
  try {
    const result = snapshot.data()?.settlementId && Number(snapshot.data()?.prizeCorrectionVersion ?? 0) > 0
      ? { settlement: { created: false } }
      : await finalizeVerifiedIndividualSettlement(db, tournamentId);
    const clearance = await clearIndividualTournamentEarnings(db, tournamentId, now);
    await ref.set({ automaticSettlementStatus: "credits_recorded", automaticSettlementHoldReason: null, automaticSettlementCheckedAt: now.toISOString() }, { merge: true });
    return { status: "credits_recorded", created: result.settlement.created, ...clearance };
  } catch (error) {
    const reason = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "INDIVIDUAL_SETTLEMENT_INTEGRITY_UNVERIFIED";
    await ref.set({ automaticSettlementStatus: "held", automaticSettlementHoldReason: reason, automaticSettlementCheckedAt: now.toISOString() }, { merge: true });
    return { status: "held", reason, externalPayoutExecuted: false };
  }
}
