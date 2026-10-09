import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe";
import { requireRequestUser } from "@/lib/server/auth";
import { requireChallengeManagementAccess } from "@/lib/server/challenge-management-access";
import { ENTERPRISE_WORKSPACE_LIMITS } from "@/lib/enterprise-access";
import { editableDraftStatus } from "@/lib/server/challenge-drafts";
import { getChallengeMonetizationAccess } from "@/lib/server/payout-structure";
import { attachCreatorPrizeCheckoutSession, createPendingCreatorPrizeFunding, CREATOR_PRIZE_PAYMENT_PURPOSE, releasePendingCreatorPrizeFunding } from "@/lib/server/prize-funding";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

const schema = z.object({ amountCents: z.coerce.number().int().min(500).max(100000000) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Creator prize funding");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = schema.safeParse(parsed.body ?? {});
  if (!body.success) return validationError({ amount: body.error.issues[0]?.message ?? "Enter a valid prize amount." });
  const { id: challengeId } = await params;
  const managementAccess = await requireChallengeManagementAccess(request, challengeId, "finance.prepare");
  if (managementAccess.response) return managementAccess.response;
  const challengeSnap = await db.collection("challenges").doc(challengeId).get();
  if (!challengeSnap.exists) return fail("Challenge draft not found.", 404, undefined, "CHALLENGE_NOT_FOUND");
  const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
  if (!editableDraftStatus(challenge)) return fail("Creator prize funding must be completed before the challenge is published.", 409, undefined, "CHALLENGE_NOT_EDITABLE");
  const profile = managementAccess.enterpriseAccess
    ? { planId: "enterprise", planStatus: "active", accountType: "enterprise", enterpriseAccessStatus: "approved" }
    : {};
  const access = getChallengeMonetizationAccess(profile);
  if (!access.canPreparePrizePool) return fail("Creator prize funding is available to eligible Creator, Host, and approved Enterprise accounts.", 403, undefined, "PRIZE_POOL_LOCKED");
  const confirmedCents = Math.max(0, Number(challenge.confirmedCreatorPrizeFundingCents ?? 0));
  if (confirmedCents > 0) return fail("This challenge already has confirmed creator prize funding. Contact support before changing a funded guarantee.", 409, { confirmedCents }, "PRIZE_FUNDING_ALREADY_CONFIRMED");

  const amountCents = body.data.amountCents;
  const officialEnterprise = challenge.officialChallenge === true || challenge.ownershipType === "challenge_suite_official" || Boolean(challenge.organizationOwnerId);
  if (officialEnterprise && confirmedCents + amountCents > ENTERPRISE_WORKSPACE_LIMITS.maximumPrizeAmountCents) return fail("Enterprise challenge prize funding cannot exceed $10,000.", 422, { maximumPrizeAmountCents: ENTERPRISE_WORKSPACE_LIMITS.maximumPrizeAmountCents }, "ENTERPRISE_PRIZE_LIMIT_EXCEEDED");

  const stripe = getStripe();
  if (!stripe) return fail("Stripe creator prize funding is not configured.", 503, { webhookConfirmationRequired: true }, "PAYMENT_CONFIGURATION_ERROR");
  const organizationOwnerId = officialEnterprise ? String(challenge.organizationOwnerId ?? "") : null;
  if (officialEnterprise && !organizationOwnerId) return fail("Enterprise organization ownership is missing.", 409, undefined, "ENTERPRISE_ORGANIZATION_REQUIRED");
  let payment: Awaited<ReturnType<typeof createPendingCreatorPrizeFunding>>;
  try {
    payment = await createPendingCreatorPrizeFunding(db, { challengeId, creatorId: user.uid, initiatedByUserId: user.uid, organizationOwnerId, amountCents, currency: "USD" });
  } catch (error) {
    if (error instanceof Error && error.message === "ENTERPRISE_PRIZE_LIMIT_EXCEEDED") return fail("Enterprise challenge prize and funding commitments cannot exceed $10,000.", 422, { maximumPrizeAmountCents: ENTERPRISE_WORKSPACE_LIMITS.maximumPrizeAmountCents }, "ENTERPRISE_PRIZE_LIMIT_EXCEEDED");
    return serverError("Creator prize funding could not be reserved.", error instanceof Error ? error.message : error);
  }
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let session;
  try {
  session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price_data: { currency: "usd", unit_amount: amountCents, product_data: { name: `Guaranteed prize funding - ${String(challenge.title ?? "Challenge").slice(0, 80)}` } }, quantity: 1 }],
    success_url: `${origin}/challenges/${encodeURIComponent(challengeId)}/prize-funding/success?prizeFundingId=${encodeURIComponent(String(payment.id))}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout/cancel?paymentPurpose=${CREATOR_PRIZE_PAYMENT_PURPOSE}&challengeId=${encodeURIComponent(challengeId)}`,
    metadata: {
      paymentPurpose: CREATOR_PRIZE_PAYMENT_PURPOSE,
      transactionPurpose: "prize_pool_funding",
      creatorPrizeFundingId: String(payment.id),
      userId: user.uid,
      organizationOwnerId: organizationOwnerId ?? "",
      initiatedByUserId: user.uid,
      challengeId,
      amount: String(amountCents),
      currency: "USD",
      returnRoute: `/challenges/create/${challengeId}`,
      idempotencyKey: String(payment.id),
      environment: process.env.NODE_ENV,
      createdAt: new Date().toISOString()
    }
  }, { idempotencyKey: `creator_prize_funding_${payment.id}` });
  } catch (error) {
    await releasePendingCreatorPrizeFunding(db, String(payment.id), "checkout_creation_failed").catch(() => undefined);
    return serverError("Stripe checkout could not be created.", error instanceof Error ? error.message : error);
  }
  await attachCreatorPrizeCheckoutSession(db, String(payment.id), session);
  return ok({ url: session.url, prizeFundingId: payment.id, status: "pending", webhookConfirmationRequired: true, checkoutSuccessConfirmsFunding: false }, "Creator prize funding checkout created. Funding is reserved only after Stripe webhook confirmation.");
}
