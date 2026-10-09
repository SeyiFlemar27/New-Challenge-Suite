import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import { fail, ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { getRequestIdempotencyKey } from "@/lib/server/idempotency";
import { requireSponsorPermission } from "@/lib/server/sponsor";
import { hasActiveSponsorSubscription, normalizeSponsorReviewStatus, normalizeSponsorSubscriptionStatus, sponsorIsApproved } from "@/lib/sponsor-access";
import { attachCheckoutSession, checkoutLineItem, checkoutMetadataForPurpose, createPendingSponsorContribution, releasePendingSponsorContribution } from "@/lib/server/monetization-payments";

const schema = z.object({
  agreementId: z.string().trim().min(1).max(180),
  idempotencyKey: z.string().trim().min(8).max(120).optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const denied = requireSponsorPermission(context, "sponsorship.manage");
  if (denied) return denied;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = schema.safeParse(parsed.body ?? {});
  if (!body.success) return validationError(Object.fromEntries(body.error.issues.map((issue) => [String(issue.path[0] ?? "funding"), issue.message])));
  const idempotencyKey = getRequestIdempotencyKey(request, body.data);
  if (!idempotencyKey) return validationError({ idempotencyKey: "A funding request reference is required." });

  const reviewStatus = normalizeSponsorReviewStatus(context.sponsorProfile.sponsorVerificationStatus ?? context.sponsorProfile.businessVerificationStatus);
  const subscriptionStatus = normalizeSponsorSubscriptionStatus(context.sponsorProfile.subscriptionStatus ?? context.sponsorProfile.planStatus ?? context.sponsorProfile.stripeStatus);
  if (!sponsorIsApproved(reviewStatus)) return fail("Sponsor approval is required before funding checkout can start.", 403, { reviewStatus }, "SPONSOR_APPROVAL_REQUIRED");
  if (!hasActiveSponsorSubscription(subscriptionStatus)) return fail("An active sponsor plan is required before funding checkout can start.", 403, { subscriptionStatus }, "SPONSOR_PLAN_REQUIRED");

  const { id: challengeId } = await params;
  const challengeSnap = await context.db.collection("challenges").doc(challengeId).get();
  if (!challengeSnap.exists) return fail("Challenge opportunity was not found.", 404, undefined, "NOT_FOUND");
  const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
  const agreementSnap = await context.db.collection("sponsorChallengeAgreements").doc(body.data.agreementId).get();
  if (!agreementSnap.exists) return fail("An accepted sponsorship agreement is required before funding.", 409, undefined, "SPONSOR_AGREEMENT_REQUIRED");
  const agreement = agreementSnap.data() ?? {};
  const terms = typeof agreement.terms === "object" && agreement.terms !== null ? agreement.terms as Record<string, unknown> : {};
  if (agreement.challengeId !== challengeId || agreement.sponsorOrganizationId !== context.organizationId) return fail("This agreement does not belong to this Sponsor organization and opportunity.", 403, undefined, "SPONSOR_AGREEMENT_SCOPE_MISMATCH");
  if (agreement.status !== "accepted" || agreement.creatorAcceptedVersion !== agreement.termsVersion || agreement.sponsorAcceptedVersion !== agreement.termsVersion) return fail("Both parties must accept the current terms before funding.", 409, undefined, "SPONSOR_AGREEMENT_NOT_ACCEPTED");
  const stripe = getStripe();
  if (!stripe) return fail("Sponsor funding checkout is temporarily unavailable. Try again later or contact support.", 503, { webhookConfirmationRequired: true, contributionConfirmed: false }, "PAYMENT_CONFIGURATION_ERROR");
  let contribution;
  try {
    contribution = await createPendingSponsorContribution(context.db, {
      sponsorId: context.sponsorId,
      challengeId,
      agreementId: body.data.agreementId,
      idempotencyKey,
      challenge,
      sponsorProfile: context.sponsorProfile,
      amountCents: Number(terms.amountCents),
      ctaText: String(terms.ctaText ?? ""),
      ctaUrl: String(terms.ctaUrl ?? ""),
      placements: Array.isArray(terms.placements) ? terms.placements.map(String) : []
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ENTERPRISE_PRIZE_LIMIT_EXCEEDED") return fail("Enterprise challenge funding cannot exceed $10,000.", 422, undefined, "ENTERPRISE_PRIZE_LIMIT_EXCEEDED");
    return fail(error instanceof Error ? error.message : "Sponsor funding checkout could not be prepared.", 409, undefined, "SPONSOR_FUNDING_CHECKOUT_REJECTED");
  }
  if (contribution.status === "confirmed") return ok({ sponsorContributionId: contribution.id, status: "confirmed", contributionConfirmed: true }, "This funding request is already confirmed.");
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let session;
  try {
  session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [checkoutLineItem({ amountCents: Number(contribution.amountCents), currency: "USD", name: `Sponsor funding - ${String(challenge.title ?? "Challenge")}` })],
    success_url: `${origin}/sponsor/funding/${encodeURIComponent(challengeId)}/success?sponsorContributionId=${encodeURIComponent(String(contribution.id))}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout/cancel?paymentPurpose=sponsor_funding&challengeId=${encodeURIComponent(challengeId)}`,
    metadata: checkoutMetadataForPurpose("sponsor_funding", contribution)
  }, { idempotencyKey: `sponsor_challenge_funding_${idempotencyKey}` });
  } catch (error) {
    await releasePendingSponsorContribution(context.db, String(contribution.id)).catch(() => undefined);
    return serverError("Sponsor checkout session could not be created.", error instanceof Error ? error.message : error);
  }
  await attachCheckoutSession(context.db, "sponsorContributions", String(contribution.id), session);
  return ok({ url: session.url, sponsorContributionId: contribution.id, status: "pending", webhookConfirmationRequired: true, contributionConfirmed: false, brandingStatus: "pending_review", checkoutSuccessConfirmsContribution: false }, "Sponsor funding checkout session created. Contribution is confirmed only after Stripe webhook confirmation.");
}
