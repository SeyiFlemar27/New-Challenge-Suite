import { createHash, randomBytes } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { ADMIN_ROLES, canDeactivateAdministrator, canManageAdministrators, isAdminRole, type AdminRole } from "@/lib/server/admin-permissions";

export const SENSITIVE_ADMIN_ROLES: AdminRole[] = ["platform_owner", "super_admin", "finance_admin", "technical_admin"];

export function normalizeAdminRoles(value: unknown) {
  if (!Array.isArray(value)) return [] as AdminRole[];
  return [...new Set(value.filter(isAdminRole))];
}

export function assertAdminManager(roles: readonly string[] | undefined) {
  if (!canManageAdministrators(roles)) throw new Error("Only a Platform Owner or Super Admin may manage administrators.");
}

export function invitationToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: createHash("sha256").update(token).digest("hex") };
}

export async function adminRemovalGuard(db: Firestore, input: { actorId: string; targetId: string; targetRoles: readonly string[] }) {
  const active = await db.collection("users").where("adminAccessStatus", "==", "active").get();
  const activeSuperAdminCount = active.docs.filter((doc) => normalizeAdminRoles(doc.data().adminRoles).includes("super_admin")).length;
  return canDeactivateAdministrator({ ...input, activeSuperAdminCount });
}

export function adminTeamPublicRecord(id: string, data: Record<string, unknown>) {
  const roles = normalizeAdminRoles(data.adminRoles);
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
    permissionsSummary: roles.join(", "),
    securityWarnings: data.adminSecuritySetupComplete === true ? [] : ["Security setup required"]
  };
}

export { ADMIN_ROLES };
