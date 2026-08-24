import { fail, ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { resolveSponsorWorkspaceState } from "@/lib/sponsor-access";
import { cleanMoneyCents, cleanText, isoNow, normalizeProposalDeliverables, normalizeProposalStatus, safeArray } from "@/lib/sponsor-collaboration";

export const dynamic = "force-dynamic";

function proposalPayload(body: Record<string, unknown>, sponsorId: string, now: string, existing: Record<string, unknown> = {}) {
  const status = normalizeProposalStatus(body.status ?? existing.status ?? "draft");
  const deliverables = body.deliverables === undefined ? normalizeProposalDeliverables(existing.deliverables) : normalizeProposalDeliverables(body.deliverables);
  return {
    sponsorId,
    ownerUid: cleanText(existing.ownerUid ?? body.ownerUid ?? sponsorId).slice(0, 128),
    title: cleanText(body.title ?? body.proposalTitle ?? existing.title, "Untitled proposal").slice(0, 180),
    linkedCampaignId: cleanText(body.campaignId ?? body.linkedCampaignId ?? existing.linkedCampaignId).slice(0, 120) || null,
    linkedCreatorId: cleanText(body.creatorId ?? body.linkedCreatorId ?? existing.linkedCreatorId).slice(0, 120) || null,
    linkedChallengeId: cleanText(body.challengeId ?? body.linkedChallengeId ?? existing.linkedChallengeId).slice(0, 120) || null,
    objective: cleanText(body.objective ?? existing.objective).slice(0, 280),
    proposedBudgetCents: body.budget !== undefined || body.proposedBudget !== undefined ? cleanMoneyCents(body.budget ?? body.proposedBudget) : Number(existing.proposedBudgetCents ?? 0),
    currency: cleanText(body.currency ?? existing.currency, "USD").slice(0, 12),
    startDate: cleanText(body.startDate ?? existing.startDate).slice(0, 40),
    endDate: cleanText(body.endDate ?? existing.endDate).slice(0, 40),
    deliverables,
    deliverablesCount: deliverables.length,
    paymentPreference: cleanText(body.paymentPreference ?? existing.paymentPreference, "milestone_payment").slice(0, 120),
    brandRequirements: cleanText(body.brandRequirements ?? existing.brandRequirements).slice(0, 1200),
    notesToCreator: cleanText(body.notesToCreator ?? existing.notesToCreator).slice(0, 1600),
    partnershipType: cleanText(body.partnershipType ?? existing.partnershipType, "challenge_sponsorship").slice(0, 80),
    proposalScope: cleanText(body.proposalScope ?? existing.proposalScope).slice(0, 1600),
    prizeContributionCents: body.prizeContribution !== undefined ? cleanMoneyCents(body.prizeContribution) : Number(existing.prizeContributionCents ?? 0),
    creatorSponsorshipCents: body.creatorSponsorship !== undefined ? cleanMoneyCents(body.creatorSponsorship) : Number(existing.creatorSponsorshipCents ?? 0),
    platformFeeCents: body.platformFee !== undefined ? cleanMoneyCents(body.platformFee) : Number(existing.platformFeeCents ?? 0),
    milestones: Array.isArray(body.milestones) ? body.milestones.slice(0, 20) : Array.isArray(existing.milestones) ? existing.milestones : [],
    usageRights: cleanText(body.usageRights ?? existing.usageRights).slice(0, 1200),
    cancellationTerms: cleanText(body.cancellationTerms ?? existing.cancellationTerms).slice(0, 1200),
    attachments: safeArray(body.attachments ?? existing.attachments),
    status,
    unreadMessageCount: Number(existing.unreadMessageCount ?? 0),
    pendingActionLabel: status === "draft" ? "Draft needs review" : status === "accepted" ? "Contract and funding eligibility review" : status === "changes_requested" ? "Changes requested" : "Review proposal status",
    contractStatus: "not_created",
    fundingStatus: "not_active",
    paymentReleaseStatus: "not_active",
    acceptedFoundationOnly: false,
    sponsorAcceptedRevisionId: existing.sponsorAcceptedRevisionId ?? null,
    creatorAcceptedRevisionId: existing.creatorAcceptedRevisionId ?? null,
    updatedAt: now,
    updatedBy: sponsorId,
    version: Number(existing.version ?? 0) + 1
  };
}

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const snap = await context.db.collection("sponsorProposals").where("sponsorId", "==", context.sponsorId).limit(100).get();
    const proposals = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String((b as any).updatedAt ?? "").localeCompare(String((a as any).updatedAt ?? "")));
    return ok({ proposals }, "Sponsor proposals loaded.");
  } catch (error) {
    console.error("[sponsor-proposals:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor proposals could not be loaded.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  if (cleanText(body.title ?? body.proposalTitle).length < 3) return validationError({ title: "Proposal title is required." });
  const requestedStatus = normalizeProposalStatus(body.status ?? "draft");
  if (requestedStatus !== "draft") {
    if (!cleanText(body.creatorId ?? body.linkedCreatorId) && !cleanText(body.challengeId ?? body.linkedChallengeId)) return validationError({ recipient: "Select an eligible creator or challenge opportunity." });
    if (cleanMoneyCents(body.budget ?? body.proposedBudget) <= 0) return validationError({ budget: "Enter a valid proposed budget." });
    if (!normalizeProposalDeliverables(body.deliverables).length) return validationError({ deliverables: "Add at least one deliverable." });
  }
  const workspace = resolveSponsorWorkspaceState(context.sponsorProfile);
  if (requestedStatus !== "draft" && !workspace.canSendProposal) return fail(workspace.lockedReason || "Sponsor approval and an active plan are required before sending proposals.", 403, { sponsorStatus: workspace.status }, "SPONSOR_PROPOSAL_LOCKED");
  try {
    const now = isoNow();
    const ref = context.db.collection("sponsorProposals").doc();
    const revisionRef = context.db.collection("sponsorProposalRevisions").doc(`${ref.id}_r1`);
    const activityRef = context.db.collection("sponsorProposalActivity").doc(`${ref.id}_created`);
    const proposal = { id: ref.id, ...proposalPayload(body, context.sponsorId, now), ownerUid: context.user.uid, sponsorOrganizationId: context.organizationId, activeRevisionId: revisionRef.id, revisionNumber: 1, sponsorAcceptedRevisionId: null, creatorAcceptedRevisionId: null, createdAt: now, createdBy: context.user.uid };
    const batch = context.db.batch();
    batch.create(ref, proposal);
    batch.create(activityRef, { sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, proposalId: ref.id, action: proposal.status === "sent" ? "proposal_sent" : "proposal_draft_saved", status: proposal.status, createdAt: now, createdBy: context.user.uid });
    batch.create(revisionRef, { id: revisionRef.id, sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, proposalId: ref.id, status: "proposed", revisionNumber: 1, budgetSnapshotCents: proposal.proposedBudgetCents, deliverablesSnapshot: proposal.deliverables, dateSnapshot: { startDate: proposal.startDate, endDate: proposal.endDate }, paymentPreference: proposal.paymentPreference, usageRights: proposal.usageRights, cancellationTerms: proposal.cancellationTerms, sponsorMessage: proposal.notesToCreator, createdAt: now, createdBy: context.user.uid, immutable: true });
    await batch.commit();
    return ok({ proposal }, proposal.status === "sent" ? "Proposal sent. No contract, funding, or payment release was activated." : "Proposal draft saved.");
  } catch (error) {
    console.error("[sponsor-proposals:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Proposal could not be saved.");
  }
}
