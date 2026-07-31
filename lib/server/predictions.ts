import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { getChallengePhaseSummary } from "@/lib/challenge-status";
import { challengeOwnerIds } from "@/lib/server/prize-approvals";
import { deterministicId } from "@/lib/server/idempotency";
import type { LeaderboardRow } from "@/lib/server/leaderboard";
import { isSponsorProfile } from "@/lib/server/submission-lifecycle";

export const PREDICTION_PLATFORM_FEE_RATE = 0.07;
export const PREDICTION_PAYMENT_PURPOSE = "prediction_stake";
export const PREDICTION_MIN_STAKE_CENTS = 500;
export const PREDICTION_MAX_STAKE_CENTS = 50_000;
export const DEFAULT_PREDICTION_LIQUIDITY_THRESHOLD_CENTS = 10_000;
export const PREDICTION_SETTLEMENT_STATUSES = [
  "open",
  "closing_soon",
  "locked",
  "awaiting_results",
  "under_review",
  "settled",
  "refunded",
  "disputed"
] as const;
export const PREDICTION_STATUSES = [
  "open",
  "closing_soon",
  "locked",
  "awaiting_results",
  "under_review",
  "disputed",
  "pending_payment",
  "active",
  "lost",
  "won",
  "voided",
  "refunded_review",
  "settlement_pending",
  "settled",
  "requires_admin_review"
] as const;

export type PredictionStatus = (typeof PREDICTION_STATUSES)[number];
export type PredictionProviderState = "disabled" | "stripe_pending_approval" | "stripe_approved";

