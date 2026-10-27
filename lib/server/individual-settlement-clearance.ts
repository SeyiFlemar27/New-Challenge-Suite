import type { Firestore, Transaction } from "firebase-admin/firestore";
import { isIndividualTournamentPolicy } from "@/lib/individual-tournament-policy";
import { isKycRequiredForAction } from "@/lib/server/kyc-policy";

/** Runs inside the ledger transaction, never from client-provided approval fields. */
export async function assertIndividualSettlementClearance(db: Firestore, transaction: Transaction, id: string, tournament: Record<string, unknown>, userIds: string[]) {
  if (!isIndividualTournamentPolicy(tournament) || tournament.participationMode !== "individual" || !["under_review", "final", "completed", "winners_announced"].includes(String(tournament.status))) throw new Error("INDIVIDUAL_RESULTS_NOT_FINAL");
  if (["financialHold", "settlementRestricted", "fraudReviewRequired", "disputeRestricted", "stripeDisputeRestricted"].some(key => tournament[key] === true)) throw new Error("INDIVIDUAL_SETTLEMENT_HELD");
  const [disputes, exceptions, matches, holds] = await Promise.all([
    transaction.get(db.collection("tournamentDisputes").where("tournamentId", "==", id)),
    transaction.get(db.collection("tournamentExceptions").where("tournamentId", "==", id)),
    transaction.get(db.collection("tournamentMatches").where("tournamentId", "==", id)),
    transaction.get(db.collection("tournamentSettlementHolds").where("tournamentId", "==", id))
  ]);
  if (holds.docs.some(row => !["resolved", "closed", "rejected", "cancelled"].includes(String(row.data().status)))) throw new Error("INDIVIDUAL_SETTLEMENT_REVIEW_REQUIRED");
  if (disputes.docs.some(row => !["resolved", "rejected", "closed"].includes(String(row.data().status))) || exceptions.docs.some(row => !["resolved", "rejected", "closed"].includes(String(row.data().status))) || matches.docs.some(row => ["held", "disputed", "result_verification", "voting_open", "voting_closed", "submission_review", "submissions_open"].includes(String(row.data().status)) || ["confirmed", "forfeit", "bye"].includes(String(row.data().status)) && row.data().resultStatus !== "confirmed")) throw new Error("INDIVIDUAL_SETTLEMENT_REVIEW_REQUIRED");
  if (userIds.length !== 3 || new Set(userIds).size !== 3) throw new Error("INDIVIDUAL_THREE_WINNERS_REQUIRED");
  for (const userId of userIds) {
    const [account, profile, kyc, wallet] = await Promise.all([
      transaction.get(db.collection("users").doc(userId)), transaction.get(db.collection("profiles").doc(userId)),
      transaction.get(db.collection("kycMetadata").doc(userId)), transaction.get(db.collection("cashWallets").doc(userId))
    ]);
    const data = { ...profile.data(), ...account.data(), ...kyc.data() };
    if (account.data()?.disabled === true || account.data()?.suspended === true || account.data()?.blocked === true || ["blocked", "deletion_requested", "anonymized"].includes(String(account.data()?.accountStatus))) throw new Error("INDIVIDUAL_WINNER_ACCOUNT_HELD");
    if (!account.exists || data.financialRestriction || wallet.data()?.financialRestriction || ["suspended", "disabled", "deleted", "deactivated"].includes(String(data.accountStatus)) || ["withdrawalRestricted", "payoutHold", "financialHold", "settlementRestricted", "disputeRestricted", "stripeDisputeRestricted"].some(key => data[key] === true || wallet.data()?.[key] === true) || wallet.data()?.status === "locked") throw new Error("INDIVIDUAL_WINNER_ACCOUNT_HELD");
    // Preserve the canonical product KYC policy; do not silently add a new requirement.
    if (isKycRequiredForAction("internalPrizeCredit") && !["verified", "approved"].includes(String(data.kycStatus ?? data.sumsubKycStatus))) throw new Error("INDIVIDUAL_WINNER_KYC_REQUIRED");
  }
}
