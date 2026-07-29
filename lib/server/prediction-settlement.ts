import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";
import { normalizeWinnerProposalWinners } from "@/lib/server/prize-approvals";
import { predictionStakeAmounts } from "@/lib/server/predictions";

type ConfirmedPrediction = {
  id: string;
  predictorId: string;
  predictedSubmissionId: string;
  stakeAmountCents: number;
};

function cents(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export function calculatePredictionSettlement(predictions: ConfirmedPrediction[], winningSubmissionId: string) {
  const confirmed = predictions.filter((item) => item.stakeAmountCents > 0);
  const grossPredictionPoolCents = confirmed.reduce((sum, item) => sum + item.stakeAmountCents, 0);
  const amounts = predictionStakeAmounts(grossPredictionPoolCents);
  const correct = confirmed.filter((item) => item.predictedSubmissionId === winningSubmissionId);
  const totalCorrectStakeCents = correct.reduce((sum, item) => sum + item.stakeAmountCents, 0);
  const rewards = correct.map((item) => ({
    predictionId: item.id,
    userId: item.predictorId,
    stakeAmountCents: item.stakeAmountCents,
    rewardCents: totalCorrectStakeCents > 0
      ? Math.floor(amounts.netPredictionPoolCents * item.stakeAmountCents / totalCorrectStakeCents)
      : 0
  }));
  let remainder = amounts.netPredictionPoolCents - rewards.reduce((sum, item) => sum + item.rewardCents, 0);
  for (const reward of rewards.sort((a, b) => a.predictionId.localeCompare(b.predictionId))) {
    if (remainder <= 0) break;
    reward.rewardCents += 1;
    remainder -= 1;
  }
  return {
    ...amounts,
    totalCorrectStakeCents,
    correctPredictionCount: correct.length,
    rewards,
    requiresAdminReview: correct.length === 0,
    message: correct.length === 0 ? "No correct predictions. Admin review required." : "Prediction rewards calculated."
  };
}

export async function settleApprovedPredictions(db: Firestore, input: {
  challengeId: string;
  proposalId: string;
  adminId: string;
}) {
  const settlementRef = db.collection("predictionSettlements").doc(input.challengeId);
  const proposalRef = db.collection("winnerProposals").doc(input.proposalId);
  const predictionsQuery = db.collection("predictionRecords").where("challengeId", "==", input.challengeId).limit(500);
  const now = new Date().toISOString();

  return db.runTransaction(async (transaction) => {
    const [settlementSnap, proposalSnap, predictionsSnap] = await Promise.all([
      transaction.get(settlementRef),
      transaction.get(proposalRef),
      transaction.get(predictionsQuery)
    ]);
    if (settlementSnap.exists && settlementSnap.data()?.status === "settled") {
      return { settled: true, idempotent: true, ...(settlementSnap.data() ?? {}), payoutProviderCalled: false };
    }
    if (!proposalSnap.exists || proposalSnap.data()?.status !== "approved" || proposalSnap.data()?.challengeId !== input.challengeId) {
      return { settled: false, status: "winner_approval_required", message: "Admin-approved winners are required before prediction settlement.", payoutProviderCalled: false };
    }
    const approvedWinners = normalizeWinnerProposalWinners(proposalSnap.data()?.winners);
    const winner = approvedWinners.sort((a, b) => a.placement - b.placement)[0];
    if (!winner?.submissionId) {
      return { settled: false, status: "winner_submission_required", message: "The approved winner must reference an eligible submission.", payoutProviderCalled: false };
    }
    const active = predictionsSnap.docs.flatMap((doc) => {
      const data = doc.data() ?? {};
      if (data.status !== "active" || data.webhookConfirmed !== true || data.paymentStatus !== "confirmed") return [];
      return [{
        id: doc.id,
        predictorId: String(data.predictorId ?? data.userId ?? ""),
        predictedSubmissionId: String(data.predictedSubmissionId ?? ""),
        stakeAmountCents: cents(data.stakeAmountCents ?? data.amountCents)
      }];
    });
    const result = calculatePredictionSettlement(active, winner.submissionId);
    if (result.requiresAdminReview) {
      transaction.set(settlementRef, {
        id: input.challengeId,
        challengeId: input.challengeId,
        proposalId: input.proposalId,
        status: "requires_admin_review",
        reason: "no_correct_predictions",
        message: result.message,
        grossPredictionPoolCents: result.grossPredictionPoolCents,
        platformFeeCents: result.platformFeeCents,
        netPredictionPoolCents: result.netPredictionPoolCents,
        externalPayoutEnabled: false,
        createdAt: settlementSnap.exists ? settlementSnap.data()?.createdAt ?? now : now,
        updatedAt: now
      }, { merge: true });
      for (const prediction of active) {
        transaction.set(db.collection("predictionRecords").doc(prediction.id), {
          status: "requires_admin_review",
          predictionStatus: "requires_admin_review",
          settlementStatus: "requires_admin_review",
          updatedAt: now
        }, { merge: true });
      }
      transaction.set(db.collection("auditLogs").doc(deterministicId("prediction_settlement_review", input.challengeId, input.proposalId)), {
        actorId: input.adminId,
        actorType: "admin",
        action: "prediction.settlement_review_required",
        targetType: "prediction_settlement",
        targetId: input.challengeId,
        metadata: {
          proposalId: input.proposalId,
          reason: "no_correct_predictions",
          grossPredictionPoolCents: result.grossPredictionPoolCents,
          payoutProviderCalled: false
        },
        createdAt: now
      });
      return { settled: false, status: "requires_admin_review", ...result, payoutProviderCalled: false };
    }

    for (const reward of result.rewards) {
      const ledgerId = deterministicId("prediction_reward", input.challengeId, reward.predictionId);
      transaction.set(db.collection("cashLedger").doc(ledgerId), {
        id: ledgerId,
        userId: reward.userId,
        challengeId: input.challengeId,
        predictionId: reward.predictionId,
        sourceType: "prediction_reward",
        sourceId: reward.predictionId,
        direction: "credit",
        amountCents: reward.rewardCents,
        currency: "USD",
        status: "pending_hold",
        balanceBucket: "pending",
        idempotencyKey: ledgerId,
        withdrawalFeeRate: 0,
        winnerWithdrawalFeeApplies: false,
        kycRequiredBeforeWithdrawal: true,
        providerReference: null,
        payoutProviderCalled: false,
        createdBy: "prediction_settlement",
        reviewedBy: input.adminId,
        createdAt: now,
        updatedAt: now
      }, { merge: false });
      transaction.set(db.collection("cashWallets").doc(reward.userId), {
        userId: reward.userId,
        pendingBalanceCents: FieldValue.increment(reward.rewardCents),
        currency: "USD",
        status: "review_only",
        withdrawalsEnabled: false,
        payoutProviderConnected: false,
        updatedAt: now
      }, { merge: true });
      transaction.set(db.collection("predictionRecords").doc(reward.predictionId), {
        status: "settled",
        predictionStatus: "won",
        settlementStatus: "settled",
        rewardAmountCents: reward.rewardCents,
        settlementLedgerId: ledgerId,
        settledAt: now,
        updatedAt: now
      }, { merge: true });
    }
    const correctIds = new Set(result.rewards.map((item) => item.predictionId));
    for (const prediction of active) {
      if (correctIds.has(prediction.id)) continue;
      transaction.set(db.collection("predictionRecords").doc(prediction.id), {
        status: "settled",
        predictionStatus: "lost",
        settlementStatus: "settled",
        rewardAmountCents: 0,
        settledAt: now,
        updatedAt: now
      }, { merge: true });
    }
    const platformLedgerId = deterministicId("prediction_platform_fee", input.challengeId);
    transaction.set(db.collection("platformLedger").doc(platformLedgerId), {
      id: platformLedgerId,
      challengeId: input.challengeId,
      sourceType: "prediction_platform_fee",
      sourceId: input.challengeId,
      amountCents: result.platformFeeCents,
      currency: "USD",
      status: "recorded",
      platformFeeRate: 0.07,
      idempotencyKey: platformLedgerId,
      payoutProviderCalled: false,
      createdAt: now,
      updatedAt: now
    }, { merge: false });
    transaction.set(settlementRef, {
      id: input.challengeId,
      challengeId: input.challengeId,
      proposalId: input.proposalId,
      winningSubmissionId: winner.submissionId,
      status: "settled",
      grossPredictionPoolCents: result.grossPredictionPoolCents,
      platformFeeCents: result.platformFeeCents,
      netPredictionPoolCents: result.netPredictionPoolCents,
      totalCorrectStakeCents: result.totalCorrectStakeCents,
      rewardCount: result.rewards.length,
      externalPayoutEnabled: false,
      payoutProviderCalled: false,
      settledAt: now,
      createdAt: settlementSnap.exists ? settlementSnap.data()?.createdAt ?? now : now,
      updatedAt: now
    }, { merge: true });
    transaction.set(db.collection("auditLogs").doc(deterministicId("prediction_settlement", input.challengeId, input.proposalId)), {
      actorId: input.adminId,
      actorType: "admin",
      action: "prediction.settled",
      targetType: "prediction_settlement",
      targetId: input.challengeId,
      metadata: {
        proposalId: input.proposalId,
        grossPredictionPoolCents: result.grossPredictionPoolCents,
        platformFeeCents: result.platformFeeCents,
        rewardCount: result.rewards.length,
        payoutProviderCalled: false
      },
      createdAt: now
    });
    return { settled: true, status: "settled", ...result, payoutProviderCalled: false };
  });
}
