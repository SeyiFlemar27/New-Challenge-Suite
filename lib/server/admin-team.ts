import { createHash, randomBytes } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { ADMIN_ROLES, LEGACY_ADMIN_ROLE_NAMES, canDeactivateAdministrator, canManageAdministrators, isKnownAdminAssignment, normalizeAdminRoleAssignments, type AdminRole } from "@/lib/server/admin-permissions";

export function normalizeAdminRoles(value: unknown) {
  if (!Array.isArray(value)) return [] as AdminRole[];
  return normalizeAdminRoleAssignments(value.filter(isKnownAdminAssignment));
}

export function assertAdminManager(roles: readonly string[] | undefined) {
  if (!canManageAdministrators(roles)) throw new Error("Admin access is required to manage administrators.");
}

export function invitationToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: createHash("sha256").update(token).digest("hex") };
}

export async function adminRemovalGuard(db: Firestore, input: { actorId: string; targetId: string; targetRoles: readonly string[] }) {
  const assignments = ["admin", ...LEGACY_ADMIN_ROLE_NAMES];
  const snapshots = await Promise.all([...assignments.map((role) => db.collection("users").where("adminRoles", "array-contains", role).get()), db.collection("users").where("adminRole", "==", "admin").get(), db.collection("users").where("isAdmin", "==", true).get()]);
  const activeIds = new Set(snapshots.flatMap((snapshot) => snapshot.docs.filter((doc) => !["pending_invitation", "pending_security_setup", "suspended", "deactivated", "removed"].includes(String(doc.data().adminAccessStatus ?? "legacy_active"))).map((doc) => doc.id)));
  const activeAdminCount = activeIds.size;
  return canDeactivateAdministrator({ actorId: input.actorId, targetId: input.targetId, activeAdminCount });
}

export function adminTeamPublicRecord(id: string, data: Record<string, unknown>) {
  const roles = normalizeAdminRoles([...(Array.isArray(data.adminRoles) ? data.adminRoles : []), data.adminRole]);
  return {
    id,
    displayName: data.displayName ?? data.name ?? "Administrator",
    email: data.email ?? "",
    roles,
    status: data.adminAccessStatus ?? (data.isAdmin ? "active" : "pending_invitation"),
    securitySetupComplete: data.adminSecuritySetupComplete === true,
    lastActiveAt: data.lastActivityAt ?? data.updatedAt ?? null,
    createdAt: data.adminAppointedAt ?? data.createdAt ?? null,
    appointedBy: data.adminAppointedBy ?? null,
    permissionsSummary: roles.length ? "Admin · permissions enforced per action" : "No active Admin role",
    securityWarnings: data.adminSecuritySetupComplete === true ? [] : ["Security setup required"]
  };
}

export { ADMIN_ROLES };
