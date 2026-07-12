import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { ok, serverError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const { proposalId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorProposals", proposalId, context.user.uid);
    if (owned.response) return owned.response;
    const snap = await context.db.collection("sponsorProposalActivity").where("proposalId", "==", proposalId).where("sponsorId", "==", context.user.uid).limit(100).get();
    const activity = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String((b as any).createdAt ?? "").localeCompare(String((a as any).createdAt ?? "")));
    return ok({ activity }, "Proposal activity loaded.");
  } catch (error) {
    console.error("[sponsor-proposal-activity:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Proposal activity could not be loaded.");
  }
}
