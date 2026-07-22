import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { canAccessChallenge } from "@/lib/plan-access";
import { challengeForPlanAccess } from "@/lib/server/challenge-access";
import { attachCheckoutSession, checkoutLineItem, checkoutMetadataForPurpose, createPendingPaidVotePurchase } from "@/lib/server/monetization-payments";
import { isSponsorProfile } from "@/lib/server/submission-lifecycle";

const schema = z.object({
  voteQuantity: z.coerce.number().int().min(1).max(1000),
  amountCents: z.coerce.number().int().min(100).max(100000000),
  submissionId: z.string().trim().max(160).optional().or(z.literal(""))
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Paid vote checkout");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = schema.safeParse(parsed.body ?? {});
  if (!body.success) return validationError(Object.fromEntries(body.error.issues.map((issue) => [String(issue.path[0] ?? "paidVotes"), issue.message])));
  const { id: challengeId } = await params;
  const [accountSnap, profileSnap, challengeSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get(),
    db.collection("challenges").doc(challengeId).get()
  ]);
  if (!challengeSnap.exists) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
  const profile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) };
  if (isSponsorProfile(profile)) return fail("Sponsor accounts cannot vote in normal user challenges.", 403, undefined, "SPONSOR_ACCOUNT_BLOCKED");
  const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
  const accessContext = await challengeForPlanAccess(db, challenge, user.uid);
  if (accessContext.privateOnly && !accessContext.hasAccessGrant) return fail("A valid private challenge invite or approval is required.", 403, { redirectTo: "/private-exclusive" }, "PRIVATE_INVITE_REQUIRED");
  const access = canAccessChallenge(profile, accessContext.challenge);
  if (!access.allowed) return fail("Your current plan does not allow access to this challenge.", 403, undefined, access.code ?? "CHALLENGE_ACCESS_DENIED");

  let purchase;
  try {
    purchase = await createPendingPaidVotePurchase(db, { userId: user.uid, challengeId, challenge, voteQuantity: body.data.voteQuantity, amountCents: body.data.amountCents, submissionId: body.data.submissionId || undefined });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Paid vote checkout could not be prepared.", 409, undefined, "PAID_VOTE_CHECKOUT_REJECTED");
  }
  const stripe = getStripe();
  if (!stripe) return fail("Stripe paid vote checkout is not configured.", 503, { purchase, webhookConfirmationRequired: true, paidVoteCreditGranted: false }, "PAYMENT_CONFIGURATION_ERROR");
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [checkoutLineItem({ amountCents: purchase.amountCents, currency: "USD", name: `${purchase.voteQuantity} paid vote credits` })],
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&paymentPurpose=paid_vote&challengeId=${encodeURIComponent(challengeId)}`,
    cancel_url: `${origin}/checkout/cancel?paymentPurpose=paid_vote&challengeId=${encodeURIComponent(challengeId)}`,
    metadata: checkoutMetadataForPurpose("paid_vote", purchase)
  });
  await attachCheckoutSession(db, "paidVotePurchases", purchase.id, session);
  return ok({ url: session.url, votePurchaseId: purchase.id, status: "pending", webhookConfirmationRequired: true, paidVoteCreditGranted: false, checkoutSuccessGrantsVotes: false }, "Paid vote checkout session created. Vote credits are granted only after Stripe webhook confirmation.");
}
