import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { fail, ok, serverError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

/** Historical activity remains readable; Sponsor reminders and writes are retired. */
export async function GET(request: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const { context, response } = await requireSponsorContext(request, { allowHistorical: true });
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const { proposalId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorProposals", proposalId, context.sponsorId);
    if (owned.response) return owned.response;
    const snap = await context.db.collection("sponsorProposalActivity").where("proposalId", "==", proposalId).where("sponsorId", "==", context.sponsorId).limit(100).get();
    const activity = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => String((b as Record<string, unknown>).createdAt ?? "").localeCompare(String((a as Record<string, unknown>).createdAt ?? "")));
    return ok({ activity }, "Historical proposal activity loaded.");
  } catch (error) {
    console.error("[sponsor-proposal-activity:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Historical proposal activity could not be loaded.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  return fail("Sponsor proposal reminders have been retired.", 410, undefined, "SPONSOR_PROPOSAL_ACTIVITY_WRITE_RETIRED");
}
