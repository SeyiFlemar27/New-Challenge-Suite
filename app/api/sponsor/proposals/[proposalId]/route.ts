import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { resolveSponsorWorkspaceState } from "@/lib/sponsor-access";
import { fail } from "@/lib/server/responses";
import { cleanMoneyCents, cleanText, isoNow, normalizeProposalDeliverables, normalizeProposalStatus, safeArray } from "@/lib/sponsor-collaboration";

export const dynamic = "force-dynamic";

function patchPayload(body: Record<string, unknown>, sponsorId: string, now: string, existing: Record<string, unknown>) {
  const status = normalizeProposalStatus(body.status ?? existing.status);
  return {
    title: cleanText(body.title ?? existing.title, "Untitled proposal").slice(0, 180),
    linkedCampaignId: cleanText(body.campaignId ?? body.linkedCampaignId ?? existing.linkedCampaignId).slice(0, 120) || null,
    linkedCreatorId: cleanText(body.creatorId ?? body.linkedCreatorId ?? existing.linkedCreatorId).slice(0, 120) || null,
    linkedChallengeId: cleanText(body.challengeId ?? body.linkedChallengeId ?? existing.linkedChallengeId).slice(0, 120) || null,
    objective: cleanText(body.objective ?? existing.objective).slice(0, 280),
    proposedBudgetCents: cleanMoneyCents(body.budget ?? body.proposedBudget ?? existing.proposedBudgetCents),
    currency: cleanText(body.currency ?? existing.currency, "USD").slice(0, 12),
    startDate: cleanText(body.startDate ?? existing.startDate).slice(0, 40),
    endDate: cleanText(body.endDate ?? existing.endDate).slice(0, 40),
    deliverables: body.deliverables === undefined ? normalizeProposalDeliverables(existing.deliverables) : normalizeProposalDeliverables(body.deliverables),
    paymentPreference: cleanText(body.paymentPreference ?? existing.paymentPreference, "milestone_payment").slice(0, 120),
    brandRequirements: cleanText(body.brandRequirements ?? existing.brandRequirements).slice(0, 1200),
    notesToCreator: cleanText(body.notesToCreator ?? existing.notesToCreator).slice(0, 1600),
    attachments: body.attachments === undefined ? Array.isArray(existing.attachments) ? existing.attachments : [] : safeArray(body.attachments),
    status,
    pendingActionLabel: status === "accepted" ? "Accepted; contract and funding eligibility review is next." : status === "changes_requested" ? "Changes requested" : "Review proposal status",
    contractStatus: "not_created",
    fundingStatus: "not_active",
    paymentReleaseStatus: "not_active",
    acceptedFoundationOnly: status === "accepted",
    updatedAt: now,
    updatedBy: sponsorId,
    version: Number(existing.version ?? 0) + 1
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const { proposalId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorProposals", proposalId, context.user.uid);
    if (owned.response) return owned.response;
    const [revisionsSnap, activitySnap, notesSnap] = await Promise.all([
      context.db.collection("sponsorProposalRevisions").where("proposalId", "==", proposalId).where("sponsorId", "==", context.user.uid).limit(50).get(),
      context.db.collection("sponsorProposalActivity").where("proposalId", "==", proposalId).where("sponsorId", "==", context.user.uid).limit(50).get(),
      context.db.collection("sponsorInternalNotes").where("relatedEntityId", "==", proposalId).where("sponsorId", "==", context.user.uid).limit(25).get()
    ]);
    const byDate = (a: any, b: any) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
    return ok({ proposal: { id: owned.snap.id, ...owned.snap.data() }, revisions: revisionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort(byDate), activity: activitySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort(byDate), internalNotes: notesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort(byDate) }, "Proposal loaded.");
  } catch (error) {
    console.error("[sponsor-proposal:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Proposal could not be loaded.");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  if (body.title !== undefined && cleanText(body.title).length < 3) return validationError({ title: "Proposal title is required." });
  try {
    const { proposalId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorProposals", proposalId, context.user.uid);
    if (owned.response) return owned.response;
    const now = isoNow();
    const existing = owned.snap.data() ?? {};
    const requestedStatus = normalizeProposalStatus(body.status ?? existing.status);
    const workspace = resolveSponsorWorkspaceState(context.sponsorProfile);
    if (!["draft", "archived", "cancelled"].includes(requestedStatus) && !workspace.canSendProposal) return fail(workspace.lockedReason || "Sponsor approval and an active plan are required for this proposal action.", 403, { sponsorStatus: workspace.status }, "SPONSOR_PROPOSAL_LOCKED");
    const patch = patchPayload(body, context.user.uid, now, existing);
    await Promise.all([
      context.db.collection("sponsorProposals").doc(proposalId).set(patch, { merge: true }),
      context.db.collection("sponsorProposalActivity").add({ sponsorId: context.user.uid, proposalId, action: `proposal_${patch.status}`, status: patch.status, createdAt: now, createdBy: context.user.uid })
    ]);
    return ok({ proposal: { id: proposalId, ...existing, ...patch } }, "Proposal updated. Contract, funding, and payment release remain inactive.");
  } catch (error) {
    console.error("[sponsor-proposal:patch]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Proposal could not be updated.");
  }
}
