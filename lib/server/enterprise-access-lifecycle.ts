import type { Firestore } from "firebase-admin/firestore";
import { createNotification } from "@/lib/server/notifications";

const HOUR = 60 * 60 * 1000;

function expiration(value: unknown) {
  if (typeof value === "string") return Date.parse(value);
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().getTime();
  return Number.NaN;
}

export async function processEnterpriseAccessLifecycle(db: Firestore, now = new Date()) {
  const snapshot = await db.collection("users").where("enterpriseAccessStatus", "==", "approved").limit(500).get();
  const outcomes: Array<{ userId: string; action: "warning_48h" | "warning_24h" | "expired" }> = [];
  for (const document of snapshot.docs) {
    const data = document.data();
    const staffAccess = data.staffAccess && typeof data.staffAccess === "object" ? data.staffAccess as Record<string, unknown> : {};
    const expiresAtValue = staffAccess.expiresAt ?? data.enterpriseAccessExpiresAt;
    if (expiresAtValue === null || expiresAtValue === undefined || expiresAtValue === "") continue;
    const expiresAt = expiration(expiresAtValue);
    if (!Number.isFinite(expiresAt)) continue;
    const remaining = expiresAt - now.getTime();
    const expiresAtIso = new Date(expiresAt).toISOString();
    if (remaining <= 0) {
      if (String(staffAccess.status ?? data.enterpriseStaffStatus ?? "active") !== "expired") {
        const update = { enterpriseStaffStatus: "expired", staffAccess: { ...staffAccess, status: "expired", expiresAt: expiresAtIso }, activeWorkspace: "personal", lastWorkspace: "personal", enterpriseAccessExpiredAt: now.toISOString(), updatedAt: now.toISOString() };
        const batch = db.batch();
        batch.set(db.collection("users").doc(document.id), update, { merge: true });
        batch.set(db.collection("profiles").doc(document.id), update, { merge: true });
        await batch.commit();
      }
      await createNotification(db, { userId: document.id, type: "enterprise_access_expired", title: "Enterprise access expired", body: "Full Enterprise access has ended. Your Personal Workspace remains available, and active obligations remain protected.", actionUrl: "/enterprise", entityType: "enterprise_membership", entityId: String(data.enterpriseMembershipId ?? document.id), idempotencyKey: `enterprise_expired_${document.id}_${expiresAtIso}` });
      outcomes.push({ userId: document.id, action: "expired" });
      continue;
    }
    if (remaining <= 48 * HOUR) {
      await createNotification(db, { userId: document.id, type: "enterprise_access_expiry_48h", title: "Enterprise access expiration approaching", body: `Enterprise access expires at ${expiresAtIso}. Review active responsibilities before access changes.`, actionUrl: "/enterprise", entityType: "enterprise_membership", entityId: String(data.enterpriseMembershipId ?? document.id), idempotencyKey: `enterprise_expiry_48h_${document.id}_${expiresAtIso}` });
      outcomes.push({ userId: document.id, action: "warning_48h" });
    }
    if (remaining <= 24 * HOUR) {
      await createNotification(db, { userId: document.id, type: "enterprise_access_expiry_24h", title: "Enterprise access expires soon", body: `Enterprise access expires at ${expiresAtIso}. Your Personal Workspace will remain available and active obligations will be protected.`, actionUrl: "/enterprise", entityType: "enterprise_membership", entityId: String(data.enterpriseMembershipId ?? document.id), idempotencyKey: `enterprise_expiry_24h_${document.id}_${expiresAtIso}` });
      outcomes.push({ userId: document.id, action: "warning_24h" });
    }
  }
  return outcomes;
}
