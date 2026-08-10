import { z } from "zod";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/server/audit";
import { requireRecentAdminAuthentication } from "@/lib/server/auth";
import { adminRemovalGuard, assertAdminManager, normalizeAdminRoles } from "@/lib/server/admin-team";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

const updateSchema = z.object({ action: z.enum(["change_roles", "suspend", "deactivate", "remove", "revoke_sessions"]), roles: z.array(z.string()).optional(), reason: z.string().trim().min(8).max(500) });

export async function PATCH(request: Request, { params }: { params: Promise<{ adminId: string }> }) {
  const { adminId } = await params; const { user, response } = await requireRecentAdminAuthentication(request, "roles.manage"); if (response) return response;
  try { assertAdminManager(user?.adminRoles); } catch (error) { return fail(error instanceof Error ? error.message : "Permission denied.", 403); }
  if (adminId === user?.uid) return fail("You cannot change your own administrator access.", 403);
  const db = getAdminDb(); const auth = getAdminAuth(); if (!db || !auth) return serverUnavailable("Admin team");
  const body = await readJson(request); if (body.response) return body.response; const parsed = updateSchema.safeParse(body.body); if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Invalid request." });
  try {
    const ref = db.collection("users").doc(adminId); const snap = await ref.get(); if (!snap.exists) return fail("Administrator was not found.", 404);
    const before = snap.data() ?? {}; const targetRoles = normalizeAdminRoles(before.adminRoles); const guard = await adminRemovalGuard(db, { actorId: user!.uid, targetId: adminId, targetRoles });
    if (["suspend", "deactivate", "remove"].includes(parsed.data.action) && !guard.allowed) return fail(guard.reason ?? "Administrator access cannot be removed.", 409);
    const now = new Date().toISOString(); const update: Record<string, unknown> = { updatedAt: now };
    if (parsed.data.action === "change_roles") { const roles = normalizeAdminRoles(parsed.data.roles); if (!roles.length) return validationError({ roles: "Select at least one valid role." }); if (roles.includes("platform_owner") && !user?.adminRoles?.includes("platform_owner")) return fail("Only the Platform Owner may assign Platform Owner access.", 403); update.adminRoles = roles; }
    else if (parsed.data.action === "revoke_sessions") await auth.revokeRefreshTokens(adminId);
    else update.adminAccessStatus = parsed.data.action;
    await ref.set(update, { merge: true }); await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: `admin.${parsed.data.action}`, targetType: "account", targetId: adminId, reason: parsed.data.reason, before, after: update }, db);
    return ok({ adminId, action: parsed.data.action }, "Administrator access updated.");
  } catch (error) { return serverError("Administrator access could not be updated.", error instanceof Error ? error.message : error); }
}
