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
  PREDICTION_MAX_STAKE_CENTS,
  PREDICTION_MIN_STAKE_CENTS,
  predictionAccessForViewer,
  predictionPoolEstimate,
  predictionProviderState,
  predictionRecordId,
  preparePredictionStakeIncrease,
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
    pendingIncreaseAmountCents: record.pendingIncreaseAmountCents ?? null,
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
    ? await db.collection("predictionRecords").doc(predictionRecordId(challengeId, user.uid)).get()
    : null;
  const poolSnap = await db.collection("predictionRecords").where("challengeId", "==", challengeId).limit(500).get();
  const confirmed = poolSnap.docs
    .map((doc) => doc.data() ?? {})
    .filter((record) => record.status === "active" && record.webhookConfirmed === true && record.paymentStatus === "confirmed");
  const totalPoolCents = confirmed.reduce((sum, record) => sum + Number(record.stakeAmountCents ?? 0), 0);
  const bySubmission = new Map<string, { amountStakedCents: number; predictorCount: number }>();
  for (const record of confirmed) {
    const submissionId = String(record.predictedSubmissionId ?? "");
    const current = bySubmission.get(submissionId) ?? { amountStakedCents: 0, predictorCount: 0 };
    current.amountStakedCents += Number(record.stakeAmountCents ?? 0);
    current.predictorCount += 1;
    bySubmission.set(submissionId, current);
  }
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
    prediction: predictionSnap?.exists ? publicPrediction({ id: predictionSnap.id, ...predictionSnap.data() }) : null,
    pool: {
      totalStakedCents: totalPoolCents,
      predictorCount: confirmed.length,
      participants: Object.fromEntries([...bySubmission.entries()].map(([submissionId, value]) => [
        submissionId,
        {
          ...value,
          ...predictionPoolEstimate({
            totalPoolCents,
            participantPoolCents: value.amountStakedCents,
            userStakeCents: 100
          })
        }
      ]))
    }
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
  if (!Number.isFinite(stakeAmountUsd) || Math.round(stakeAmountUsd * 100) < PREDICTION_MIN_STAKE_CENTS || Math.round(stakeAmountUsd * 100) > PREDICTION_MAX_STAKE_CENTS) {
    return validationError({ stakeAmountUsd: "Enter a prediction amount between $5 and $500." });
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
  const predictionId = predictionRecordId(challengeId, user.uid);
  const existingSnap = await db.collection("predictionRecords").doc(predictionId).get();
  const existingRecord = existingSnap.exists ? { id: existingSnap.id, ...(existingSnap.data() ?? {}) } as Record<string, unknown> : null;
  let pending: { record: Record<string, unknown>; existing: boolean; increasing?: boolean };
  if (existingRecord?.status === "active") {
    try {
      const record = await preparePredictionStakeIncrease(db, {
        predictionId,
        predictorId: user.uid,
        predictedSubmissionId,
        amountCents,
        predictionClosesAt: access.closesAt!
      });
      pending = { record: record as Record<string, unknown>, existing: false, increasing: true };
    } catch (error) {
      const code = error instanceof Error ? error.message : "PREDICTION_INCREASE_REJECTED";
      if (code === "PREDICTION_TARGET_LOCKED") return fail("You can increase your prediction only for the same participant.", 409, undefined, code);
      if (code === "PREDICTION_INCREASE_PENDING") return fail("A prediction increase is already awaiting payment confirmation.", 409, undefined, code);
      if (code === "PREDICTION_MAX_STAKE_EXCEEDED") return fail("Your total prediction amount cannot exceed $500.", 400, undefined, code);
      return fail("Prediction amount could not be increased.", 400, undefined, code);
    }
  } else pending = await createPendingPrediction(db, {
    challengeId,
    challenge,
    predictorId: user.uid,
    target,
    amountCents,
    predictionClosesAt: access.closesAt!,
  }) as { record: Record<string, unknown>; existing: boolean };
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
        currency: "usd",
        predictionIncrease: pending.increasing ? "true" : "false"
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
