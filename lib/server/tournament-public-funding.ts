import type { Firestore } from "firebase-admin/firestore";
import { calculatePaidRevenueSplit } from "@/lib/server/payout-structure";
import { getTournamentFundingSources } from "@/lib/server/tournament-funding-sources";

/** Public totals come from the same eligible sources as settlement, never cached increments. */
export async function getPublicTournamentFunding(db: Firestore, tournamentId: string) {
  try {
    const source = await getTournamentFundingSources(db, tournamentId);
    const confirmedPrizePoolMinor = calculatePaidRevenueSplit(source.confirmedEntryRevenueCents).winnerShareCents
      + calculatePaidRevenueSplit(source.confirmedPaidVoteRevenueCents, "paid_vote").winnerShareCents
      + source.confirmedCreatorPrizeCents + source.confirmedSponsorPrizeCents + source.confirmedPromotionalPrizeCents;
    return { prizePool: { confirmedPrizePoolMinor, status: "confirmed_sources", paid: false }, eligibleSponsorIds: source.sourceBreakdown.confirmedSponsorPaymentIds };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (!/TOURNAMENT_.*(RECONCILIATION|FUNDING|REFUND)/.test(code)) throw error;
    return { prizePool: { confirmedPrizePoolMinor: null, status: "under_review", paid: false }, eligibleSponsorIds: [] as string[] };
  }
}
