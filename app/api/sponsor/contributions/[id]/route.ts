import { fail, ok, serverError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const { id } = await params;
  const snap = await context.db.collection("sponsorContributions").doc(id).get();
  if (!snap.exists) return fail("Sponsor contribution not found.", 404, undefined, "NOT_FOUND");
  const contribution = { id: snap.id, ...snap.data() } as Record<string, unknown>;
  if (contribution.sponsorId !== context.user.uid) return fail("Sponsor contribution not found.", 404, undefined, "NOT_FOUND");
  return ok({
    contribution,
    webhookConfirmationRequired: true,
    checkoutSuccessConfirmsContribution: false,
    brandingRequiresApproval: true,
    payoutProviderCalled: false
  }, "Sponsor contribution status loaded.");
}

