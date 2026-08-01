import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { applyDoroCoinTransaction } from "@/lib/server/dorocoin";
import { createNotification } from "@/lib/server/notifications";
import { deterministicId, getRequestIdempotencyKey } from "@/lib/server/idempotency";
import { fail, forbidden, ok, serverUnavailable, readJson, validationError } from "@/lib/server/responses";
import { getUserPlanAccess } from "@/lib/plan-access";
import { getChallengeBoostAccess } from "@/lib/server/boosts";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge boosts");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const packageId = parsed.body?.packageId;
  const idempotencyKey = getRequestIdempotencyKey(request, parsed.body);
  if (typeof packageId !== "string") return validationError({ packageId: "Select a valid boost package." });
  const [challengeSnap, packageSnap, accountSnap, profileSnap, boostsSnap] = await Promise.all([
    db.collection("challenges").doc(id).get(),
    db.collection("boostPackages").doc(packageId).get(),
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get(),
    db.collection("boosts").where("userId", "==", user.uid).limit(250).get()
  ]);
  const planAccess = getUserPlanAccess({
    ...(profileSnap.exists ? profileSnap.data() ?? {} : {}),
    ...(accountSnap.exists ? accountSnap.data() ?? {} : {})
  });
  if (!challengeSnap.exists) return fail("Challenge not found.", 404, { fieldErrors: { challengeId: "Challenge does not exist." } }, "NOT_FOUND");
  const challenge = challengeSnap.data() ?? {};
  const boostAccess = getChallengeBoostAccess({ challenge, userId: user.uid, profile: {
    ...(profileSnap.exists ? profileSnap.data() ?? {} : {}),
    ...(accountSnap.exists ? accountSnap.data() ?? {} : {})
  } });
  if (boostAccess.reason === "owner_required") return forbidden("Only the challenge owner can boost this challenge.");
  if (boostAccess.reason === "public_challenge_required") return fail("Publish this challenge publicly before boosting it.", 409, undefined, "BOOST_REJECTED");
  if (boostAccess.reason === "status_not_eligible") return fail("This challenge is not eligible for boosting.", 409, undefined, "BOOST_REJECTED");
  if (planAccess.accountType === "sponsor" || planAccess.monthlyBoostLimit <= 0) {
    return forbidden("Challenge boosts require the Creator plan or higher.");
  }
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const boostsThisMonth = boostsSnap.docs.filter((document) => {
    const startsAt = Date.parse(String(document.data().startsAt ?? ""));
    return Number.isFinite(startsAt) && startsAt >= monthStart.getTime();
  }).length;
  if (boostsThisMonth >= planAccess.monthlyBoostLimit) {
    return fail(`Your ${planAccess.planName} plan includes ${planAccess.monthlyBoostLimit} challenge boost${planAccess.monthlyBoostLimit === 1 ? "" : "s"} per month.`, 403, undefined, "PLAN_LIMIT_REACHED");
  }
  if (!boostAccess.allowed) return forbidden("Challenge boosts require an eligible creator, host, or enterprise owner account.");
  if (!packageSnap.exists || packageSnap.data()?.active !== true) return validationError({ packageId: "Select an active boost package." });
  const boostPackage = packageSnap.data()!;
  const coins = Number(boostPackage.coins);
  const durationDays = Number(boostPackage.durationDays);
  if (!Number.isFinite(coins) || coins <= 0) return validationError({ packageId: "Boost package has an invalid DoroCoin cost." });
  if (!Number.isFinite(durationDays) || durationDays <= 0) return validationError({ packageId: "Boost package has an invalid duration." });
  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setDate(endsAt.getDate() + durationDays);
  const boostId = idempotencyKey ? deterministicId("boost", id, user.uid, packageId, idempotencyKey) : undefined;
  const ref = boostId ? db.collection("boosts").doc(boostId) : db.collection("boosts").doc();
  if (boostId) {
    const existingBoost = await ref.get();
    if (existingBoost.exists) return ok({ boost: { id: ref.id, ...existingBoost.data() }, idempotentReplay: true }, "Challenge boost is already active.");
  }
  try {
    await applyDoroCoinTransaction(db, { userId: user.uid, amount: -coins, type: "boost_spend", description: `Boost challenge ${id}`, sourceId: ref.id, transactionId: deterministicId("boost", ref.id, "spend"), idempotencyKey: boostId ?? undefined, createdBy: user.uid });
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


