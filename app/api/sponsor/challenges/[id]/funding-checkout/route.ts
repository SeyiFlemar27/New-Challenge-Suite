import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import { fail, ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { hasActiveSponsorSubscription, normalizeSponsorReviewStatus, normalizeSponsorSubscriptionStatus, sponsorIsApproved } from "@/lib/sponsor-access";
import { attachCheckoutSession, checkoutLineItem, checkoutMetadataForPurpose, createPendingSponsorContribution } from "@/lib/server/monetization-payments";

const schema = z.object({
  amountCents: z.coerce.number().int().min(500).max(100000000),
  logoUrl: z.string().trim().max(500).optional().or(z.literal("")),
  bannerUrl: z.string().trim().max(500).optional().or(z.literal("")),
  ctaText: z.string().trim().max(80).optional().or(z.literal("")),
  ctaUrl: z.string().trim().max(500).optional().or(z.literal("")),
  placementNotes: z.string().trim().max(1200).optional().or(z.literal("")),
  placements: z.array(z.string().trim().min(1).max(80)).max(8).default([])
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = schema.safeParse(parsed.body ?? {});
  if (!body.success) return validationError(Object.fromEntries(body.error.issues.map((issue) => [String(issue.path[0] ?? "funding"), issue.message])));

  const reviewStatus = normalizeSponsorReviewStatus(context.sponsorProfile.sponsorVerificationStatus ?? context.sponsorProfile.businessVerificationStatus);
  const subscriptionStatus = normalizeSponsorSubscriptionStatus(context.sponsorProfile.subscriptionStatus ?? context.sponsorProfile.planStatus ?? context.sponsorProfile.stripeStatus);
  if (!sponsorIsApproved(reviewStatus)) return fail("Sponsor approval is required before funding checkout can start.", 403, { reviewStatus }, "SPONSOR_APPROVAL_REQUIRED");
  if (!hasActiveSponsorSubscription(subscriptionStatus)) return fail("An active sponsor plan is required before funding checkout can start.", 403, { subscriptionStatus }, "SPONSOR_PLAN_REQUIRED");

  const { id: challengeId } = await params;
  const challengeSnap = await context.db.collection("challenges").doc(challengeId).get();
  if (!challengeSnap.exists) return fail("Challenge opportunity was not found.", 404, undefined, "NOT_FOUND");
  const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
  let contribution;
  try {
    contribution = await createPendingSponsorContribution(context.db, {
      sponsorId: context.user.uid,
      challengeId,
      challenge,
      sponsorProfile: context.sponsorProfile,
      amountCents: body.data.amountCents,
      logoUrl: body.data.logoUrl,
      bannerUrl: body.data.bannerUrl,
      ctaText: body.data.ctaText,
      ctaUrl: body.data.ctaUrl,
      placementNotes: body.data.placementNotes,
      placements: body.data.placements
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Sponsor funding checkout could not be prepared.", 409, undefined, "SPONSOR_FUNDING_CHECKOUT_REJECTED");
  }
  const stripe = getStripe();
  if (!stripe) return fail("Stripe sponsor funding checkout is not configured.", 503, { contribution, webhookConfirmationRequired: true, contributionConfirmed: false }, "PAYMENT_CONFIGURATION_ERROR");
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [checkoutLineItem({ amountCents: contribution.amountCents, currency: "USD", name: `Sponsor funding - ${String(challenge.title ?? "Challenge")}` })],
    success_url: `${origin}/sponsor/funding/${encodeURIComponent(challengeId)}/success?sponsorContributionId=${encodeURIComponent(contribution.id)}`,
    cancel_url: `${origin}/checkout/cancel?paymentPurpose=sponsor_funding&challengeId=${encodeURIComponent(challengeId)}`,
    metadata: checkoutMetadataForPurpose("sponsor_funding", contribution)
  });
  await attachCheckoutSession(context.db, "sponsorContributions", contribution.id, session);
  return ok({ url: session.url, sponsorContributionId: contribution.id, status: "pending", webhookConfirmationRequired: true, contributionConfirmed: false, brandingStatus: "pending_review", checkoutSuccessConfirmsContribution: false }, "Sponsor funding checkout session created. Contribution is confirmed only after Stripe webhook confirmation.");
}