export interface PredictionAccess {
  enabled: boolean;
  marketApproved: boolean;
  providerReady: boolean;
  available: boolean;
  visible: boolean;
  windowOpen: boolean;
  closesAt: string | null;
  eligibleSubmissionCount: number;
  authenticated: boolean;
  canPredict: boolean;
  reason: string | null;
  message: string;
  loginPath: string;
  rankingOnly: boolean;
}

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cents(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export function predictionFeatureEnabled() {
  return process.env.REAL_MONEY_PREDICTION_ARENA_ENABLED === "true";
}

export function predictionProviderState(): PredictionProviderState {
  const value = process.env.PREDICTION_PAYMENTS_PROVIDER;
  if (value === "stripe_approved") return "stripe_approved";
  if (value === "stripe_pending_approval") return "stripe_pending_approval";
  return "disabled";
}

export function predictionChallengeEnabled(challenge: Record<string, unknown>) {
  return challenge.predictionEnabled === true
    || challenge.predictionArenaEnabled === true
    || challenge.predictionMarketEnabled === true;
}

export function predictionMarketApproved(challenge: Record<string, unknown>) {
  return challenge.predictionMarketApproved === true
    || ["approved", "open"].includes(text(challenge.predictionMarketStatus).toLowerCase());
}

export function predictionWindowState(
  challenge: Record<string, unknown>,
  now = new Date(),
  eligibleSubmissionCount = 0
) {
  const phaseSummary = getChallengePhaseSummary(challenge, now, { eligibleSubmissionCount });
  const closesAt = phaseSummary.votingStartAt;
  const closesAtMs = closesAt ? Date.parse(closesAt) : Number.NaN;
  const validClose = Number.isFinite(closesAtMs);
  const windowOpen = Boolean(
    predictionChallengeEnabled(challenge)
    && predictionMarketApproved(challenge)
    && validClose
    && now.getTime() < closesAtMs
    && !["draft", "pending_review", "cancelled", "completed", "winners_announced", "timeline_needs_review"].includes(phaseSummary.phase)
  );
  return {
    windowOpen,
    closesAt,
    phaseSummary,
    rankingOnly: windowOpen,
    exactVotingOpenTimeClosesPredictions: true
  };
}

export function predictionAccessForViewer(input: {
  challengeId: string;
  challenge: Record<string, unknown>;
  userId?: string | null;
  user?: { isAdmin?: boolean; role?: string | null } | null;
  profile?: Record<string, unknown>;
  eligibleSubmissionCount: number;
  now?: Date;
}): PredictionAccess {
  const enabled = predictionChallengeEnabled(input.challenge);
  const marketApproved = predictionMarketApproved(input.challenge);
  const providerReady = predictionFeatureEnabled() && predictionProviderState() === "stripe_approved";
  const authenticated = Boolean(input.userId);
  const owners = new Set(challengeOwnerIds(input.challenge));
  const ownerBlocked = Boolean(input.userId && owners.has(input.userId));
  const sponsorBlocked = isSponsorProfile(input.profile ?? {});
  const adminBlocked = Boolean(input.user?.isAdmin || text(input.user?.role).toLowerCase() === "admin");
  const window = predictionWindowState(input.challenge, input.now, input.eligibleSubmissionCount);
  const hasTargets = input.eligibleSubmissionCount > 0;

  let reason: string | null = null;
  let message = "Predict who you think will win before voting opens.";
  if (!enabled || !marketApproved) {
    reason = "not_available";
    message = "Prediction Arena is not available for this challenge.";
  } else if (!window.closesAt) {
    reason = "timeline_needs_review";
    message = "Prediction timing is not configured correctly.";
  } else if (!window.windowOpen) {
    reason = "prediction_closed";
    message = "Predictions are closed because voting has started.";
  } else if (!hasTargets) {
    reason = "no_eligible_submissions";
    message = "Prediction Arena will open when eligible submissions are available.";
  } else if (!authenticated) {
    reason = "auth_required";
    message = "Log in to make a prediction.";
  } else if (ownerBlocked) {
    reason = "owner_blocked";
    message = "You cannot predict on your own challenge.";
  } else if (sponsorBlocked) {
    reason = "sponsor_blocked";
    message = "Sponsor accounts cannot make predictions in participant competitions.";
  } else if (adminBlocked) {
    reason = "admin_blocked";
    message = "Admin accounts cannot make predictions while acting as admin.";
  } else if (!providerReady) {
    reason = "provider_not_ready";
    message = "Prediction payment is not available right now.";
  }

  const canPredict = reason === null;
  return {
    enabled,
    marketApproved,
    providerReady,
    available: enabled && marketApproved && window.windowOpen && hasTargets && providerReady && (canPredict || reason === "auth_required"),
    visible: enabled && marketApproved && hasTargets,
    windowOpen: window.windowOpen,
    closesAt: window.closesAt,
    eligibleSubmissionCount: input.eligibleSubmissionCount,
    authenticated,
    canPredict,
    reason,
    message,
    loginPath: `/auth/login?next=${encodeURIComponent(`/challenges/${input.challengeId}/prediction`)}`,
    rankingOnly: window.rankingOnly
  };
}

export function findEligiblePredictionTarget(rows: LeaderboardRow[], submissionId: string) {
  return rows.find((row) => String(row.submissionId ?? row.id) === submissionId) ?? null;
}

export function predictionStakeAmounts(amountCents: number) {
  const grossPredictionPoolCents = cents(amountCents);
  const platformFeeCents = Math.round(grossPredictionPoolCents * PREDICTION_PLATFORM_FEE_RATE);
  return {
    grossPredictionPoolCents,
    platformFeeRate: PREDICTION_PLATFORM_FEE_RATE,
    platformFeeCents,
    netPredictionPoolCents: grossPredictionPoolCents - platformFeeCents
  };
}

export function predictionPoolEstimate(input: {
  totalPoolCents: number;
  participantPoolCents: number;
  userStakeCents: number;
}) {
  const totalPoolCents = cents(input.totalPoolCents);
  const participantPoolCents = cents(input.participantPoolCents);
  const userStakeCents = cents(input.userStakeCents);
  const netPoolCents = totalPoolCents - Math.round(totalPoolCents * PREDICTION_PLATFORM_FEE_RATE);
  const estimatedReturnCents = participantPoolCents > 0
    ? Math.floor(userStakeCents / participantPoolCents * netPoolCents)
    : 0;
  return {
    currentPoolShare: totalPoolCents > 0 ? participantPoolCents / totalPoolCents : 0,
    estimatedMultiplier: userStakeCents > 0 ? estimatedReturnCents / userStakeCents : 0,
    estimatedReturnCents,
    guaranteed: false
  };
}

export async function preparePredictionStakeIncrease(db: Firestore, input: {
  predictionId: string;
  predictorId: string;
  predictedSubmissionId: string;
  amountCents: number;
  predictionClosesAt: string;
  now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const ref = db.collection("predictionRecords").doc(input.predictionId);
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const record = { id: snap.id, ...(snap.data() ?? {}) } as Record<string, unknown>;
    if (!snap.exists || record.predictorId !== input.predictorId || record.status !== "active") throw new Error("ACTIVE_PREDICTION_REQUIRED");
    if (record.predictedSubmissionId !== input.predictedSubmissionId) throw new Error("PREDICTION_TARGET_LOCKED");
    if (record.pendingIncreaseAmountCents) throw new Error("PREDICTION_INCREASE_PENDING");
    const existingStakeCents = cents(record.stakeAmountCents);
    if (existingStakeCents + input.amountCents > PREDICTION_MAX_STAKE_CENTS) throw new Error("PREDICTION_MAX_STAKE_EXCEEDED");
    transaction.set(ref, {
      amountCents: input.amountCents,
      pendingIncreaseAmountCents: input.amountCents,
      pendingIncreaseCreatedAt: now,
      predictionClosesAt: input.predictionClosesAt,
      updatedAt: now
    }, { merge: true });
    return { ...record, amountCents: input.amountCents, pendingIncreaseAmountCents: input.amountCents, increasing: true };
  });
}

