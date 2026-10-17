import type { Firestore, Transaction } from "firebase-admin/firestore";
import { isTournamentSponsorPaymentTimely } from "@/lib/server/tournament-sponsor-cutoff";
import { readTournamentSponsorVotingEvidence } from "@/lib/server/tournament-sponsor-evidence";
type Row = Record<string, unknown> & { id: string; sourceCollection: string };

async function paymentRows(db: Firestore, collection: string, tournamentId: string, transaction?: Transaction) {
  const query = db.collection(collection).where("tournamentId", "==", tournamentId);
  const snapshot = transaction ? await transaction.get(query) : await query.get();
  const rows = snapshot.docs.map(document => ({ ...document.data(), id: document.id, sourceCollection: collection }) as Row);
  if (rows.some(row => row.financialRestriction === "stripe_dispute" || row.stripeDisputeRestricted === true
    || (row.status !== "refunded" && (row.financialRestriction || row.settlementRestricted === true || row.refundLiabilityStatus === "pending"
      || ["member_confirmed", "refund_required", "refund_review", "partially_refunded", "refund_review_required", "refund_pending", "review_required", "payment_review_required"].includes(String(row.status)))))) throw new Error("TOURNAMENT_FUNDING_RECONCILIATION_REQUIRED");
  return rows.filter(row => row.webhookConfirmed === true && ["paid", "confirmed"].includes(String(row.status)));
}

export function uniqueTournamentEntrySources(rows: Row[]) {
  const seen = new Map<string, Row>();
  for (const row of rows) {
    const reference = String(row.providerPaymentIntentId ?? row.stripePaymentIntentId ?? "");
    const key = reference ? `stripe:${reference}` : `${row.sourceCollection}:${row.id}`;
    const prior = seen.get(key);
    if (prior && (Number(prior.amountCents ?? prior.amount) !== Number(row.amountCents ?? row.amount) || String(prior.currency).toUpperCase() !== String(row.currency).toUpperCase())) throw new Error("TOURNAMENT_FUNDING_REFERENCE_CONFLICT");
    if (!prior) seen.set(key, row);
  }
  return [...seen.values()];
}

/** Shared by preview and the final settlement transaction; no independent ledger. */
export async function getTournamentFundingSources(db: Firestore, tournamentId: string, transaction?: Transaction) {
  const [entry, legacyEntry, paidVotes, sponsors, creatorPrize, promotionalSnap, refunds] = await Promise.all([
    paymentRows(db, "tournamentEntryPayments", tournamentId, transaction),
    paymentRows(db, "challengeEntryPayments", tournamentId, transaction),
    paymentRows(db, "paidVotePurchases", tournamentId, transaction),
    paymentRows(db, "sponsorContributions", tournamentId, transaction),
    paymentRows(db, "creatorPrizeFundingPayments", tournamentId, transaction),
    transaction ? transaction.get(db.collection("enterprisePromotionalPrizeFunding").where("challengeId", "==", tournamentId)) : db.collection("enterprisePromotionalPrizeFunding").where("challengeId", "==", tournamentId).get(),
    transaction ? transaction.get(db.collection("refundCases").where("tournamentId", "==", tournamentId)) : db.collection("refundCases").where("tournamentId", "==", tournamentId).get()
  ]);
  if (refunds.docs.some(document => !["succeeded", "rejected", "cancelled"].includes(String(document.data().status)))) throw new Error("TOURNAMENT_REFUND_RECONCILIATION_REQUIRED");
  const entries = uniqueTournamentEntrySources([...entry, ...legacyEntry]);
  const promotional = promotionalSnap.docs.map(document => ({ ...document.data(), id: document.id } as Record<string, unknown> & { id: string })).filter(row => row.status === "confirmed");
  const prizeSponsors = sponsors.filter(row => ["prize", "prize_funding", "winner_prize", "prize_pool_funding"].includes(String(row.fundingPurpose ?? row.sponsorshipPurpose ?? ""))
    || (row.paymentPurpose === "sponsor_funding" && (row.metadata as Record<string, unknown> | undefined)?.sponsorContributionGoesFullyToWinners === true));
  if (prizeSponsors.length) {
    const tournamentRef = db.collection("tournaments").doc(tournamentId);
    const tournamentSnapshot = transaction ? await transaction.get(tournamentRef) : await tournamentRef.get();
    if (!tournamentSnapshot.exists) throw new Error("TOURNAMENT_FUNDING_RECONCILIATION_REQUIRED");
    const observedAt = new Date();
    const votingEvidence = await readTournamentSponsorVotingEvidence(db, transaction, tournamentId, tournamentSnapshot.data() ?? {});
    // Never silently subtract an already credited liability. Unverifiable or
    // late contributions hold settlement for the existing reconciliation flow.
    if (prizeSponsors.some(row => row.providerCompletionEvidence !== "stripe_checkout_session_completed_event_created_paid_card_snapshot_and_captured_automatic_charge"
      || !isTournamentSponsorPaymentTimely({
        tournament: votingEvidence,
        reservationCreatedAt: row.reservationCreatedAt,
        reservationExpiresAt: row.reservationExpiresAt,
        providerCompletionUpperBoundAt: row.providerCompletionUpperBoundAt,
        providerTimestampPrecisionMs: Number(row.providerTimestampPrecisionMs),
        observedAt,
      }))) throw new Error("TOURNAMENT_SPONSOR_CUTOFF_RECONCILIATION_REQUIRED");
  }
  const gross = (rows: Array<Record<string, unknown>>) => rows.reduce<number>((sum, row) => {
    const amount = Number(row.amountCents ?? row.amount ?? row.grossAmountCents);
    if (!Number.isSafeInteger(amount) || amount < 0 || String(row.currency ?? "USD").toUpperCase() !== "USD") throw new Error("TOURNAMENT_FUNDING_AMOUNT_INVALID");
    const next = sum + amount;
    if (!Number.isSafeInteger(next)) throw new Error("TOURNAMENT_FUNDING_AMOUNT_INVALID");
    return next;
  }, 0);
  return {
    confirmedEntryRevenueCents: gross(entries), confirmedPaidVoteRevenueCents: gross(paidVotes), confirmedSponsorPrizeCents: gross(prizeSponsors), confirmedCreatorPrizeCents: gross(creatorPrize), confirmedPromotionalPrizeCents: gross(promotional),
    entryPaymentCount: entries.length, paidVotePaymentCount: paidVotes.length, sponsorPaymentCount: prizeSponsors.length, creatorPrizePaymentCount: creatorPrize.length,
    sourceBreakdown: {
      confirmedEntryPaymentIds: entries.map(row => row.id).sort(), confirmedPaidVotePaymentIds: paidVotes.map(row => row.id).sort(), confirmedSponsorPaymentIds: prizeSponsors.map(row => row.id).sort(), confirmedCreatorPrizePaymentIds: creatorPrize.map(row => row.id).sort(), confirmedPromotionalPrizeFundingIds: promotional.map(row => row.id).sort(),
      excludedNonPrizeSponsorPaymentIds: sponsors.filter(row => !prizeSponsors.includes(row)).map(row => row.id).sort()
    }, confirmedOnly: true as const, pendingFailedCancelledExcluded: true as const
  };
}
