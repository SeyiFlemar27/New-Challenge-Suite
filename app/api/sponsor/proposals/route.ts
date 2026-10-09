import { fail, ok, serverError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";

export const dynamic = "force-dynamic";

/** Historical Sponsor proposal records remain readable for compatibility. */
export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request, { allowHistorical: true });
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const snap = await context.db.collection("sponsorProposals").where("sponsorId", "==", context.sponsorId).limit(100).get();
    const proposals = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }))
      .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
    return ok({ proposals }, "Historical sponsor proposals loaded.");
  } catch (error) {
    console.error("[sponsor-proposals:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Historical sponsor proposals could not be loaded.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  return fail("Sponsor proposal creation has been retired. Express interest in an opportunity instead.", 410, undefined, "SPONSOR_PROPOSAL_CREATION_RETIRED");
}
