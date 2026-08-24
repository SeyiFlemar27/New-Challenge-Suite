import { getStripe } from "@/lib/stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { canAccessChallenge } from "@/lib/plan-access";
import { challengeForPlanAccess, userOwnsChallenge } from "@/lib/server/challenge-access";
import { createPendingEntryPayment, attachCheckoutSession, checkoutLineItem, checkoutMetadataForPurpose, confirmRewardEntitledEntry, isPaidEntryChallenge } from "@/lib/server/monetization-payments";
import { releaseEntryEntitlementReservation } from "@/lib/server/reward-economy";
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
  if (userOwnsChallenge(challenge, user.uid)) return fail("Creators and hosts cannot compete in their own challenge.", 403, undefined, "SELF_ENTRY_NOT_ALLOWED");
  if (!isPaidEntryChallenge(challenge)) return fail("This challenge does not require paid entry checkout.", 409, undefined, "PAID_ENTRY_NOT_REQUIRED");
  const accessContext = await challengeForPlanAccess(db, challenge, user.uid);
  if (accessContext.privateOnly && !accessContext.hasAccessGrant) return fail("A valid private challenge invite or approval is required.", 403, { redirectTo: "/private-exclusive" }, "PRIVATE_INVITE_REQUIRED");
  const access = canAccessChallenge(profile, accessContext.challenge);
  if (!access.allowed) return fail("Your current plan does not allow access to this challenge.", 403, undefined, access.code ?? "CHALLENGE_ACCESS_DENIED");
  const joinable = isChallengeJoinable(challenge);
  if (!joinable.allowed) return fail(joinable.reason ?? "Registration is closed for this challenge.", 409, { lifecycle: joinable.lifecycle }, "CHALLENGE_JOIN_REJECTED");

  let record;
  try {
    record = await createPendingEntryPayment(db, { userId: user.uid, challengeId, challenge, rewardEntitlementId: typeof parsed.body?.rewardEntitlementId === "string" ? parsed.body.rewardEntitlementId : undefined });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Paid entry checkout could not be prepared.", 409, undefined, "PAID_ENTRY_CHECKOUT_REJECTED");
  }
  if (record.amountCents === 0 && record.rewardEntitlementId) {
    try {
      const confirmation = await confirmRewardEntitledEntry(db, record.id);
      return ok({ entryPaymentId: record.id, status: confirmation.status, participantId: confirmation.participantId, approvalRequired: confirmation.manualApproval, webhookConfirmationRequired: false, checkoutSuccessActivatesEntry: true }, "Reward applied. Your challenge entry is confirmed.");
    } catch (error) {
      await releaseEntryEntitlementReservation(db, { entitlementId: record.rewardEntitlementId, checkoutId: record.id });
      return fail(error instanceof Error ? error.message : "The reward could not be applied to this entry.", 409, undefined, "REWARD_ENTRY_CONFIRMATION_REJECTED");
    }
  }
  const stripe = getStripe();
  if (!stripe) {
    if (record.rewardEntitlementId) await releaseEntryEntitlementReservation(db, { entitlementId: record.rewardEntitlementId, checkoutId: record.id });
    return fail("Stripe paid entry checkout is not configured.", 503, { payment: record, webhookConfirmationRequired: true }, "PAYMENT_CONFIGURATION_ERROR");
  }
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [checkoutLineItem({ amountCents: record.amountCents, currency: "usd", name: `Challenge entry - ${String(challenge.title ?? "Challenge")}` })],
      success_url: `${origin}/challenges/${encodeURIComponent(challengeId)}/registration-success?entryPaymentId=${encodeURIComponent(record.id)}`,
      cancel_url: `${origin}/challenges/${encodeURIComponent(challengeId)}?payment=canceled`,
      metadata: checkoutMetadataForPurpose("challenge_entry_fee", record)
    });
  } catch (error) {
    if (record.rewardEntitlementId) await releaseEntryEntitlementReservation(db, { entitlementId: record.rewardEntitlementId, checkoutId: record.id });
    return fail("Paid entry checkout could not be started. Please try again.", 503, undefined, "PAYMENT_PROVIDER_UNAVAILABLE");
  }
  await attachCheckoutSession(db, "challengeEntryPayments", record.id, session);
  return ok({ url: session.url, entryPaymentId: record.id, status: "pending", webhookConfirmationRequired: true, checkoutSuccessActivatesEntry: false }, "Paid entry checkout session created. Entry activates only after Stripe webhook confirmation.");
}


