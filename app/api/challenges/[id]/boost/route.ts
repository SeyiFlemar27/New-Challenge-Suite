import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { applyDoroCoinTransaction } from "@/lib/server/dorocoin";
import { createNotification } from "@/lib/server/notifications";
import { fail, ok, serverUnavailable, readJson, validationError } from "@/lib/server/responses";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge boosts");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const packageId = parsed.body?.packageId;
  if (typeof packageId !== "string") return validationError({ packageId: "Select a valid boost package." });
  const [challengeSnap, packageSnap] = await Promise.all([
    db.collection("challenges").doc(id).get(),
    db.collection("boostPackages").doc(packageId).get()
  ]);
  if (!challengeSnap.exists) return fail("Challenge not found.", 404, { fieldErrors: { challengeId: "Challenge does not exist." } }, "NOT_FOUND");
  const challenge = challengeSnap.data() ?? {};
  const eligibleStatuses = ["published", "registration_open", "active", "voting"];
  if (!eligibleStatuses.includes(String(challenge.status ?? ""))) return fail("This challenge is not eligible for boosting.", 409, undefined, "BOOST_REJECTED");
  if (!packageSnap.exists || packageSnap.data()?.active !== true) return validationError({ packageId: "Select an active boost package." });
  const boostPackage = packageSnap.data()!;
  const coins = Number(boostPackage.coins);
  const durationDays = Number(boostPackage.durationDays);
  if (!Number.isFinite(coins) || coins <= 0) return validationError({ packageId: "Boost package has an invalid DoroCoin cost." });
  if (!Number.isFinite(durationDays) || durationDays <= 0) return validationError({ packageId: "Boost package has an invalid duration." });
  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setDate(endsAt.getDate() + durationDays);
  const ref = db.collection("boosts").doc();
  try {
    await applyDoroCoinTransaction(db, { userId: user.uid, amount: -coins, type: "boost_spend", description: `Boost challenge ${id}`, sourceId: ref.id, createdBy: user.uid });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Challenge boost could not be purchased.", 409, undefined, "BOOST_REJECTED");
  }
  const boost = { id: ref.id, challengeId: id, userId: user.uid, packageId, status: "active", coins, reach: boostPackage.reach ?? "", startsAt: now.toISOString(), endsAt: endsAt.toISOString(), viewsGained: 0 };
  await ref.set(boost);
  await db.collection("challenges").doc(id).set({
    boostCount: Number(challenge.boostCount ?? 0) + 1,
    boostedUntil: endsAt.toISOString(),
    visibilityBoostScore: Number(challenge.visibilityBoostScore ?? 0) + coins,
    updatedAt: now.toISOString()
  }, { merge: true });
  await createNotification(db, { userId: user.uid, type: "challenge_boosted", title: "Boost active", body: `${boostPackage.name ?? "Boost"} is now active.`, targetId: id });
  return ok({ boost }, "Challenge boost is active.");
}
