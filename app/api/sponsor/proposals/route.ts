import { fail, ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { resolveSponsorWorkspaceState } from "@/lib/sponsor-access";
import { cleanMoneyCents, cleanText, isoNow, normalizeProposalStatus, safeArray } from "@/lib/sponsor-collaboration";

export const dynamic = "force-dynamic";

function proposalPayload(body: Record<string, unknown>, sponsorId: string, now: string, existing: Record<string, unknown> = {}) {
  const status = normalizeProposalStatus(body.status ?? existing.status ?? "draft");
  const deliverables = safeArray(body.deliverables).length ? safeArray(body.deliverables) : Array.isArray(existing.deliverables) ? existing.deliverables : [];
  return {
    sponsorId,
    ownerUid: sponsorId,
    title: cleanText(body.title ?? body.proposalTitle ?? existing.title, "Untitled proposal").slice(0, 180),
    linkedCampaignId: cleanText(body.campaignId ?? body.linkedCampaignId ?? existing.linkedCampaignId).slice(0, 120) || null,
    linkedCreatorId: cleanText(body.creatorId ?? body.linkedCreatorId ?? existing.linkedCreatorId).slice(0, 120) || null,
    linkedChallengeId: cleanText(body.challengeId ?? body.linkedChallengeId ?? existing.linkedChallengeId).slice(0, 120) || null,
    objective: cleanText(body.objective ?? existing.objective).slice(0, 280),
    proposedBudgetCents: cleanMoneyCents(body.budget ?? body.proposedBudget ?? existing.proposedBudgetCents),
    currency: cleanText(body.currency ?? existing.currency, "USD").slice(0, 12),
    startDate: cleanText(body.startDate ?? existing.startDate).slice(0, 40),
    endDate: cleanText(body.endDate ?? existing.endDate).slice(0, 40),
    deliverables,
    deliverablesCount: deliverables.length,
    paymentPreference: cleanText(body.paymentPreference ?? existing.paymentPreference, "milestone_payment").slice(0, 120),
    brandRequirements: cleanText(body.brandRequirements ?? existing.brandRequirements).slice(0, 1200),
    notesToCreator: cleanText(body.notesToCreator ?? existing.notesToCreator).slice(0, 1600),
    attachments: safeArray(body.attachments ?? existing.attachments),
    status,
    unreadMessageCount: Number(existing.unreadMessageCount ?? 0),
    pendingActionLabel: status === "draft" ? "Draft needs review" : status === "accepted" ? "Contract and funding eligibility review" : status === "changes_requested" ? "Changes requested" : "Review proposal status",
    contractStatus: "not_created",
    fundingStatus: "not_active",
    paymentReleaseStatus: "not_active",
    acceptedFoundationOnly: status === "accepted",
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
    const snap = await context.db.collection("sponsorProposals").where("sponsorId", "==", context.user.uid).limit(100).get();
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
  const workspace = resolveSponsorWorkspaceState(context.sponsorProfile);
  if (requestedStatus !== "draft" && !workspace.canSendProposal) return fail(workspace.lockedReason || "Sponsor approval and an active plan are required before sending proposals.", 403, { sponsorStatus: workspace.status }, "SPONSOR_PROPOSAL_LOCKED");
  try {
    const now = isoNow();
    const ref = context.db.collection("sponsorProposals").doc();
    const proposal = { id: ref.id, ...proposalPayload(body, context.user.uid, now), createdAt: now, createdBy: context.user.uid };
    await Promise.all([
      ref.set(proposal),
      context.db.collection("sponsorProposalActivity").add({ sponsorId: context.user.uid, proposalId: ref.id, action: proposal.status === "sent" ? "proposal_sent" : "proposal_draft_saved", status: proposal.status, createdAt: now, createdBy: context.user.uid }),
      context.db.collection("sponsorProposalRevisions").add({ sponsorId: context.user.uid, proposalId: ref.id, status: "proposed", revisionNumber: 1, budgetSnapshotCents: proposal.proposedBudgetCents, deliverablesSnapshot: proposal.deliverables, dateSnapshot: { startDate: proposal.startDate, endDate: proposal.endDate }, sponsorMessage: proposal.notesToCreator, creatorResponseFoundation: "", internalSponsorNote: "", createdAt: now, createdBy: context.user.uid })
    ]);
    return ok({ proposal }, proposal.status === "sent" ? "Proposal sent. No contract, funding, or payment release was activated." : "Proposal draft saved.");
  } catch (error) {
    console.error("[sponsor-proposals:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Proposal could not be saved.");
  }
}
