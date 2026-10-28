import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { createNotification } from "@/lib/server/notifications";
import { normalizeAdminRoleAssignments } from "@/lib/server/admin-permissions";
import { votingAccountRestricted } from "@/lib/voting-account-policy";

/** Notification delivery never grants Admin authority. Ambiguous identity is
 * held rather than treating legacy Creator isAdmin flags as platform Admins. */
export async function resolveNotificationAdmin(db: Firestore, now = new Date()) {
  const queries = [db.collection("users").where("adminRoles", "array-contains", "admin"), db.collection("users").where("adminRole", "==", "admin"), db.collection("users").where("role", "==", "admin"), db.collection("users").where("accountType", "==", "admin")];
  const rows = new Map<string, Record<string, unknown>>();
  for (const query of queries) { const snapshot = await query.limit(3).get(); if (snapshot.size === 3) return null; for (const row of snapshot.docs) rows.set(row.id, row.data()); }
  const candidates = [...rows].filter(([, profile]) => {
    const roles = normalizeAdminRoleAssignments([...(Array.isArray(profile.adminRoles) ? profile.adminRoles : []), profile.adminRole]);
    const allowlisted = String(process.env.ADMIN_EMAIL_ALLOWLIST ?? "").split(",").map(email => email.trim().toLowerCase()).includes(String(profile.email ?? "").toLowerCase());
    const authorized = roles.length > 0 || (profile.role === "admin" || profile.accountType === "admin") && (profile.isAdmin === true || allowlisted);
    const expires = profile.adminAccessExpiresAt;
    return authorized && !votingAccountRestricted(profile) && profile.adminSecuritySetupComplete !== false && !["pending_invitation", "pending_security_setup", "suspended", "deactivated", "removed", "expired"].includes(String(profile.adminAccessStatus)) && (expires == null || (typeof expires === "number" ? expires : Date.parse(String(expires))) > now.getTime());
  });
  return candidates.length === 1 ? candidates[0][0] : null;
}

/** Important operational tasks only. Read/acknowledgment never updates a case. */
export async function deliverAdminActionNotifications(db: Firestore, now = new Date()) {
  const uid = await resolveNotificationAdmin(db, now);
  if (!uid) return { status: "admin_identity_unavailable", created: 0 };
  const state = db.collection("notificationRecoveryState").doc("admin_tasks"), cursor = (await state.get()).data()?.cursor;
  const base = db.collection("adminActionTasks").orderBy(FieldPath.documentId());
  let page = await (typeof cursor === "string" ? base.startAfter(cursor) : base).limit(50).get();
  if (page.empty && cursor) page = await base.limit(50).get();
  let created = 0;
  for (const row of page.docs) {
    const task = row.data(), status = String(task.state ?? task.status ?? "");
    if (["resolved", "closed", "completed", "dismissed", "cancelled"].includes(status)) continue;
    if (task.sourceType !== "support_ticket" && !["high", "urgent"].includes(String(task.priority)) && !/dispute|financial|refund|settlement|payout|correction|safety|moderation_overdue|delivery_failure/.test(String(task.type))) continue;
    const result = await createNotification(db, { userId: uid, type: "admin_action_required", title: "An operational case needs review", body: "Review the current evidence and required action in the Action Centre. Reading this notification does not resolve the case.", priority: task.priority === "urgent" ? "high" : "normal", entityType: "adminActionTask", entityId: row.id, actionUrl: `/admin/action-centre?focus=${encodeURIComponent(row.id)}`, idempotencyKey: `admin_task_${row.id}_${String(task.reopenedAt ?? task.createdAt ?? "initial")}` });
    if (result.deliveryStatus === "created") created++;
  }
  if (!page.empty) await state.set({ cursor: page.docs.at(-1)!.id, updatedAt: now.toISOString() });
  const legacyState = db.collection("notificationRecoveryState").doc("admin_legacy_sources"), legacyCursor = (await legacyState.get()).data()?.cursor;
  const legacyBase = db.collection("notifications").where("audience", "==", "admin").orderBy(FieldPath.documentId());
  let legacy = await (typeof legacyCursor === "string" ? legacyBase.startAfter(legacyCursor) : legacyBase).limit(25).get();
  if (legacy.empty && legacyCursor) legacy = await legacyBase.limit(25).get();
  for (const row of legacy.docs) {
    const source = row.data();
    if (source.type !== "enterprise_access_application" || typeof source.targetId !== "string" || source.targetId.includes("/")) continue;
    const application = await db.collection("enterpriseInquiries").doc(source.targetId).get();
    if (!application.exists || application.data()?.applicationType !== "enterprise_access_application" || application.data()?.status !== "pending") continue;
    const notice = await createNotification(db, { userId: uid, type: "admin_action_required", title: "Enterprise application needs review", body: "An Enterprise access application awaits an authorized decision. Reading this update does not approve the application.", entityType: "enterpriseApplication", entityId: source.targetId, actionUrl: `/admin/enterprise-applications?focus=${encodeURIComponent(source.targetId)}`, idempotencyKey: `enterprise_review_${source.targetId}_${String(application.data()?.reviewAttempt ?? application.data()?.version ?? 1)}` });
    if (notice.deliveryStatus === "created") created++;
  }
  if (!legacy.empty) await legacyState.set({ cursor: legacy.docs.at(-1)!.id, updatedAt: now.toISOString() });
  return { status: "processed", created };
}
