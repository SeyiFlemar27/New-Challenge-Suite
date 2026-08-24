import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import { requireSponsorContext, requireSponsorPermission } from "@/lib/server/sponsor";
import { fail, ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { getRequestIdempotencyKey } from "@/lib/server/idempotency";
import { checkoutLineItem, checkoutMetadataForPurpose, createPendingSponsorWalletFunding } from "@/lib/server/monetization-payments";
import { resolveSponsorWorkspaceState } from "@/lib/sponsor-access";

const schema = z.object({ amountCents: z.coerce.number().int().min(500).max(100000000), idempotencyKey: z.string().trim().min(8).max(120) });

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const permissionError = requireSponsorPermission(context, "wallet.fund");
  if (permissionError) return permissionError;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const result = schema.safeParse(parsed.body ?? {});
  if (!result.success) return validationError(Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0] ?? "funding"), issue.message])));
  const workspace = resolveSponsorWorkspaceState(context.sponsorProfile);
  if (!workspace.canFund) return fail(workspace.lockedReason || "Sponsor approval and an active plan are required before adding campaign funds.", 403, undefined, "SPONSOR_FUNDING_LOCKED");
  const idempotencyKey = getRequestIdempotencyKey(request, result.data);
  if (!idempotencyKey) return validationError({ idempotencyKey: "A funding request reference is required." });
  const stripe = getStripe();
  if (!stripe) return fail("Sponsor wallet funding is temporarily unavailable. Try again later or contact support.", 503, undefined, "PAYMENT_CONFIGURATION_ERROR");

  try {
    const funding = await createPendingSponsorWalletFunding(context.db, { sponsorId: context.sponsorId, organizationId: context.organizationId, userId: context.user.uid, amountCents: result.data.amountCents, idempotencyKey });
    if (funding.status === "confirmed") return ok({ funding, alreadyConfirmed: true }, "These funds are already available in the sponsor wallet.");
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [checkoutLineItem({ amountCents: result.data.amountCents, currency: "USD", name: "Challenge Suite sponsor wallet funding" })],
      success_url: `${origin}/sponsor/wallet?funding=processing`,
      cancel_url: `${origin}/sponsor/wallet?funding=cancelled`,
      metadata: checkoutMetadataForPurpose("sponsor_wallet_funding", funding)
    }, { idempotencyKey: `sponsor_wallet_${idempotencyKey}` });
    await context.db.collection("sponsorWalletFunding").doc(String(funding.id)).set({ stripeCheckoutSessionId: session.id, checkoutCreatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
    return ok({ url: session.url, fundingId: funding.id, status: "pending", providerConfirmationRequired: true, availableBalanceCredited: false }, "Secure funding checkout created. Funds become available only after provider confirmation.");
  } catch (error) {
    console.error("[sponsor-wallet-funding:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor wallet funding checkout could not be created.");
  }
}
