import { getStripe } from "@/lib/stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import { getOptionalRequestUser, requireRequestUser } from "@/lib/server/auth";
import { challengeForPlanAccess } from "@/lib/server/challenge-access";
import { buildChallengeLeaderboard } from "@/lib/server/leaderboard";
import { canAccessChallenge } from "@/lib/plan-access";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import {
  attachPredictionCheckoutSession,
  createPendingPrediction,
  findEligiblePredictionTarget,
  predictionAccessForViewer,
  predictionProviderState,
  PREDICTION_PAYMENT_PURPOSE
} from "@/lib/server/predictions";
import { hasPrivateChallengeAccess } from "@/lib/server/private-invites";
import { isSponsorProfile } from "@/lib/server/submission-lifecycle";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { checkoutLineItem } from "@/lib/server/monetization-payments";

export const dynamic = "force-dynamic";

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function loadProfile(db: FirebaseFirestore.Firestore, userId: string) {
  const [accountSnap, profileSnap, kycSnap] = await Promise.all([
    db.collection("users").doc(userId).get(),
    db.collection("profiles").doc(userId).get(),
    db.collection("kycMetadata").doc(userId).get()
  ]);
  return {
    ...(profileSnap.data() ?? {}),
    ...(accountSnap.data() ?? {}),
    kycStatus: kycSnap.data()?.kycStatus ?? accountSnap.data()?.kycStatus ?? profileSnap.data()?.kycStatus ?? "not_started"
  } as Record<string, unknown>;
}

function publicPrediction(record: Record<string, unknown>) {
  return {
    id: record.id,
    challengeId: record.challengeId,
    predictedParticipantId: record.predictedParticipantId,
    predictedSubmissionId: record.predictedSubmissionId,
    stakeAmountCents: record.stakeAmountCents,
    currency: record.currency,
    status: record.status ?? record.predictionStatus,
    predictionStatus: record.predictionStatus ?? record.status,
    paymentStatus: record.paymentStatus,
    predictionClosesAt: record.predictionClosesAt,
    createdAt: record.createdAt,
    activatedAt: record.activatedAt,
    settledAt: record.settledAt,
    rewardAmountCents: record.rewardAmountCents ?? null
  };
}

