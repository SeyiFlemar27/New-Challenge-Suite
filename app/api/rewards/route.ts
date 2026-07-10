import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable } from "@/lib/server/responses";
import { VOTER_REWARD_TIERS } from "@/lib/server/revenue-sharing";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Rewards");
  const [profileSnap, spinSnap, prizeSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("rewardSpinHistory").where("userId", "==", user.uid).limit(100).get(),
    db.collection("rewardWheelPrizes").where("enabled", "==", true).limit(100).get()
  ]);
  const profile = profileSnap.data() ?? {};
  return ok({
    points: Number(profile.voterPoints ?? 0),
    spinCredits: Number(profile.rewardSpinCredits ?? 0),
    tiers: VOTER_REWARD_TIERS,
    prizes: prizeSnap.docs.map((doc) => ({ id: doc.id, ...doc.data(), cashOutEnabled: false })),
    history: spinSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  }, "Rewards foundation loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Rewards");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const now = new Date().toISOString();
  const userRef = db.collection("users").doc(user.uid);
  const spinRef = db.collection("rewardSpinHistory").doc();
  try {
    await db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const credits = Number(userSnap.data()?.rewardSpinCredits ?? 0);
      if (credits <= 0) throw new Error("NO_SPIN_CREDITS");
      transaction.set(userRef, { rewardSpinCredits: credits - 1, updatedAt: now }, { merge: true });
      transaction.set(spinRef, {
        id: spinRef.id,
        userId: user.uid,
        prizeName: "Manual prize review",
        prizeType: "manual_foundation",
        status: "pending_admin_fulfillment",
        cashOutEnabled: false,
        manualFulfillmentRequired: true,
        createdAt: now,
        updatedAt: now
      });
    });
    return ok({ spinId: spinRef.id, status: "pending_admin_fulfillment" }, "Spin recorded for admin fulfillment. No cash lottery or cash-out prize was created.");
  } catch (error) {
    if (error instanceof Error && error.message === "NO_SPIN_CREDITS") return fail("No spin credits available yet.", 409, undefined, "NO_SPIN_CREDITS");
    return serverError("Reward spin could not be recorded.", error instanceof Error ? error.message : error);
  }
}
