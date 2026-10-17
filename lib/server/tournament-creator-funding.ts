import type { Firestore, Transaction } from "firebase-admin/firestore";
import { CREATOR_PRIZE_PAYMENT_PURPOSE } from "@/lib/server/prize-funding";

/** Canonical payment records only; Sponsor money and pending balances never qualify. */
export async function getTournamentCreatorFunding(db: Firestore, tournamentId: string, tournament: Record<string, unknown>, transaction?: Transaction) {
  const query = db.collection("creatorPrizeFundingPayments").where("tournamentId", "==", tournamentId);
  const snapshot = transaction ? await transaction.get(query) : await query.get();
  const organizationId = String(tournament.organizationOwnerId ?? tournament.enterpriseOrganizationId ?? "");
  const organizationOwned = tournament.officialChallenge === true || tournament.ownershipType === "challenge_suite_official";
  const ownedRecords = snapshot.docs.filter(document => {
    const record = document.data();
    const ownerMatches = organizationOwned
      ? Boolean(organizationId) && record.organizationOwnerId === organizationId
      : record.userId === tournament.hostId && !record.organizationOwnerId;
    return ownerMatches && record.fundingSubjectType === "tournament" && record.challengeId === tournamentId
      && record.paymentPurpose === CREATOR_PRIZE_PAYMENT_PURPOSE;
  });
  const records = ownedRecords.filter(document => {
    const record = document.data();
    return record.webhookConfirmed === true
      && record.status === "confirmed" && !record.settlementRestricted && !record.financialRestriction
      && !["pending", "processing", "required", "succeeded", "review_required"].includes(String(record.refundStatus))
      && Number.isSafeInteger(record.amountCents) && record.amountCents > 0 && String(record.currency).toUpperCase() === "USD";
  });
  return { confirmedCreatorCents: records.reduce((sum, record) => sum + Number(record.data().amountCents), 0), recordCount: records.length,
    pendingCount: ownedRecords.filter(document => document.data().status === "pending").length,
    reviewCount: ownedRecords.filter(document => document.data().status === "review_required" || document.data().financialRestriction || document.data().settlementRestricted).length };
}
