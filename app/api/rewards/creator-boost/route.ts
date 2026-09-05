import { getAdminDb } from "@/lib/firebase/admin";
import { extendedMonthlyBoostEnd } from "@/lib/monthly-boost";
import { requireRequestUser } from "@/lib/server/auth";
import { getChallengeBoostAccess } from "@/lib/server/boosts";
import { deterministicId } from "@/lib/server/idempotency";
import { createNotification } from "@/lib/server/notifications";
import { fail, ok, readJson, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

function latestBoostEnd(challenge: Record<string, unknown>) {
  const values = [challenge.monthlyBoostEndsAt, challenge.rewardBoostEndsAt, challenge.boostEndsAt, challenge.boostedUntil]
    .map((value) => Date.parse(String(value ?? "")))
    .filter(Number.isFinite);
  return values.length ? new Date(Math.max(...values)).toISOString() : null;
}

async function ownedEligibleChallenges(db: FirebaseFirestore.Firestore, userId: string) {
  const [created, hosted] = await Promise.all([
    db.collection("challenges").where("creatorId", "==", userId).limit(200).get(),
    db.collection("challenges").where("hostId", "==", userId).limit(200).get(),
  ]);
  return [...new Map([...created.docs, ...hosted.docs].map((doc) => [doc.id, { id: doc.id, ...doc.data() } as Record<string, unknown>])).values()]
    .filter((challenge) => {
      const access = getChallengeBoostAccess({ challenge, userId });
      return access.owner && access.publiclyVisible && access.eligibleStatus;
    })
    .map((challenge) => ({ id: String(challenge.id), title: String(challenge.title ?? challenge.name ?? "Untitled challenge"), status: String(challenge.status ?? challenge.lifecycleStatus ?? "active") }))
    .sort((left, right) => left.title.localeCompare(right.title));
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Creator Boost");
  const entitlementId = new URL(request.url).searchParams.get("entitlementId")?.trim();
  if (!entitlementId) return fail("Select a Creator Boost reward.", 400, undefined, "ENTITLEMENT_REQUIRED");
  try {
    const entitlementSnap = await db.collection("rewardEntitlements").doc(entitlementId).get();
    const entitlement = entitlementSnap.data() ?? {};
    if (!entitlementSnap.exists || entitlement.userId !== user.uid) return fail("Creator Boost reward not found.", 404, undefined, "ENTITLEMENT_NOT_FOUND");
    if (entitlement.type !== "creator_boost" || entitlement.status !== "available") return fail("This Creator Boost is not available.", 409, undefined, "ENTITLEMENT_UNAVAILABLE");
    if (entitlement.expiresAt && Date.parse(String(entitlement.expiresAt)) <= Date.now()) return fail("This Creator Boost has expired.", 409, undefined, "ENTITLEMENT_EXPIRED");
    return ok({ challenges: await ownedEligibleChallenges(db, user.uid) }, "Eligible challenges loaded.");
  } catch (error) {
    return serverError("Eligible challenges could not be loaded.", error instanceof Error ? error.message : error);
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Creator Boost");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const entitlementId = String(parsed.body.entitlementId ?? "").trim();
  const challengeId = String(parsed.body.challengeId ?? "").trim();
  if (!entitlementId || !challengeId) return fail("Select an eligible challenge.", 400, undefined, "BOOST_SELECTION_REQUIRED");
  const now = new Date();
  const nowIso = now.toISOString();
  const entitlementRef = db.collection("rewardEntitlements").doc(entitlementId);
  const challengeRef = db.collection("challenges").doc(challengeId);
  const redemptionRef = db.collection("rewardBoostRedemptions").doc(deterministicId("reward_creator_boost", entitlementId));
  try {
    const result = await db.runTransaction(async (transaction) => {
      const [entitlementSnap, challengeSnap, redemptionSnap] = await Promise.all([
        transaction.get(entitlementRef), transaction.get(challengeRef), transaction.get(redemptionRef),
      ]);
      if (redemptionSnap.exists) {
        const redemption = redemptionSnap.data() ?? {};
        if (redemption.userId !== user.uid) throw new CreatorBoostError("ENTITLEMENT_FORBIDDEN", "You cannot use this Creator Boost.", 403);
        return { replay: true, endsAt: String(redemption.endsAt ?? "") };
      }
      if (!entitlementSnap.exists || entitlementSnap.data()?.userId !== user.uid) throw new CreatorBoostError("ENTITLEMENT_NOT_FOUND", "Creator Boost reward not found.", 404);
      const entitlement = entitlementSnap.data() ?? {};
      if (entitlement.type !== "creator_boost" || entitlement.status !== "available") throw new CreatorBoostError("ENTITLEMENT_UNAVAILABLE", "This Creator Boost is not available.", 409);
      if (entitlement.expiresAt && Date.parse(String(entitlement.expiresAt)) <= now.getTime()) throw new CreatorBoostError("ENTITLEMENT_EXPIRED", "This Creator Boost has expired.", 409);
      if (!challengeSnap.exists) throw new CreatorBoostError("CHALLENGE_NOT_FOUND", "Challenge not found.", 404);
      const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
      const access = getChallengeBoostAccess({ challenge, userId: user.uid });
      if (!access.owner) throw new CreatorBoostError("CHALLENGE_OWNER_REQUIRED", "Select a challenge you own.", 403);
      if (!access.publiclyVisible) throw new CreatorBoostError("CHALLENGE_NOT_DISCOVERABLE", "The challenge must be approved and publicly discoverable.", 409);
      if (!access.eligibleStatus) throw new CreatorBoostError("BOOST_STATUS_INELIGIBLE", "Creator Boost can be applied only to a Scheduled or Active challenge.", 409);
      const endsAt = extendedMonthlyBoostEnd(latestBoostEnd(challenge), now);
      transaction.set(entitlementRef, { status: "consumed", consumedAt: nowIso, consumedByChallengeId: challengeId, consumedByRedemptionId: redemptionRef.id, updatedAt: nowIso }, { merge: true });
      transaction.create(redemptionRef, { id: redemptionRef.id, entitlementId, userId: user.uid, challengeId, sourceType: "reward_entitlement", durationHours: 72, startsAt: nowIso, endsAt, status: "active", createdAt: nowIso });
      transaction.set(challengeRef, { rewardBoostEndsAt: endsAt, boostEndsAt: endsAt, boostSource: "reward_entitlement", rewardBoostUpdatedAt: nowIso, updatedAt: nowIso }, { merge: true });
      const auditRef = db.collection("rewardAuditLogs").doc(deterministicId("reward_creator_boost_audit", entitlementId));
      transaction.create(auditRef, { id: auditRef.id, action: "reward_creator_boost_redeemed", userId: user.uid, challengeId, entitlementId, redemptionId: redemptionRef.id, durationHours: 72, createdAt: nowIso });
      return { replay: false, endsAt };
    });
    if (!result.replay) await createNotification(db, { userId: user.uid, type: "challenge_boosted", title: "Creator Boost active", body: "Your challenge received 3 days of additional discovery ranking weight.", targetId: challengeId }).catch(() => undefined);
    return ok({ challengeId, entitlementId, endsAt: result.endsAt, durationHours: 72, idempotentReplay: result.replay }, result.replay ? "Creator Boost was already applied." : "Creator Boost is active for 3 days.");
  } catch (error) {
    if (error instanceof CreatorBoostError) return fail(error.message, error.status, undefined, error.code);
    console.error("[reward-creator-boost] redemption failed", { userId: user.uid, challengeId, entitlementId, message: error instanceof Error ? error.message : String(error) });
    return serverError("Creator Boost could not be applied.", error instanceof Error ? error.message : error);
  }
}

class CreatorBoostError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}
