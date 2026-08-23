import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { createNotification } from "@/lib/server/notifications";
import { deterministicId, getRequestIdempotencyKey } from "@/lib/server/idempotency";
import { fail, forbidden, ok, serverError, serverUnavailable, readJson } from "@/lib/server/responses";
import { extendedMonthlyBoostEnd, monthlyBoostEntitlement, monthlyBoostEntitlementKey, monthlyBoostMonthKey } from "@/lib/monthly-boost";
import { getChallengeBoostAccess, loadMonthlyBoostState } from "@/lib/server/boosts";

export const dynamic = "force-dynamic";

async function accountProfile(db: FirebaseFirestore.Firestore, userId: string) {
  const [account, profile] = await Promise.all([db.collection("users").doc(userId).get(), db.collection("profiles").doc(userId).get()]);
  return { ...(profile.data() ?? {}), ...(account.data() ?? {}) } as Record<string, unknown>;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Monthly Boost");
  try {
    const [challengeSnap, profile] = await Promise.all([db.collection("challenges").doc(id).get(), accountProfile(db, user.uid)]);
    if (!challengeSnap.exists) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
    const challenge = { id, ...challengeSnap.data() } as Record<string, unknown>;
    const access = getChallengeBoostAccess({ challenge, userId: user.uid, profile });
    if (!access.owner) return forbidden("Only the challenge owner can manage Monthly Boost.");
    return ok({ state: await loadMonthlyBoostState(db, challenge, user.uid, profile) }, "Monthly Boost state loaded.");
  } catch (error) {
    return serverError("Monthly Boost state could not be loaded.", error instanceof Error ? error.message : error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Monthly Boost");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const idempotencyKey = getRequestIdempotencyKey(request, parsed.body);
  if (!idempotencyKey) return fail("Please confirm Monthly Boost again.", 400, undefined, "IDEMPOTENCY_KEY_REQUIRED");
  const now = new Date();
  const challengeRef = db.collection("challenges").doc(id);
  const userRef = db.collection("users").doc(user.uid);
  const profileRef = db.collection("profiles").doc(user.uid);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const [challengeSnap, accountSnap, profileSnap] = await Promise.all([transaction.get(challengeRef), transaction.get(userRef), transaction.get(profileRef)]);
      if (!challengeSnap.exists) throw new BoostError("NOT_FOUND", "Challenge not found.", 404);
      const challenge = { id, ...challengeSnap.data() } as Record<string, unknown>;
      const profile = { ...(profileSnap.data() ?? {}), ...(accountSnap.data() ?? {}) } as Record<string, unknown>;
      const access = getChallengeBoostAccess({ challenge, userId: user.uid, profile });
      if (access.reason === "owner_required") throw new BoostError("FORBIDDEN", "Only the challenge owner can use Monthly Boost.", 403);
      if (access.reason === "plan_required") throw new BoostError("PLAN_REQUIRED", "Monthly Boosts are available with eligible premium plans.", 403);
      if (access.reason === "public_challenge_required") throw new BoostError("CHALLENGE_NOT_DISCOVERABLE", "This challenge must be approved and publicly discoverable before it can be boosted.", 409);
      if (access.reason === "status_not_eligible") throw new BoostError("BOOST_STATUS_INELIGIBLE", "Monthly Boost is available only while a challenge is Scheduled or Active.", 409);
      if (!access.allowed) throw new BoostError("BOOST_FORBIDDEN", "Monthly Boost is not available for this challenge.", 403);

      const entitlementKey = monthlyBoostEntitlementKey(profile, now);
      const entitlementRef = db.collection("monthlyBoostEntitlements").doc(deterministicId("monthly_boost_entitlement", user.uid, entitlementKey));
      const redemptionRef = db.collection("monthlyBoostRedemptions").doc(deterministicId("monthly_boost", user.uid, id, idempotencyKey));
      const [entitlementSnap, redemptionSnap] = await Promise.all([transaction.get(entitlementRef), transaction.get(redemptionRef)]);
      const entitlement = monthlyBoostEntitlement(profile, Number(entitlementSnap.data()?.used ?? 0), now);
      if (redemptionSnap.exists) return { replay: true, endsAt: redemptionSnap.data()?.endsAt, entitlement };
      if (entitlement.allowance <= 0) throw new BoostError("PLAN_REQUIRED", "Monthly Boosts are available with eligible premium plans.", 403);
      if (entitlement.remaining <= 0) throw new BoostError("MONTHLY_BOOST_EXHAUSTED", "You have used all Monthly Boosts available for this month.", 409);

      const startsAt = now.toISOString();
      const endsAt = extendedMonthlyBoostEnd(challenge.monthlyBoostEndsAt ?? challenge.boostEndsAt ?? challenge.boostedUntil, now);
      const nextUsed = entitlement.used + 1;
      const redemption = { id: redemptionRef.id, userId: user.uid, challengeId: id, entitlementKey, entitlementMonth: monthlyBoostMonthKey(now), planId: entitlement.planId, durationHours: 72, startsAt, endsAt, status: "active", createdAt: startsAt };
      transaction.set(entitlementRef, { userId: user.uid, entitlementKey, month: monthlyBoostMonthKey(now), planId: entitlement.planId, allowance: entitlement.allowance, used: nextUsed, updatedAt: startsAt }, { merge: true });
      transaction.set(redemptionRef, redemption);
      transaction.set(challengeRef, { monthlyBoostEndsAt: endsAt, monthlyBoostStatus: "active", monthlyBoostUpdatedAt: startsAt, updatedAt: startsAt }, { merge: true });
      transaction.set(db.collection("auditLogs").doc(`${redemptionRef.id}_redeemed`), { id: `${redemptionRef.id}_redeemed`, actorId: user.uid, challengeId: id, action: "monthly_boost.redeemed", entityType: "challenge", entityId: id, createdAt: startsAt, metadata: { entitlementKey, durationHours: 72 } });
      return { replay: false, endsAt, entitlement: { ...entitlement, used: nextUsed, remaining: Math.max(0, entitlement.allowance - nextUsed) } };
    });

    if (!result.replay) await createNotification(db, { userId: user.uid, type: "challenge_boosted", title: "Monthly Boost active", body: "Your challenge received 72 hours of additional discovery ranking weight.", targetId: id }).catch(() => undefined);
    return ok({ boost: { challengeId: id, endsAt: result.endsAt, status: "active" }, entitlement: result.entitlement, idempotentReplay: result.replay }, result.replay ? "Monthly Boost was already applied." : "Monthly Boost is active.");
  } catch (error) {
    if (error instanceof BoostError) return fail(error.message, error.status, undefined, error.code);
    console.error("[monthly-boost] redemption failed", { challengeId: id, userId: user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Monthly Boost could not be applied.", error instanceof Error ? error.message : error);
  }
}

class BoostError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}
