import type { Firestore } from "firebase-admin/firestore";
import { tournamentDraftFromInput, defaultPrizeDistribution } from "@/lib/server/tournaments";
import { TOURNAMENT_PRODUCT_POLICY } from "@/lib/tournament-builder-policy";
import { canCreateTournament } from "@/lib/server/tournament-permissions";

const denied = (code: string) => Object.assign(new Error(code), { code });
const references: Array<[string, string]> = [
  ...["tournamentParticipants", "tournamentTeams", "tournamentMatches", "tournamentPlacements", "tournamentJobs", "tournamentEntryPayments", "tournamentEntryReservations", "tournamentTeamRegistrationAttempts", "tournamentSponsorProposals", "tournamentInvitations", "tournamentTeamInvitations", "paidVotePurchases", "creatorPrizeFundingPayments", "sponsorContributions", "challengeEntryPayments"].map(collection => [collection, "tournamentId"] as [string, string]),
  ["creatorPrizeFundingPayments", "challengeId"], ["sponsorContributions", "challengeId"], ["enterprisePromotionalPrizeFunding", "challengeId"], ["challengeSettlements", "challengeId"],
  ["tournamentTeamMemberships", "tournamentId"], ["tournamentFinancialLedger", "tournamentId"], ["challengeFinancialLedger", "challengeId"], ["cashLedger", "tournamentId"], ["refundCases", "tournamentId"], ["refundCases", "challengeId"], ["tournamentSettlementHolds", "tournamentId"]
];

/** Explicit owner adoption only; historical commitments and competition activity are never migrated. */
export async function adoptTournamentDraftPolicy(db: Firestore, input: { tournamentId: string; actor: { uid: string; role?: string; isAdmin?: boolean }; confirmed: boolean; expectedUpdatedAt: string | null }) {
  if (!input.confirmed) throw denied("DRAFT_POLICY_CONFIRMATION_REQUIRED");
  return db.runTransaction(async transaction => {
    const ref = db.collection("tournaments").doc(input.tournamentId);
    const snapshot = await transaction.get(ref);
    const current = snapshot.data() ?? {};
    if (!snapshot.exists) throw denied("TOURNAMENT_NOT_FOUND");
    if (current.hostId !== input.actor.uid) throw denied("DRAFT_POLICY_OWNER_REQUIRED");
    if (current.productPolicyVersion === TOURNAMENT_PRODUCT_POLICY) return { id: ref.id, adopted: false, duplicate: true };
    if (current.status !== "draft" || current.publishedAt || current.timingLockedAt || current.bracketGeneratedAt || current.settlementId || current.creatorPrizeGuaranteeLockedAt
      || Number(current.participantCount ?? 0) !== 0 || current.financialHold || current.settlementRestricted
      || [current.confirmedCreatorPrizeFundingCents, current.confirmedPrizePoolMinor, (current.prizePool ?? {}).confirmedPrizePoolMinor, (current.sponsorship ?? {}).confirmedSponsorFundingMinor].some(value => Number(value ?? 0) !== 0)) throw denied("LEGACY_DRAFT_ACTIVITY_REVIEW_REQUIRED");
    if ((current.updatedAt ?? null) !== input.expectedUpdatedAt) throw denied("TOURNAMENT_DRAFT_STALE");
    const [account, profile, ...financialDocuments] = await transaction.getAll(db.collection("users").doc(input.actor.uid), db.collection("profiles").doc(input.actor.uid), ...["prizePools", "enterprisePrizeFundingLimits", "tournamentEntryReservationLocks"].map(collection => db.collection(collection).doc(ref.id)));
    if (financialDocuments.some(document => document.exists)) throw denied("LEGACY_DRAFT_ACTIVITY_REVIEW_REQUIRED");
    if (!account.exists || account.data()?.disabled || account.data()?.suspended || ["suspended", "disabled", "deleted", "deletion_requested", "deactivated"].includes(String(account.data()?.accountStatus))) throw denied("TOURNAMENT_HOSTING_LOCKED");
    if (!canCreateTournament({ ...profile.data(), ...account.data(), ...input.actor }).allowed) throw denied("TOURNAMENT_HOSTING_LOCKED");
    const activity = await Promise.all(references.map(([collection, field]) => transaction.get(db.collection(collection).where(field, "==", ref.id).limit(1))));
    if (activity.some(result => !result.empty)) throw denied("LEGACY_DRAFT_ACTIVITY_REVIEW_REQUIRED");
    const now = new Date().toISOString();
    const normalized = tournamentDraftFromInput({ ...current,
      coverImageUrl: current.coverImageUrl ?? current.coverMedia?.url, coverImagePath: current.coverImagePath ?? current.coverMedia?.path,
      trailerUrl: current.trailerUrl ?? current.trailerMedia?.url, trailerPath: current.trailerPath ?? current.trailerMedia?.path,
      minimumTeamSize: current.teamConfig?.minimumSize, maximumTeamSize: current.teamConfig?.maximumSize, teamJoiningMode: current.teamConfig?.joiningMode,
      sponsorReady: current.sponsorship?.sponsorReady === true, prizeDistribution: defaultPrizeDistribution()
    }, String(current.hostId), String(current.createdAt ?? now));
    const identity = Object.fromEntries(["createdBy", "createdAt", "ownershipType", "officialChallenge", "organizationOwnerId", "enterpriseOrganizationId", "enterpriseFinanceContextId", "enterpriseChallengeLeadId", "enterpriseAssignments"].filter(field => current[field] !== undefined).map(field => [field, current[field]]));
    const revisionId = `${ref.id}_${TOURNAMENT_PRODUCT_POLICY}`;
    transaction.create(db.collection("tournamentDraftPolicyRevisions").doc(revisionId), { id: revisionId, tournamentId: ref.id, actorId: input.actor.uid, before: current, fromPolicy: current.productPolicyVersion ?? null, toPolicy: TOURNAMENT_PRODUCT_POLICY, reason: "Owner explicitly accepted current rules for an unused draft", confirmed: true, createdAt: now });
    transaction.set(ref, { ...normalized, ...identity, id: ref.id, updatedAt: now, bracketExecutionEnabled: true, paymentActivationEnabled: false, payoutExecutionEnabled: false, draftPolicyRevisionId: revisionId }, { merge: true });
    transaction.create(db.collection("tournamentAuditEvents").doc(revisionId), { id: revisionId, tournamentId: ref.id, actorId: input.actor.uid, action: "unused_draft_policy_adopted", policyRevisionId: revisionId, createdAt: now });
    return { id: ref.id, adopted: true, duplicate: false };
  });
}
