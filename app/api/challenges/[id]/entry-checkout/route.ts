import { getStripe } from "@/lib/stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { canAccessChallenge } from "@/lib/plan-access";
import { challengeForPlanAccess } from "@/lib/server/challenge-access";
import { createPendingEntryPayment, attachCheckoutSession, checkoutLineItem, checkoutMetadataForPurpose, isPaidEntryChallenge, paidEntryAmountCents } from "@/lib/server/monetization-payments";
import { isChallengeJoinable, isSponsorProfile } from "@/lib/server/submission-lifecycle";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Paid entry checkout");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  if ((parsed.body ?? {}).entryAgreementAccepted !== true) {
    return fail("Accept the challenge rules and entry agreement before paid entry checkout.", 400, { fieldErrors: { entryAgreementAccepted: "Required before checkout." } }, "VALIDATION_ERROR");
  }
  const { id: challengeId } = await params;
  const [accountSnap, profileSnap, challengeSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get(),
    db.collection("challenges").doc(challengeId).get()
  ]);
  if (!challengeSnap.exists) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
  const profile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) };
  if (isSponsorProfile(profile)) return fail("Sponsor accounts cannot join normal paid-entry challenges.", 403, undefined, "SPONSOR_ACCOUNT_BLOCKED");
  const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
  if (!isPaidEntryChallenge(challenge)) return fail("This challenge does not require paid entry checkout.", 409, undefined, "PAID_ENTRY_NOT_REQUIRED");
  const accessContext = await challengeForPlanAccess(db, challenge, user.uid);
  if (accessContext.privateOnly && !accessContext.hasAccessGrant) return fail("A valid private challenge invite or approval is required.", 403, { redirectTo: "/private-exclusive" }, "PRIVATE_INVITE_REQUIRED");
  const access = canAccessChallenge(profile, accessContext.challenge);
  if (!access.allowed) return fail("Your current plan does not allow access to this challenge.", 403, undefined, access.code ?? "CHALLENGE_ACCESS_DENIED");
  const joinable = isChallengeJoinable(challenge);
  if (!joinable.allowed) return fail(joinable.reason ?? "Registration is closed for this challenge.", 409, { lifecycle: joinable.lifecycle }, "CHALLENGE_JOIN_REJECTED");

  let record;
  try {
    record = await createPendingEntryPayment(db, { userId: user.uid, challengeId, challenge });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Paid entry checkout could not be prepared.", 409, undefined, "PAID_ENTRY_CHECKOUT_REJECTED");
  }
  const stripe = getStripe();
  if (!stripe) return fail("Stripe paid entry checkout is not configured.", 503, { payment: record, webhookConfirmationRequired: true }, "PAYMENT_CONFIGURATION_ERROR");
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [checkoutLineItem({ amountCents: paidEntryAmountCents(challenge), currency: "usd", name: `Challenge entry - ${String(challenge.title ?? "Challenge")}` })],
    success_url: `${origin}/challenges/${encodeURIComponent(challengeId)}?payment=processing&entryPaymentId=${encodeURIComponent(record.id)}`,
    cancel_url: `${origin}/challenges/${encodeURIComponent(challengeId)}?payment=canceled`,
    metadata: checkoutMetadataForPurpose("challenge_entry_fee", record)
  });
  await attachCheckoutSession(db, "challengeEntryPayments", record.id, session);
  return ok({ url: session.url, entryPaymentId: record.id, status: "pending", webhookConfirmationRequired: true, checkoutSuccessActivatesEntry: false }, "Paid entry checkout session created. Entry activates only after Stripe webhook confirmation.");
}

