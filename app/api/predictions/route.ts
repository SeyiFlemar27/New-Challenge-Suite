import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { predictionFee } from "@/lib/server/revenue-sharing";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Prediction Arena");
  const snap = await db.collection("predictionRecords").where("userId", "==", user.uid).limit(100).get();
  return ok({
    feature: {
      name: "Prediction Arena",
      dorocoinOnly: true,
      cashBettingEnabled: false,
      dorocoinCashConversionEnabled: false,
      platformFeePercent: 7,
      settlementRequiresAdminReview: true
    },
    predictions: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  }, "Prediction Arena foundation loaded.");
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
  const stake = Number(parsed.body?.stakeAmountDorocoin ?? 0);
  if (!challengeId) return validationError({ challengeId: "Challenge is required." });
  if (!predictedParticipantId) return validationError({ predictedParticipantId: "Predicted participant is required." });
  if (!Number.isFinite(stake) || stake <= 0) return validationError({ stakeAmountDorocoin: "Stake must be a positive DoroCoin amount." });
  const fee = predictionFee(stake);
  const now = new Date().toISOString();
  const ref = db.collection("predictionRecords").doc();
  const walletRef = db.collection("doroCoinWallets").doc(user.uid);
  const txnRef = db.collection("doroCoinTransactions").doc();
  const record = {
    id: ref.id,
    userId: user.uid,
    challengeId,
    predictedParticipantId,
    ...fee,
    status: "settlement_pending",
    createdAt: now,
    lockedAt: null,
    settledAt: null,
    settlementRequiresAdminReview: true,
    rewardType: "dorocoin_only",
    cashPayoutEnabled: false,
    moneyMovementEnabled: false
  };
  try {
    await db.runTransaction(async (transaction) => {
      const walletSnap = await transaction.get(walletRef);
      const balance = Number(walletSnap.data()?.balance ?? 0);
      if (balance < fee.stakeAmountDorocoin) throw new Error("INSUFFICIENT_DOROCOINS");
      transaction.set(walletRef, {
        userId: user.uid,
        balance: balance - fee.stakeAmountDorocoin,
        lockedBalance: Number(walletSnap.data()?.lockedBalance ?? 0) + fee.netPoolDorocoin,
        updatedAt: now
      }, { merge: true });
      transaction.set(txnRef, {
        id: txnRef.id,
        userId: user.uid,
        amount: -fee.stakeAmountDorocoin,
        balanceAfter: balance - fee.stakeAmountDorocoin,
        type: "prediction_arena_stake",
        description: `Prediction Arena stake for challenge ${challengeId}`,
        sourceId: ref.id,
        challengeId,
        predictionId: ref.id,
        cashConversionEnabled: false,
        createdBy: user.uid,
        createdAt: now
      });
      transaction.set(ref, { ...record, walletTransactionId: txnRef.id });
    });
    return ok({ prediction: record }, "Prediction recorded for admin-reviewed settlement. No rewards were settled.");
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_DOROCOINS") return fail("Insufficient DoroCoins for this Prediction Arena stake.", 409, undefined, "INSUFFICIENT_DOROCOINS");
    return serverError("Prediction could not be recorded.", error instanceof Error ? error.message : error);
  }
}
