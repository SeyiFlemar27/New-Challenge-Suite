import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { fail, ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { cleanMoneyCents, cleanText, isoNow, normalizeRevisionStatus, safeArray } from "@/lib/sponsor-collaboration";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  try {
    const { proposalId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorProposals", proposalId, context.sponsorId);
    if (owned.response) return owned.response;
    const now = isoNow();
    const expectedVersion = Number(body.expectedVersion ?? owned.snap.data()?.version ?? 0);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return validationError({ expectedVersion: "Refresh the proposal before creating a revision." });
    let created: Record<string, unknown> | null = null;
    await context.db.runTransaction(async (transaction) => {
      const proposalRef = context.db.collection("sponsorProposals").doc(proposalId);
      const fresh = await transaction.get(proposalRef);
      const proposal = fresh.data() ?? {};
      if (Number(proposal.version ?? 0) !== expectedVersion) throw new Error("PROPOSAL_VERSION_CONFLICT");
      if (["accepted", "funded", "live", "completed", "cancelled", "archived"].includes(String(proposal.status ?? ""))) throw new Error("PROPOSAL_REVISION_LOCKED");
      const revisionNumber = Number(proposal.revisionNumber ?? 1) + 1;
      const ref = context.db.collection("sponsorProposalRevisions").doc(`${proposalId}_r${revisionNumber}`);
      const revision = { id: ref.id, sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, proposalId, status: normalizeRevisionStatus(body.status), revisionNumber, budgetSnapshotCents: body.budget === undefined ? Number(proposal.proposedBudgetCents ?? 0) : cleanMoneyCents(body.budget), deliverablesSnapshot: body.deliverables === undefined ? proposal.deliverables ?? [] : safeArray(body.deliverables), dateSnapshot: { startDate: cleanText(body.startDate ?? proposal.startDate).slice(0, 40), endDate: cleanText(body.endDate ?? proposal.endDate).slice(0, 40) }, paymentPreference: cleanText(body.paymentPreference ?? proposal.paymentPreference).slice(0, 120), sponsorMessage: cleanText(body.sponsorMessage).slice(0, 1600), createdAt: now, createdBy: context.user.uid, immutable: true };
      const activityRef = context.db.collection("sponsorProposalActivity").doc(`${proposalId}_revision_${revisionNumber}`);
      transaction.create(ref, revision);
      transaction.update(proposalRef, { activeRevisionId: ref.id, revisionNumber, sponsorAcceptedRevisionId: null, creatorAcceptedRevisionId: null, status: "negotiating", updatedAt: now, updatedBy: context.user.uid, version: expectedVersion + 1 });
      transaction.create(activityRef, { sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, proposalId, action: "proposal_revision_created", status: revision.status, revisionId: ref.id, createdAt: now, createdBy: context.user.uid });
      created = revision;
    });
    if (!created) return serverError("Proposal revision could not be saved.");
    return ok({ revision: created }, "Proposal revision saved. Negotiation history was preserved.");
  } catch (error) {
    if (error instanceof Error && error.message === "PROPOSAL_VERSION_CONFLICT") return fail("This proposal changed. Refresh it before saving another revision.", 409, undefined, "PROPOSAL_VERSION_CONFLICT");
    if (error instanceof Error && error.message === "PROPOSAL_REVISION_LOCKED") return fail("This proposal can no longer be revised.", 409, undefined, "PROPOSAL_REVISION_LOCKED");
    console.error("[sponsor-proposal-revision:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Proposal revision could not be saved.");
  }
}
