import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe";
import { requireRequestUser } from "@/lib/server/auth";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { editableDraftStatus } from "@/lib/server/challenge-drafts";
import { getChallengeMonetizationAccess } from "@/lib/server/payout-structure";
import { attachCreatorPrizeCheckoutSession, createPendingCreatorPrizeFunding, CREATOR_PRIZE_PAYMENT_PURPOSE } from "@/lib/server/prize-funding";
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
  const [challengeSnap, userSnap, profileSnap] = await Promise.all([
    db.collection("challenges").doc(challengeId).get(),
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get()
  ]);
  if (!challengeSnap.exists) return fail("Challenge draft not found.", 404, undefined, "CHALLENGE_NOT_FOUND");
  const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
  if (!userOwnsChallenge(challenge, user.uid)) return fail("Only the challenge owner can fund its prize pool.", 403, undefined, "PERMISSION_DENIED");
  if (!editableDraftStatus(challenge)) return fail("Creator prize funding must be completed before the challenge is published.", 409, undefined, "CHALLENGE_NOT_EDITABLE");
  const profile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(userSnap.exists ? userSnap.data() ?? {} : {}) };
  const access = getChallengeMonetizationAccess(profile);
  if (!access.canPreparePrizePool) return fail("Creator prize funding is available to eligible Creator, Host, and approved Enterprise accounts.", 403, undefined, "PRIZE_POOL_LOCKED");
  const confirmedCents = Math.max(0, Number(challenge.confirmedCreatorPrizeFundingCents ?? 0));
  if (confirmedCents > 0) return fail("This challenge already has confirmed creator prize funding. Contact support before changing a funded guarantee.", 409, { confirmedCents }, "PRIZE_FUNDING_ALREADY_CONFIRMED");

  const amountCents = body.data.amountCents;
  const payment = await createPendingCreatorPrizeFunding(db, { challengeId, creatorId: user.uid, amountCents, currency: "USD" });
  const currentMonetization = typeof challenge.monetization === "object" && challenge.monetization ? challenge.monetization as Record<string, unknown> : {};
  await db.collection("challenges").doc(challengeId).set({
    monetization: { ...currentMonetization, enabled: true, prizePoolRequested: true, creatorPrizeFundingRequiredCents: amountCents, creatorPrizeFundingStatus: "pending_payment", prizePoolFundingSource: "creator_funded" },
    prizeType: "money",
    prizeValue: amountCents / 100,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  const stripe = getStripe();
  if (!stripe) return fail("Stripe creator prize funding is not configured.", 503, { prizeFundingId: payment.id, status: "pending", webhookConfirmationRequired: true }, "PAYMENT_CONFIGURATION_ERROR");
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price_data: { currency: "usd", unit_amount: amountCents, product_data: { name: `Guaranteed prize funding - ${String(challenge.title ?? "Challenge").slice(0, 80)}` } }, quantity: 1 }],
    success_url: `${origin}/challenges/${encodeURIComponent(challengeId)}/prize-funding/success?prizeFundingId=${encodeURIComponent(String(payment.id))}`,
    cancel_url: `${origin}/checkout/cancel?paymentPurpose=${CREATOR_PRIZE_PAYMENT_PURPOSE}&challengeId=${encodeURIComponent(challengeId)}`,
    metadata: {
      paymentPurpose: CREATOR_PRIZE_PAYMENT_PURPOSE,
      transactionPurpose: "prize_pool_funding",
      creatorPrizeFundingId: String(payment.id),
      userId: user.uid,
      challengeId,
      amount: String(amountCents),
      currency: "USD",
      returnRoute: `/challenges/create/${challengeId}`,
      idempotencyKey: String(payment.id),
      environment: process.env.NODE_ENV,
      createdAt: new Date().toISOString()
    }
  });
  await attachCreatorPrizeCheckoutSession(db, String(payment.id), session);
  return ok({ url: session.url, prizeFundingId: payment.id, status: "pending", webhookConfirmationRequired: true, checkoutSuccessConfirmsFunding: false }, "Creator prize funding checkout created. Funding is reserved only after Stripe webhook confirmation.");
}