export function predictionRecordId(challengeId: string, predictorId: string) {
  return deterministicId("prediction", challengeId, predictorId);
}

export async function createPendingPrediction(
  db: Firestore,
  input: {
    challengeId: string;
    challenge: Record<string, unknown>;
    predictorId: string;
    target: LeaderboardRow;
    amountCents: number;
    predictionClosesAt: string;
    now?: string;
  }
) {
  const now = input.now ?? new Date().toISOString();
  const id = predictionRecordId(input.challengeId, input.predictorId);
  const recordRef = db.collection("predictionRecords").doc(id);
  const amounts = predictionStakeAmounts(input.amountCents);
  const record = {
    id,
    predictionId: id,
    challengeId: input.challengeId,
    predictorId: input.predictorId,
    userId: input.predictorId,
    predictedParticipantId: String(input.target.userId ?? ""),
    predictedSubmissionId: String(input.target.submissionId ?? input.target.id),
    stakeAmount: amounts.grossPredictionPoolCents,
    stakeAmountCents: amounts.grossPredictionPoolCents,
    stakeAmountUsd: amounts.grossPredictionPoolCents / 100,
    amountCents: amounts.grossPredictionPoolCents,
    currency: "usd",
    paymentPurpose: PREDICTION_PAYMENT_PURPOSE,
    status: "pending_payment" satisfies PredictionStatus,
    predictionStatus: "pending_payment",
    paymentStatus: "pending",
    provider: "stripe",
    providerSessionId: null,
    paymentIntentId: null,
    webhookConfirmed: false,
    platformFeeRate: PREDICTION_PLATFORM_FEE_RATE,
    predictionClosesAt: input.predictionClosesAt,
    createdAt: now,
    updatedAt: now,
    activatedAt: null,
    settledAt: null,
    settlementLedgerId: null,
    settlementStatus: "not_started",
    dorocoinAllowed: false,
    affectsVotes: false,
    affectsLeaderboard: false,
    affectsWinnerSelection: false,
    externalPayoutEnabled: false
  };

  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(recordRef);
    if (existing.exists) {
      const data = { id: existing.id, ...(existing.data() ?? {}) } as Record<string, unknown>;
      if (["pending_payment", "active", "settlement_pending", "won", "lost", "settled"].includes(String(data.status ?? data.predictionStatus))) {
        return { record: data, existing: true };
      }
    }
    transaction.set(recordRef, record, { merge: false });
    return { record, existing: false };
  });
}

export async function attachPredictionCheckoutSession(
  db: Firestore,
  predictionId: string,
  session: Stripe.Checkout.Session
) {
  const now = new Date().toISOString();
  await db.collection("predictionRecords").doc(predictionId).set({
    providerSessionId: session.id,
    stripeCheckoutSessionId: session.id,
    checkoutCreatedAt: now,
    updatedAt: now,
    successPageActivatesPrediction: false,
    webhookConfirmationRequired: true
  }, { merge: true });
}

function assertPredictionSession(session: Stripe.Checkout.Session, record: Record<string, unknown>) {
  if (session.mode !== "payment") throw new Error("Prediction checkout was not a one-time payment session.");
  if (session.payment_status !== "paid") throw new Error("Prediction checkout is not payment-confirmed.");
  if (session.metadata?.paymentPurpose !== PREDICTION_PAYMENT_PURPOSE) throw new Error("Prediction payment purpose mismatch.");
  if (session.metadata?.predictionId !== record.id) throw new Error("Prediction payment record mismatch.");
  if (cents(session.amount_total) !== cents(record.amountCents)) throw new Error("Prediction payment amount mismatch.");
  if (text(session.currency, 8).toLowerCase() !== text(record.currency, 8).toLowerCase()) throw new Error("Prediction payment currency mismatch.");
}

