import { fail, ok, readJson, serverError } from "@/lib/server/responses";
import { requireSponsorContext, requireSponsorPermission } from "@/lib/server/sponsor";
import { cleanText, isoNow } from "@/lib/sponsor-finance";
import { proposalFundingEligible, proposalIsExpired } from "@/lib/sponsor-collaboration";
import { normalizeSponsorCapacityTerms, reserveSponsorCapacity } from "@/lib/server/sponsor-capacity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const permissionError = requireSponsorPermission(context, "wallet.fund");
  if (permissionError) return permissionError;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const proposalId = cleanText(body.proposalId).slice(0, 120);
  if (!proposalId) return fail("Select an accepted proposal to fund.", 400, undefined, "PROPOSAL_REQUIRED");
  const now = isoNow();

  try {
    let result: Record<string, unknown> | null = null;
    await context.db.runTransaction(async (transaction) => {
      const proposalRef = context.db.collection("sponsorProposals").doc(proposalId);
      const walletRef = context.db.collection("sponsorWallets").doc(context.sponsorId);
      const sponsorshipRef = context.db.collection("sponsorships").doc(proposalId);
      const linkedChallengeId = cleanText((await transaction.get(proposalRef)).data()?.linkedChallengeId).slice(0, 120);
      const challengeRef = linkedChallengeId ? context.db.collection("challenges").doc(linkedChallengeId) : null;
      const occupancyRef = linkedChallengeId ? context.db.collection("sponsorChallengeOccupancy").doc(linkedChallengeId) : null;
      const [proposalSnap, walletSnap, sponsorshipSnap, challengeSnap, occupancySnap] = await Promise.all([
        transaction.get(proposalRef), transaction.get(walletRef), transaction.get(sponsorshipRef),
        challengeRef ? transaction.get(challengeRef) : Promise.resolve(null),
        occupancyRef ? transaction.get(occupancyRef) : Promise.resolve(null)
      ]);
      const proposal = proposalSnap.data() ?? {};
      if (!proposalSnap.exists || proposal.sponsorId !== context.sponsorId) throw new Error("NOT_FOUND");
      if (sponsorshipSnap.exists) {
        result = { id: sponsorshipSnap.id, ...sponsorshipSnap.data(), idempotent: true };
        return;
      }
      if (proposalIsExpired(proposal)) throw new Error("PROPOSAL_EXPIRED");
      if (!proposalFundingEligible(proposal)) throw new Error("PROPOSAL_NOT_FUNDING_ELIGIBLE");
      const amountCents = Number(proposal.proposedBudgetCents ?? 0);
      if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("INVALID_AMOUNT");
      const wallet = walletSnap.data() ?? {};
      const availableBalanceCents = Number(wallet.availableBalanceCents ?? 0);
      if (availableBalanceCents < amountCents) throw new Error("INSUFFICIENT_FUNDS");
      const sponsorTerms = normalizeSponsorCapacityTerms(proposal);
      if (challengeSnap) {
        if (!challengeSnap.exists) throw new Error("CHALLENGE_NOT_FOUND");
        const reservation = reserveSponsorCapacity({ sponsorId: context.sponsorId, challenge: challengeSnap.data() ?? {}, occupancy: occupancySnap?.data(), terms: sponsorTerms });
        if (!reservation.ok) throw new Error(reservation.code);
        transaction.set(occupancyRef!, { challengeId: linkedChallengeId, ...reservation.occupancy, updatedAt: now }, { merge: true });
      }

      const fundingRef = context.db.collection("sponsorCampaignFunding").doc(proposalId);
      const walletTransactionRef = context.db.collection("sponsorWalletTransactions").doc(`${proposalId}_reserved`);
      const sponsorship = {
        id: proposalId, sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, proposalId,
        acceptedRevisionId: proposal.activeRevisionId, status: "funded", fundingStatus: "reserved", amountCents,
        currency: proposal.currency ?? "USD", linkedCreatorId: proposal.linkedCreatorId ?? null, linkedChallengeId: proposal.linkedChallengeId ?? null,
        economics: { proposedBudgetCents: amountCents, prizeContributionCents: Number(proposal.prizeContributionCents ?? 0), creatorSponsorshipCents: Number(proposal.creatorSponsorshipCents ?? 0), platformFeeCents: Number(proposal.platformFeeCents ?? 0) },
        visibility: { brandRequirements: proposal.brandRequirements ?? "", usageRights: proposal.usageRights ?? "", requestedPlacements: sponsorTerms.placements },
        sponsorRole: sponsorTerms.role, sponsorCategory: sponsorTerms.category || null, categoryExclusive: sponsorTerms.categoryExclusive,
        deliverables: Array.isArray(proposal.deliverables) ? proposal.deliverables : [], startDate: proposal.startDate ?? null, endDate: proposal.endDate ?? null,
        expiresAt: proposal.expiresAt ?? null, paymentReleaseEnabled: false, externalPayoutExecuted: false,
        createdAt: now, updatedAt: now, createdBy: context.user.uid
      };

      transaction.set(walletRef, { sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, currency: "USD", availableBalanceCents: availableBalanceCents - amountCents, reservedFundsCents: Number(wallet.reservedFundsCents ?? 0) + amountCents, updatedAt: now }, { merge: true });
      transaction.create(fundingRef, { id: fundingRef.id, sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, relatedProposalId: proposalId, relatedSponsorshipId: sponsorshipRef.id, requestedAmountCents: amountCents, reservedAmountCents: amountCents, currency: proposal.currency ?? "USD", status: "reserved", providerConfirmationRequired: true, providerConfirmedWalletFundsOnly: true, clientPaymentStatusTrusted: false, moneyMovement: "internal_reservation", externalPayoutExecuted: false, createdAt: now, updatedAt: now, createdBy: context.user.uid });
      transaction.create(walletTransactionRef, { id: walletTransactionRef.id, sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, type: "sponsorship_reservation", direction: "reserve", amountCents, currency: proposal.currency ?? "USD", status: "reserved", reference: proposalId, relatedSponsorshipId: sponsorshipRef.id, externalPayoutExecuted: false, createdAt: now });
      transaction.create(sponsorshipRef, sponsorship);
      const proposalDeliverables = Array.isArray(proposal.deliverables) ? proposal.deliverables as Array<Record<string, unknown>> : [];
      proposalDeliverables.forEach((item, index) => {
        const sourceId = cleanText(item.id, `deliverable_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
        const deliverableRef = context.db.collection("sponsorDeliverables").doc(`${proposalId}_${sourceId}`);
        const revisionRef = context.db.collection("sponsorDeliverableRevisions").doc(`${deliverableRef.id}_v1`);
        const deliverable = { id: deliverableRef.id, sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, relatedSponsorshipId: sponsorshipRef.id, relatedProposalId: proposalId, relatedCreatorId: proposal.linkedCreatorId ?? null, relatedChallengeId: proposal.linkedChallengeId ?? null, title: cleanText(item.title, "Sponsorship deliverable").slice(0, 180), description: cleanText(item.description).slice(0, 1200), dueDate: cleanText(item.dueDate).slice(0, 40), required: item.required !== false, status: "not_started", uploadedFiles: [], creatorSubmissionNote: "", sponsorFeedback: "", revisionNumber: 1, version: 1, paymentReleaseStatus: "not_active", createdAt: now, updatedAt: now, createdBy: context.user.uid, updatedBy: context.user.uid };
        transaction.create(deliverableRef, deliverable);
        transaction.create(revisionRef, { id: revisionRef.id, sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, deliverableId: deliverableRef.id, relatedSponsorshipId: sponsorshipRef.id, version: 1, revisionNumber: 1, status: "not_started", createdAt: now, createdBy: context.user.uid, immutable: true });
      });
      transaction.update(proposalRef, { status: "converted_to_sponsorship", fundingStatus: "funded", sponsorshipId: sponsorshipRef.id, fundedAt: now, updatedAt: now, version: Number(proposal.version ?? 0) + 1 });
      transaction.create(context.db.collection("sponsorFinancialAuditLogs").doc(`${proposalId}_funded`), { id: `${proposalId}_funded`, sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, relatedProposalId: proposalId, relatedSponsorshipId: sponsorshipRef.id, action: "sponsorship_funds_reserved", amountCents, moneyMovement: "internal_reservation", externalPayoutExecuted: false, createdAt: now, createdBy: context.user.uid });
      result = sponsorship;
    });
    return ok({ sponsorship: result }, "Sponsorship funded. The full amount is reserved internally; no payout or fund release was executed.");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Proposal not found.", 404, undefined, "NOT_FOUND");
    if (error instanceof Error && error.message === "PROPOSAL_NOT_FUNDING_ELIGIBLE") return fail("Both parties must accept the same proposal revision before funding.", 422, undefined, "PROPOSAL_NOT_FUNDING_ELIGIBLE");
    if (error instanceof Error && error.message === "PROPOSAL_EXPIRED") return fail("This proposal has expired. Send and accept an updated proposal before funding.", 422, undefined, "PROPOSAL_EXPIRED");
    if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") return fail("Add enough confirmed USD funds to cover the full sponsorship before funding it.", 409, { partialFundingAllowed: false }, "INSUFFICIENT_SPONSOR_FUNDS");
    if (error instanceof Error && error.message === "INVALID_AMOUNT") return fail("The accepted proposal does not have a valid funding amount.", 422, undefined, "INVALID_SPONSORSHIP_AMOUNT");
    if (error instanceof Error && error.message === "CHALLENGE_NOT_FOUND") return fail("The linked challenge is no longer available.", 409, undefined, "SPONSORSHIP_CHALLENGE_UNAVAILABLE");
    if (error instanceof Error && error.message === "SPONSOR_SLOTS_FULL") return fail("All sponsor slots for this challenge are currently reserved.", 409, undefined, "SPONSOR_SLOTS_FULL");
    if (error instanceof Error && error.message === "PRIMARY_SPONSOR_UNAVAILABLE") return fail("The Primary Sponsor position is no longer available. Update the proposal before funding.", 409, undefined, "PRIMARY_SPONSOR_UNAVAILABLE");
    if (error instanceof Error && error.message === "SPONSOR_CATEGORY_EXCLUSIVE") return fail("This category is no longer available for exclusive sponsorship.", 409, undefined, "SPONSOR_CATEGORY_EXCLUSIVE");
    if (error instanceof Error && error.message === "SPONSOR_PLACEMENT_FULL") return fail("A requested sponsor placement is no longer available. Update the proposal before funding.", 409, undefined, "SPONSOR_PLACEMENT_FULL");
    console.error("[sponsor-funding:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsorship funding could not be reserved.");
  }
}
