import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { deterministicId } from "@/lib/server/idempotency";
import { fail, ok, readJson, serverError, serverUnavailable } from "@/lib/server/responses";
import { VOTER_REWARD_TIERS } from "@/lib/server/revenue-sharing";
import { DEFAULT_REWARD_PRIZES, chooseRewardPrize, normalizeRewardPrize, normalizeSpinCredits, type RewardSpinTier } from "@/lib/server/rewards";

export const dynamic = "force-dynamic";

async function loadRewardPrizes(db: FirebaseFirestore.Firestore) {
  const snap = await db.collection("rewardWheelPrizes").where("enabled", "==", true).limit(200).get();
  const configured = snap.docs.map((doc) => normalizeRewardPrize(doc.id, doc.data()));
  return configured.length ? configured : DEFAULT_REWARD_PRIZES;
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Rewards");
  const [profileSnap, spinSnap, prizeSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("rewardSpinHistory").where("userId", "==", user.uid).limit(100).get(),
    db.collection("rewardWheelPrizes").where("enabled", "==", true).limit(200).get()
  ]);
  const configuredPrizes = prizeSnap.docs.map((doc) => normalizeRewardPrize(doc.id, doc.data()));
  const prizes = configuredPrizes.length ? configuredPrizes : DEFAULT_REWARD_PRIZES;
  const profile = profileSnap.data() ?? {};
  return ok({
    points: Number(profile.voterPoints ?? 0),
    spinCredits: Number(profile.rewardSpinCredits ?? 0),
    spinCreditsByTier: normalizeSpinCredits(profile.rewardSpinCreditsByTier ?? profile.rewardSpinCredits),
    tiers: VOTER_REWARD_TIERS,
    prizes,
    configuredPrizeCount: configuredPrizes.length,
    defaultPrizePoolActive: configuredPrizes.length === 0,
    history: spinSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    safety: {
      pointsSource: "server_confirmed_dorocoin_purchase_only",
      clientCanGrantPoints: false,
      clientCanGrantSpinCredits: false,
      serverSelectsPrize: true,
      cashOutEnabled: false
    }
  }, "Rewards foundation loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Rewards");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const tier = String(parsed.body?.tier ?? "basic") as RewardSpinTier;
  const idempotencyKey = String(parsed.body?.idempotencyKey ?? "").trim().slice(0, 120);
  if (!["basic", "standard", "premium"].includes(tier)) return fail("Select a valid reward wheel tier.", 400, undefined, "INVALID_REWARD_TIER");
  const now = new Date().toISOString();
  const userRef = db.collection("users").doc(user.uid);
  const spinId = idempotencyKey ? deterministicId("reward_spin", user.uid, tier, idempotencyKey) : db.collection("rewardSpinHistory").doc().id;
  const spinRef = db.collection("rewardSpinHistory").doc(spinId);
  const existingSpin = await spinRef.get();
  if (existingSpin.exists) return ok({ spin: { id: existingSpin.id, ...existingSpin.data() }, alreadyProcessed: true }, "This spin has already been recorded.");
  const prizes = await loadRewardPrizes(db);
  const prize = chooseRewardPrize(prizes, tier);
  if (!prize) return fail("No prizes are currently available for this wheel.", 409, undefined, "NO_AVAILABLE_PRIZES");
  const fulfillmentStatus = prize.manualFulfillmentRequired ? "pending_fulfillment" : prize.prizeType === "try_again" ? "no_reward" : "recorded_pending_safe_application";
  try {
    await db.runTransaction(async (transaction) => {
      const [userSnap, existing] = await Promise.all([transaction.get(userRef), transaction.get(spinRef)]);
      if (existing.exists) throw new Error("ALREADY_PROCESSED");
      const creditsByTier = normalizeSpinCredits(userSnap.data()?.rewardSpinCreditsByTier ?? userSnap.data()?.rewardSpinCredits);
      if (creditsByTier[tier] <= 0) throw new Error("NO_SPIN_CREDITS");
      creditsByTier[tier] -= 1;
      const prizeRef = prize.id.startsWith("default-") ? null : db.collection("rewardWheelPrizes").doc(prize.id);
      if (prizeRef) {
        const prizeSnap = await transaction.get(prizeRef);
        const quantity = Number(prizeSnap.data()?.quantity ?? prize.quantity ?? 0);
        if (Number.isFinite(quantity) && quantity > 0) transaction.set(prizeRef, { quantity: quantity - 1, updatedAt: now }, { merge: true });
      }
      transaction.set(userRef, { rewardSpinCredits: creditsByTier.basic + creditsByTier.standard + creditsByTier.premium, rewardSpinCreditsByTier: creditsByTier, updatedAt: now }, { merge: true });
      transaction.create(spinRef, {
        id: spinRef.id,
        userId: user.uid,
        wheelTier: tier,
        prizeId: prize.id,
        prizeName: prize.prizeName,
        prizeDescription: prize.prizeDescription,
        prizeType: prize.prizeType,
        prizeTier: prize.prizeTier,
        status: fulfillmentStatus,
        fulfillmentStatus,
        manualFulfillmentRequired: prize.manualFulfillmentRequired,
        fulfillmentInstructions: prize.fulfillmentInstructions ?? null,
        cashOutEnabled: false,
        serverSelected: true,
        idempotencyKey: idempotencyKey || null,
        createdAt: now,
        updatedAt: now
      });
      if (prize.manualFulfillmentRequired) {
        transaction.create(db.collection("rewardFulfillments").doc(spinRef.id), {
          id: spinRef.id,
          userId: user.uid,
          spinId: spinRef.id,
          prizeId: prize.id,
          prizeName: prize.prizeName,
          status: "pending_fulfillment",
          cashOutEnabled: false,
          manualFulfillmentRequired: true,
          createdAt: now,
          updatedAt: now
        });
      }
    });
    return ok({ spin: { id: spinRef.id, wheelTier: tier, prize, status: fulfillmentStatus, cashOutEnabled: false } }, prize.manualFulfillmentRequired ? "Prize recorded and pending fulfillment by the Challenge Suite team." : "Spin recorded. Safe reward application remains server-controlled.");
  } catch (error) {
    if (error instanceof Error && error.message === "NO_SPIN_CREDITS") return fail("No spin credits available yet.", 409, undefined, "NO_SPIN_CREDITS");
    if (error instanceof Error && error.message === "ALREADY_PROCESSED") return fail("This spin has already been recorded.", 409, undefined, "ALREADY_PROCESSED");
    return serverError("Reward spin could not be recorded. Your spin credit was not used.", error instanceof Error ? error.message : error);
  }
}
