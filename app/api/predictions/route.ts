import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { predictionStakeFoundation } from "@/lib/server/revenue-sharing";
import { hasPrivateChallengeAccess } from "@/lib/server/private-invites";

export const dynamic = "force-dynamic";

type ProviderState = "disabled" | "stripe_pending_approval" | "stripe_approved";

function featureEnabled() {
  return process.env.REAL_MONEY_PREDICTION_ARENA_ENABLED === "true";
}

function providerState(): ProviderState {
  const value = process.env.PREDICTION_PAYMENTS_PROVIDER;
  if (value === "stripe_approved") return "stripe_approved";
  if (value === "stripe_pending_approval") return "stripe_pending_approval";
  return "disabled";
}

function eligibilityStatus(input: { enabled: boolean; provider: ProviderState; kycStatus: string; ageVerified: boolean; region: string; marketApproved: boolean; windowOpen: boolean; suspended: boolean }) {
  if (input.suspended) return "suspended";
  if (!input.enabled) return "not_available";
  if (input.provider === "disabled") return "provider_not_configured";
  if (input.provider !== "stripe_approved") return "provider_not_approved";
  if (input.kycStatus !== "verified") return "kyc_required";
  if (!input.ageVerified) return "age_verification_required";
  if (input.region !== "US") return "region_not_supported";
  if (!input.marketApproved) return "market_not_open";
  if (!input.windowOpen) return "market_closed";
  return "eligible";
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Prediction Arena");
  const [userSnap, kycSnap, predictionSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("kycMetadata").doc(user.uid).get(),
    db.collection("predictionRecords").where("userId", "==", user.uid).limit(100).get()
  ]);
  const account = userSnap.data() ?? {};
  const kyc = kycSnap.data() ?? {};
  return ok({
    feature: {
      name: "Prediction Arena",
      realMoneyEnabled: featureEnabled() && providerState() === "stripe_approved",
      predictionPaymentsProvider: providerState(),
      providerApprovalRequired: true,
      featureFlagEnabled: featureEnabled(),
      platformFeePercent: 7,
      feeTiming: "calculated_from_server_amount_before_provider_checkout",
      settlementRequiresAdminReview: true,
      automaticSettlementEnabled: false,
      automaticPayoutsEnabled: false,
      automaticRefundsEnabled: false,
      minimumStakeUsd: 1,
      defaultMaximumStakeUsd: 100,
      verifiedMaximumStakeUsd: 500,
      publicLabel: "Prediction Arena"
    },
    userEligibility: {
      kycStatus: String(kyc.kycStatus ?? account.kycStatus ?? "not_started"),
      ageVerified: account.ageVerified === true,
      region: String(account.selfDeclaredRegion ?? account.region ?? "unknown"),
      termsAccepted: account.predictionArenaTermsAccepted === true
    },
    predictions: predictionSnap.docs.map((doc) => ({ id: doc.id, ...doc.data(), automaticSettlementEnabled: false, automaticPayoutsEnabled: false }))
  }, "Prediction Arena compliance foundation loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Prediction Arena");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const challengeId = String(parsed.body?.challengeId ?? "");
  const predictedParticipantId = String(parsed.body?.predictedParticipantId ?? "");
  const stake = Number(parsed.body?.stakeAmountUsd ?? 0);
  const acceptedTerms = parsed.body?.acceptedTerms === true;
  const acceptedRiskNotice = parsed.body?.acceptedRiskNotice === true;
  if (!challengeId) return validationError({ challengeId: "Challenge is required." });
  if (!predictedParticipantId) return validationError({ predictedParticipantId: "Predicted participant is required." });
  if (!Number.isFinite(stake) || stake < 1) return validationError({ stakeAmountUsd: "Minimum Prediction Arena stake is $1." });
  if (!acceptedTerms || !acceptedRiskNotice) return validationError({ acceptedTerms: "Terms and responsible-play notice must be accepted." });

  const now = new Date().toISOString();
  const provider = providerState();
  const challengeSnap = await db.collection("challenges").doc(challengeId).get();
  if (!challengeSnap.exists) return fail("Selected challenge is not eligible for Prediction Arena.", 404, undefined, "CHALLENGE_NOT_FOUND");
  const challenge = challengeSnap.data() ?? {};
  const visibility = String(challenge.visibility ?? challenge.type ?? "public").toLowerCase();
  if ((visibility.includes("private") || visibility.includes("exclusive")) && !(await hasPrivateChallengeAccess(db, challengeId, user.uid))) {
    return fail("Private challenge Prediction Arena access requires a valid invite/access record.", 403, undefined, "PRIVATE_ACCESS_REQUIRED");
  }
  const startsAt = challenge.startsAt ?? challenge.startDate;
  const windowOpen = !startsAt || new Date(String(startsAt)).getTime() > Date.now();
  const marketApproved = challenge.predictionMarketApproved === true || challenge.predictionMarketStatus === "approved";
  const [participantSnap, userSnap, kycSnap] = await Promise.all([
    db.collection("challengeParticipants").doc(predictedParticipantId).get(),
    db.collection("users").doc(user.uid).get(),
    db.collection("kycMetadata").doc(user.uid).get()
  ]);
  if (!participantSnap.exists || participantSnap.data()?.challengeId !== challengeId) return fail("Selected participant is not eligible for Prediction Arena.", 400, undefined, "PARTICIPANT_NOT_FOUND");
  const participantStatus = String(participantSnap.data()?.status ?? "joined");
  if (!["approved", "active", "joined", "checked_in", "submitted"].includes(participantStatus)) return fail("Selected participant is not eligible for Prediction Arena.", 400, undefined, "PARTICIPANT_NOT_ELIGIBLE");
  const account = userSnap.data() ?? {};
  const kyc = kycSnap.data() ?? {};
  const kycStatus = String(kyc.kycStatus ?? account.kycStatus ?? "not_started");
  const status = eligibilityStatus({
    enabled: featureEnabled(),
    provider,
    kycStatus,
    ageVerified: account.ageVerified === true,
    region: String(account.selfDeclaredRegion ?? account.region ?? "unknown"),
    marketApproved,
    windowOpen,
    suspended: account.suspended === true
  });
  if (status !== "eligible") {
    return fail(status === "provider_not_approved" || status === "provider_not_configured" ? "Real-money Prediction Arena is not active yet. Payment provider approval is required." : "Prediction Arena eligibility is not complete for this user or challenge.", 403, { eligibilityStatus: status, predictionPaymentsProvider: provider }, status.toUpperCase());
  }
  const maxStake = kycStatus === "verified" ? 500 : 100;
  if (stake > maxStake) return fail(`Stake exceeds the current $${maxStake} limit.`, 409, { maxStakeUsd: maxStake }, "STAKE_LIMIT_EXCEEDED");
  const fee = predictionStakeFoundation(stake);
  const ref = db.collection("predictionRecords").doc();
  const record = {
    id: ref.id,
    userId: user.uid,
    challengeId,
    predictedParticipantId,
    ...fee,
    predictionStatus: "payment_review_required",
    paymentStatus: "provider_checkout_not_created",
    settlementStatus: "admin_review_required",
    refundStatus: "not_applicable",
    marketStatus: "review",
    eligibilityStatus: status,
    predictionPaymentsProvider: provider,
    acceptedTermsAt: now,
    acceptedRiskNoticeAt: now,
    createdAt: now,
    lockedAt: null,
    settledAt: null,
    settlementRequiresAdminReview: true,
    refundRequiresAdminReview: true,
    automaticSettlementEnabled: false,
    automaticPayoutsEnabled: false,
    automaticRefundsEnabled: false,
    moneyMovementEnabled: false,
    dorocoinStakingAllowed: false
  };
  try {
    await ref.set(record);
    await db.collection("predictionSettlementReviews").doc(ref.id).set({
      id: ref.id,
      predictionId: ref.id,
      challengeId,
      userId: user.uid,
      status: "payment_review_required",
      settlementStatus: "admin_review_required",
      refundStatus: "not_applicable",
      automaticSettlementEnabled: false,
      automaticPayoutsEnabled: false,
      createdAt: now,
      updatedAt: now
    });
    return ok({ prediction: record }, "Prediction Arena intent recorded for payment review. No stake, settlement, or payout was executed.");
  } catch (error) {
    return serverError("Prediction could not be recorded.", error instanceof Error ? error.message : error);
  }
}