export async function GET(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Prediction Arena");
  const user = await getOptionalRequestUser(request);
  const challengeId = new URL(request.url).searchParams.get("challengeId");
  if (!challengeId) {
    if (!user) return fail("Authentication required.", 401, undefined, "AUTHENTICATION_REQUIRED");
    const predictionSnap = await db.collection("predictionRecords").where("userId", "==", user.uid).limit(100).get();
    return ok({
      feature: {
        name: "Prediction Arena",
        predictionPaymentsProvider: predictionProviderState(),
        platformFeeRate: 0.07,
        externalPayoutsEnabled: false
      },
      predictions: predictionSnap.docs.map((doc) => publicPrediction({ id: doc.id, ...doc.data() }))
    }, "Predictions loaded.");
  }

  const challengeSnap = await db.collection("challenges").doc(challengeId).get();
  if (!challengeSnap.exists) return fail("Challenge not found.", 404, undefined, "CHALLENGE_NOT_FOUND");
  const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
  let profile: Record<string, unknown> = {};
  if (user) {
    profile = await loadProfile(db, user.uid);
    const accessContext = await challengeForPlanAccess(db, challenge, user.uid);
    if (accessContext.privateOnly && !accessContext.hasAccessGrant) return fail("A valid challenge invite or approval is required.", 403, undefined, "PRIVATE_ACCESS_REQUIRED");
    const planAccess = canAccessChallenge(profile, accessContext.challenge);
    if (!planAccess.allowed) return fail("Plan access is required for this challenge.", 403, undefined, planAccess.code ?? "PLAN_ACCESS_DENIED");
  } else if (!(String(challenge.visibility ?? "public").toLowerCase() === "public")) {
    return fail("Challenge not found.", 404, undefined, "CHALLENGE_NOT_FOUND");
  }

  const leaderboard = await buildChallengeLeaderboard(db, challengeId, { limit: 250, includeEligibleEntries: true });
  const access = predictionAccessForViewer({
    challengeId,
    challenge,
    userId: user?.uid ?? null,
    user,
    profile,
    eligibleSubmissionCount: leaderboard.entries.length
  });
  const predictionSnap = user
    ? await db.collection("predictionRecords").doc(`prediction_${challengeId}_${user.uid}`).get()
    : null;
  return ok({
    feature: {
      name: "Prediction Arena",
      platformFeeRate: 0.07,
      predictionPaymentsProvider: predictionProviderState(),
      realMoneyOnly: true,
      dorocoinAllowed: false,
      externalPayoutsEnabled: false
    },
    access,
    prediction: predictionSnap?.exists ? publicPrediction({ id: predictionSnap.id, ...predictionSnap.data() }) : null
  }, "Prediction Arena status loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const rateLimit = consumeRateLimit(`prediction:${user.uid}`, { limit: 10, windowMs: 60_000 });
  if (!rateLimit.allowed) return fail("Too many prediction attempts. Please wait before trying again.", 429, { retryAfterSeconds: rateLimit.retryAfterSeconds }, "RATE_LIMITED");
  const db = getAdminDb();
  if (!db) return serverUnavailable("Prediction Arena");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;

  const challengeId = text(parsed.body?.challengeId, 160);
  const predictedSubmissionId = text(parsed.body?.predictedSubmissionId, 160);
  const stakeAmountUsd = Number(parsed.body?.stakeAmountUsd ?? 0);
  const currency = text(parsed.body?.currency ?? "usd", 12).toLowerCase();
  if (!challengeId) return validationError({ challengeId: "Challenge is required." });
  if (!predictedSubmissionId) return validationError({ predictedSubmissionId: "Select an eligible participant." });
  if (!Number.isFinite(stakeAmountUsd) || stakeAmountUsd < 1 || stakeAmountUsd > 500) {
    return validationError({ stakeAmountUsd: "Enter a prediction amount between $1 and $500." });
  }
  if (currency !== "usd") return validationError({ currency: "Prediction Arena currently supports USD only." });
  if (parsed.body?.dorocoinAmount !== undefined || parsed.body?.paymentMethod === "dorocoin" || parsed.body?.currency === "DORO") {
    return fail("DoroCoins cannot be used in Prediction Arena.", 400, undefined, "DOROCOIN_NOT_ALLOWED");
  }
  if (parsed.body?.acceptedTerms !== true) return validationError({ acceptedTerms: "Accept the Prediction Arena terms before continuing." });

  const [challengeSnap, profile] = await Promise.all([
    db.collection("challenges").doc(challengeId).get(),
    loadProfile(db, user.uid)
  ]);
  if (!challengeSnap.exists) return fail("Challenge not found.", 404, undefined, "CHALLENGE_NOT_FOUND");
  const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
  const privateVisibility = ["private", "exclusive"].some((value) => String(challenge.visibility ?? challenge.type ?? "").toLowerCase().includes(value));
  if (privateVisibility && !(await hasPrivateChallengeAccess(db, challengeId, user.uid))) {
    return fail("A valid challenge invite or approval is required.", 403, undefined, "PRIVATE_ACCESS_REQUIRED");
  }
  const leaderboard = await buildChallengeLeaderboard(db, challengeId, { limit: 250, includeEligibleEntries: true });
  const access = predictionAccessForViewer({
    challengeId,
    challenge,
    userId: user.uid,
    user,
    profile,
    eligibleSubmissionCount: leaderboard.entries.length
  });
  if (!access.canPredict) return fail(access.message, 403, { predictionAccess: access }, String(access.reason ?? "PREDICTION_BLOCKED").toUpperCase());
  if (String(profile.kycStatus ?? "not_started") !== "verified") return fail("Identity verification is required before making a real-money prediction.", 403, undefined, "KYC_REQUIRED");
  if (profile.ageVerified !== true) return fail("Age verification is required before making a real-money prediction.", 403, undefined, "AGE_VERIFICATION_REQUIRED");
  if (profile.suspended === true || isSponsorProfile(profile)) return fail("This account cannot make predictions.", 403, undefined, "ACCOUNT_RESTRICTED");

  const target = findEligiblePredictionTarget(leaderboard.entries, predictedSubmissionId);
  if (!target) return fail("Selected participant is not eligible for Prediction Arena.", 400, undefined, "PREDICTION_TARGET_NOT_ELIGIBLE");
  if (String(target.userId ?? "") === user.uid) return fail("You cannot predict yourself to win.", 403, undefined, "SELF_PREDICTION_NOT_ALLOWED");
  const amountCents = Math.round(stakeAmountUsd * 100);
  const pending = await createPendingPrediction(db, {
    challengeId,
    challenge,
    predictorId: user.uid,
    target,
    amountCents,
    predictionClosesAt: access.closesAt!,
  });
  const record = pending.record;
  if (pending.existing) {
    if (record.status === "active") return ok({ prediction: publicPrediction(record), existing: true }, "Your prediction is active.");
    if (record.status !== "pending_payment" || record.providerSessionId) {
      return ok({ prediction: publicPrediction(record), existing: true }, "Your existing prediction is shown.");
    }
  }

  const stripe = getStripe();
  if (!stripe) return fail("Prediction payment is not configured.", 503, { prediction: publicPrediction(record) }, "PAYMENT_CONFIGURATION_ERROR");
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [checkoutLineItem({
        amountCents,
        currency: "usd",
        name: `Prediction Arena - ${text(challenge.title, 90) || "Challenge"}`
      })],
      success_url: `${origin}/challenges/${encodeURIComponent(challengeId)}/prediction?payment=processing`,
      cancel_url: `${origin}/challenges/${encodeURIComponent(challengeId)}/prediction?payment=canceled`,
      metadata: {
        paymentPurpose: PREDICTION_PAYMENT_PURPOSE,
        predictionId: String(record.id),
        challengeId,
        userId: user.uid,
        amount: String(amountCents),
        currency: "usd"
      }
    }, {
      idempotencyKey: `prediction_checkout_${String(record.id)}_${String(record.createdAt ?? "")}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 240)
    });
    await attachPredictionCheckoutSession(db, String(record.id), session);
    return ok({
      url: session.url,
      prediction: publicPrediction(record),
      status: "pending_payment",
      webhookConfirmationRequired: true,
      successPageActivatesPrediction: false
    }, "Prediction checkout created. Your prediction activates only after payment confirmation.");
  } catch (error) {
    return serverError("Prediction checkout could not be created.", error instanceof Error ? error.message : error);
  }
}