export async function confirmPredictionPayment(
  db: Firestore,
  event: Stripe.Event,
  session: Stripe.Checkout.Session
) {
  const predictionId = text(session.metadata?.predictionId, 160);
  if (!predictionId) throw new Error("Prediction checkout is missing its prediction ID.");
  const predictionRef = db.collection("predictionRecords").doc(predictionId);
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(predictionRef);
    if (!snap.exists) throw new Error("Stored prediction record not found.");
    const record = { id: snap.id, ...(snap.data() ?? {}) } as Record<string, unknown>;
    assertPredictionSession(session, record);
    const isIncrease = session.metadata?.predictionIncrease === "true";
    if (!isIncrease && record.webhookConfirmed === true && record.status === "active") {
      return { handled: true, kind: PREDICTION_PAYMENT_PURPOSE, id: predictionId, duplicate: true };
    }
    if (isIncrease && record.lastIncreaseStripeEventId === event.id) {
      return { handled: true, kind: PREDICTION_PAYMENT_PURPOSE, id: predictionId, duplicate: true };
    }

    const closesAtMs = Date.parse(String(record.predictionClosesAt ?? ""));
    const paymentAfterClose = !Number.isFinite(closesAtMs) || event.created * 1000 >= closesAtMs;
    const common = {
      providerSessionId: session.id,
      stripeCheckoutSessionId: session.id,
      paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
      stripeEventId: event.id,
      webhookConfirmed: true,
      paymentStatus: "confirmed",
      updatedAt: now
    };
    if (paymentAfterClose) {
      transaction.set(predictionRef, {
        ...common,
        status: "requires_admin_review",
        predictionStatus: "requires_admin_review",
        settlementStatus: "requires_admin_review",
        reviewReason: "payment_confirmed_after_prediction_close",
        refundStatus: "refunded_review",
        automaticRefundEnabled: false
      }, { merge: true });
      return { handled: true, kind: PREDICTION_PAYMENT_PURPOSE, id: predictionId, activated: false, requiresAdminReview: true };
    }
    if (isIncrease) {
      const increaseCents = cents(record.pendingIncreaseAmountCents ?? record.amountCents);
      transaction.set(predictionRef, {
        ...common,
        status: "active",
        predictionStatus: "active",
        stakeAmount: FieldValue.increment(increaseCents),
        stakeAmountCents: FieldValue.increment(increaseCents),
        stakeAmountUsd: FieldValue.increment(increaseCents / 100),
        pendingIncreaseAmountCents: null,
        pendingIncreaseCreatedAt: null,
        lastIncreaseStripeEventId: event.id,
        lastIncreaseConfirmedAt: now
      }, { merge: true });
      transaction.set(db.collection("challenges").doc(String(record.challengeId)), {
        confirmedPredictionPoolCents: FieldValue.increment(increaseCents),
        updatedAt: now
      }, { merge: true });
      return { handled: true, kind: PREDICTION_PAYMENT_PURPOSE, id: predictionId, increased: true, duplicate: false };
    }
    transaction.set(predictionRef, {
      ...common,
      status: "active",
      predictionStatus: "active",
      activatedAt: now,
      settlementStatus: "pending_winner_approval"
    }, { merge: true });
    transaction.set(db.collection("challenges").doc(String(record.challengeId)), {
      confirmedPredictionPoolCents: FieldValue.increment(cents(record.amountCents)),
      confirmedPredictionCount: FieldValue.increment(1),
      updatedAt: now
    }, { merge: true });
    transaction.set(db.collection("auditLogs").doc(deterministicId("prediction_payment", predictionId, event.id)), {
      actorId: String(record.predictorId ?? record.userId),
      actorType: "user",
      action: "prediction.payment_confirmed",
      targetType: "prediction",
      targetId: predictionId,
      metadata: {
        challengeId: record.challengeId,
        amountCents: cents(record.amountCents),
        affectsVotes: false,
        affectsLeaderboard: false,
        payoutProviderCalled: false
      },
      createdAt: now
    });
    return { handled: true, kind: PREDICTION_PAYMENT_PURPOSE, id: predictionId, activated: true, duplicate: false };
  });
}

export async function expirePredictionPayment(db: Firestore, session: Stripe.Checkout.Session) {
  const predictionId = text(session.metadata?.predictionId, 160);
  if (!predictionId) return { handled: false, reason: "prediction_id_missing" };
  const now = new Date().toISOString();
  if (session.metadata?.predictionIncrease === "true") {
    await db.collection("predictionRecords").doc(predictionId).set({
      pendingIncreaseAmountCents: null,
      pendingIncreaseCreatedAt: null,
      providerSessionId: null,
      paymentStatus: "confirmed",
      status: "active",
      predictionStatus: "active",
      increasePaymentStatus: "expired",
      updatedAt: now
    }, { merge: true });
    return { handled: true, kind: PREDICTION_PAYMENT_PURPOSE, id: predictionId, status: "active", increaseExpired: true };
  }
  await db.collection("predictionRecords").doc(predictionId).set({
    status: "voided",
    predictionStatus: "voided",
    paymentStatus: "expired",
    providerSessionId: session.id,
    expiredAt: now,
    updatedAt: now,
    webhookConfirmed: false
  }, { merge: true });
  return { handled: true, kind: PREDICTION_PAYMENT_PURPOSE, id: predictionId, status: "voided" };
}
