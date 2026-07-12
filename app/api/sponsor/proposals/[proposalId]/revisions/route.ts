import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { ok, readJson, serverError } from "@/lib/server/responses";
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
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorProposals", proposalId, context.user.uid);
    if (owned.response) return owned.response;
    const now = isoNow();
    const countSnap = await context.db.collection("sponsorProposalRevisions").where("proposalId", "==", proposalId).where("sponsorId", "==", context.user.uid).get();
    const revision = { sponsorId: context.user.uid, proposalId, status: normalizeRevisionStatus(body.status), revisionNumber: countSnap.size + 1, budgetSnapshotCents: cleanMoneyCents(body.budget), deliverablesSnapshot: safeArray(body.deliverables), dateSnapshot: { startDate: cleanText(body.startDate).slice(0, 40), endDate: cleanText(body.endDate).slice(0, 40) }, paymentPreference: cleanText(body.paymentPreference).slice(0, 120), sponsorMessage: cleanText(body.sponsorMessage).slice(0, 1600), creatorResponseFoundation: cleanText(body.creatorResponseFoundation).slice(0, 1600), internalSponsorNote: cleanText(body.internalSponsorNote).slice(0, 1600), visibility: "sponsor_foundation", createdAt: now, createdBy: context.user.uid };
    const ref = await context.db.collection("sponsorProposalRevisions").add(revision);
    await context.db.collection("sponsorProposalActivity").add({ sponsorId: context.user.uid, proposalId, action: "proposal_revision_created", status: revision.status, createdAt: now, createdBy: context.user.uid });
    return ok({ revision: { id: ref.id, ...revision } }, "Proposal revision saved. Negotiation history was preserved.");
  } catch (error) {
    console.error("[sponsor-proposal-revision:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Proposal revision could not be saved.");
  }
}
