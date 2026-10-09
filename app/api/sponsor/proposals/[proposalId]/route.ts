import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { fail, ok, serverError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const { context, response } = await requireSponsorContext(request, { allowHistorical: true });
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const { proposalId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorProposals", proposalId, context.sponsorId);
    if (owned.response) return owned.response;
    const [revisionsSnap, activitySnap, notesSnap] = await Promise.all([
      context.db.collection("sponsorProposalRevisions").where("proposalId", "==", proposalId).where("sponsorId", "==", context.sponsorId).limit(50).get(),
      context.db.collection("sponsorProposalActivity").where("proposalId", "==", proposalId).where("sponsorId", "==", context.sponsorId).limit(50).get(),
      context.db.collection("sponsorInternalNotes").where("relatedEntityId", "==", proposalId).where("sponsorId", "==", context.sponsorId).limit(25).get()
    ]);
    const byDate = (a: Record<string, unknown>, b: Record<string, unknown>) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
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
  return fail("Historical sponsor proposals are read-only. Start a new campaign brief for new sponsorship work.", 410, undefined, "SPONSOR_PROPOSAL_READ_ONLY");
}
