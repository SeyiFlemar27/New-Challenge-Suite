import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
import { deterministicId } from "@/lib/server/idempotency";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = ["claim_under_review", "approved", "shipped", "fulfilled", "claim_rejected", "cancelled"];
const INVENTORY_RELEASE_STATUSES = new Set(["shipped", "fulfilled", "cancelled"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const { user, response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin reward claims");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const claimId = (await params).claimId;
  const status = String(parsed.body?.status ?? "claim_under_review");
  if (!ALLOWED_STATUSES.includes(status)) return fail("Select a valid fulfillment status.", 422, undefined, "INVALID_CLAIM_STATUS");
  const now = new Date().toISOString();
  const claimRef = db.collection("rewardClaims").doc(claimId);
  const result = await db.runTransaction(async (transaction) => {
    const claimSnap = await transaction.get(claimRef);
    if (!claimSnap.exists) throw new Error("CLAIM_NOT_FOUND");
    const claim = claimSnap.data() ?? {};
    const fulfillmentId = String(claim.fulfillmentId ?? claimId);
    const previousStatus = String(claim.fulfillmentStatus ?? claim.claimStatus ?? claim.status ?? "delivery_details_required");
    const inventoryReleased = claim.inventoryReservationReleased === true;
    const payload = { status, claimStatus: status, fulfillmentStatus: status, adminReason: parsed.body?.reason ? String(parsed.body.reason).slice(0, 500) : null, updatedByAdminId: user.uid, updatedAt: now };
    transaction.set(claimRef, payload, { merge: true });
    transaction.set(db.collection("rewardFulfilments").doc(fulfillmentId), payload, { merge: true });
    transaction.set(db.collection("rewardFulfillments").doc(fulfillmentId), payload, { merge: true });
    transaction.set(db.collection("spinResults").doc(String(claim.spinId ?? claimId)), { rewardStatus: status, fulfillmentStatus: status, updatedAt: now }, { merge: true });
    if (claim.prizeType === "physical_item" && !inventoryReleased && INVENTORY_RELEASE_STATUSES.has(status)) {
      transaction.set(claimRef, { inventoryReservationReleased: true, inventoryReservationReleasedAt: now }, { merge: true });
      const prizeRef = db.collection("rewardPrizes").doc(String(claim.prizeId ?? ""));
      transaction.set(prizeRef, { reservedQuantity: FieldValue.increment(-1), ...(status === "cancelled" ? { remainingQuantity: FieldValue.increment(1) } : {}), updatedAt: now }, { merge: true });
    }
    const auditId = deterministicId("reward_claim_status", claimId, status);
    transaction.set(db.collection("rewardAuditLogs").doc(auditId), { id: auditId, action: "admin_reward_claim_updated", claimId, fulfillmentId, adminId: user.uid, previousStatus, status, createdAt: now }, { merge: false });
    return { id: claimId, ...claim, ...payload, fulfillmentId };
  }).catch((error) => {
    if (error instanceof Error && error.message === "CLAIM_NOT_FOUND") return null;
    throw error;
  });
  if (!result) return fail("Claim not found.", 404, undefined, "CLAIM_NOT_FOUND");
  return ok({ claim: result }, "Reward claim updated.");
}
