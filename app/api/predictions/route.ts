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
  const challengeRef = db.collection("challenges").doc(challengeId);
  const participantRef = db.collection("challengeParticipants").doc(predictedParticipantId);
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
      const [challengeSnap, participantSnap, walletSnap] = await Promise.all([transaction.get(challengeRef), transaction.get(participantRef), transaction.get(walletRef)]);
      if (!challengeSnap.exists) throw new Error("CHALLENGE_NOT_FOUND");
      const challenge = challengeSnap.data() ?? {};
      const visibility = String(challenge.visibility ?? challenge.type ?? "public").toLowerCase();
      if (visibility.includes("private") || visibility.includes("exclusive")) throw new Error("PRIVATE_CHALLENGE_PREDICTION_BLOCKED");
      const startsAt = challenge.startsAt ?? challenge.startDate;
      if (startsAt && new Date(String(startsAt)).getTime() <= Date.now()) throw new Error("PREDICTION_CLOSED");
      if (!participantSnap.exists || participantSnap.data()?.challengeId !== challengeId) throw new Error("PARTICIPANT_NOT_FOUND");
      const participantStatus = String(participantSnap.data()?.status ?? "joined");
      if (!["approved", "active", "joined", "checked_in", "submitted"].includes(participantStatus)) throw new Error("PARTICIPANT_NOT_ELIGIBLE");
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
    if (error instanceof Error && error.message === "PREDICTION_CLOSED") return fail("Prediction Arena is closed for this challenge.", 409, undefined, "PREDICTION_CLOSED");
    if (error instanceof Error && error.message === "PRIVATE_CHALLENGE_PREDICTION_BLOCKED") return fail("Prediction Arena is not available for this private challenge without a dedicated access review.", 403, undefined, "PRIVATE_CHALLENGE_PREDICTION_BLOCKED");
    if (error instanceof Error && ["CHALLENGE_NOT_FOUND", "PARTICIPANT_NOT_FOUND", "PARTICIPANT_NOT_ELIGIBLE"].includes(error.message)) return fail("Selected participant is not eligible for Prediction Arena.", 400, undefined, error.message);
    return serverError("Prediction could not be recorded.", error instanceof Error ? error.message : error);
  }
}


