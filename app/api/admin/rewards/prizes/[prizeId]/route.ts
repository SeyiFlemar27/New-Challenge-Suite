import { getAdminDb } from "@/lib/firebase/admin";
import type { Transaction } from "firebase-admin/firestore";
import { requireAdminPermission, requireRecentAdminAuthentication } from "@/lib/server/auth";
import { adminPrizePayload, normalizeRewardPrize } from "@/lib/server/rewards";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

const DIRECT_REFERENCE_COLLECTIONS = [
  "spinResults",
  "rewardGrants",
  "rewardEntitlements",
  "rewardFulfillments",
  "rewardFulfilments",
  "rewardClaims",
  "rewardPrizeUserWins",
  "rewardPrizeDailyWins",
  "rewardLedgerEntries",
  "cashLedger",
] as const;

async function hasHistoricalPrizeReference(db: NonNullable<ReturnType<typeof getAdminDb>>, transaction: Transaction, prizeId: string) {
  const directReferences = await Promise.all(
    DIRECT_REFERENCE_COLLECTIONS.map((collection) =>
      transaction.get(db.collection(collection).where("prizeId", "==", prizeId).limit(1)),
    ),
  );
  if (directReferences.some((snapshot) => !snapshot.empty)) return true;

  const versions = await transaction.get(db.collection("rewardWheelVersions").select("entries", "rewardSnapshots"));
  if (versions.docs.some((doc) => {
    const data = doc.data();
    const entries = data.entries;
    const snapshots = data.rewardSnapshots;
    const entryReference = Array.isArray(entries) && entries.some((entry) => {
      if (!entry || typeof entry !== "object") return false;
      return String((entry as Record<string, unknown>).prizeId ?? "") === prizeId;
    });
    const snapshotReference = Array.isArray(snapshots) && snapshots.some((snapshot) => {
      if (!snapshot || typeof snapshot !== "object") return false;
      return String((snapshot as Record<string, unknown>).id ?? "") === prizeId;
    });
    return entryReference || snapshotReference;
  })) return true;

  const auditReferences = await transaction.get(db.collection("rewardAuditLogs").where("prizeId", "==", prizeId).limit(100));
  const catalogOnlyActions = new Set([
    "admin_reward_prize_created",
    "admin_reward_prize_updated",
    "admin_reward_prize_active",
    "admin_reward_prize_paused",
    "admin_reward_prize_archived",
  ]);
  return auditReferences.docs.some((doc) => !catalogOnlyActions.has(String(doc.data().action ?? "")));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ prizeId: string }> }) {
  const { user, response } = await requireAdminPermission(request, "rewards.configure");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin rewards");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;

  const prizeId = (await params).prizeId;
  const ref = db.collection("rewardPrizes").doc(prizeId);
  const snap = await ref.get();
  if (!snap.exists) return fail("Prize not found.", 404, undefined, "PRIZE_NOT_FOUND");
  const existing = normalizeRewardPrize(snap.id, snap.data() ?? {});
  const body = parsed.body ?? {};

  try {
    if (body.action === "set_status") {
      const status = String(body.status ?? "");
      if (!["active", "paused", "archived"].includes(status)) {
        return fail("Select a valid Prize status.", 422, undefined, "PRIZE_STATUS_INVALID");
      }
      if (existing.status === "archived" && status !== "archived") {
        return fail("Archived Prize definitions cannot be reactivated. Duplicate this Prize instead.", 409, undefined, "PRIZE_ARCHIVED_IMMUTABLE");
      }
      if (status === "active") adminPrizePayload({ ...(snap.data() ?? {}), status, enabled: true }, user.uid);
      const now = new Date().toISOString();
      await ref.set({
        status,
        enabled: status === "active",
        updatedAt: now,
        ...(status === "archived" ? { archivedAt: now } : {}),
      }, { merge: true });
      await db.collection("rewardAuditLogs").add({
        action: `admin_reward_prize_${status}`,
        prizeId,
        adminId: user.uid,
        createdAt: now,
      });
    } else {
      if (existing.status === "archived") {
        return fail("Archived Prize definitions cannot be edited. Duplicate this Prize instead.", 409, undefined, "PRIZE_ARCHIVED_IMMUTABLE");
      }
      const now = new Date().toISOString();
      await ref.set(adminPrizePayload(body, user.uid), { merge: true });
      await db.collection("rewardAuditLogs").add({
        action: "admin_reward_prize_updated",
        prizeId,
        adminId: user.uid,
        createdAt: now,
      });
    }

    const updated = await ref.get();
    return ok({ prize: normalizeRewardPrize(updated.id, updated.data() ?? {}) }, "Prize updated.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REWARD_PRIZE";
    return fail("Check the Prize details and try again.", 422, undefined, code);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ prizeId: string }> }) {
  const { user, response } = await requireRecentAdminAuthentication(request, "rewards.configure");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin rewards");

  const prizeId = (await params).prizeId;
  const ref = db.collection("rewardPrizes").doc(prizeId);
  const snap = await ref.get();
  if (!snap.exists) return fail("Prize not found.", 404, undefined, "PRIZE_NOT_FOUND");
  const now = new Date().toISOString();
  const permanent = new URL(request.url).searchParams.get("permanent") === "true";

  if (!permanent) {
    await ref.set({ status: "archived", enabled: false, archivedAt: now, updatedAt: now }, { merge: true });
    await db.collection("rewardAuditLogs").add({ action: "admin_reward_prize_archived", prizeId, adminId: user.uid, createdAt: now });
    return ok({ archived: true }, "Prize archived.");
  }

  const deleteResult = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists) return "not_found" as const;
    if (await hasHistoricalPrizeReference(db, transaction, prizeId)) return "referenced" as const;
    transaction.delete(ref);
    transaction.create(db.collection("rewardAuditLogs").doc(), {
      action: "admin_reward_prize_deleted",
      prizeId,
      adminId: user.uid,
      createdAt: now,
    });
    return "deleted" as const;
  });

  if (deleteResult === "not_found") return fail("Prize not found.", 404, undefined, "PRIZE_NOT_FOUND");
  if (deleteResult === "referenced") {
    return fail("This Reward has historical activity and cannot be permanently deleted. Archive it instead.", 409, undefined, "PRIZE_DELETE_HISTORICAL_REFERENCE");
  }
  return ok({ deleted: true }, "Prize permanently deleted.");
}
