import { z } from "zod";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/server/audit";
import { requireAdminPermission, requireRecentAdminAuthentication } from "@/lib/server/auth";
import { adminTeamPublicRecord, assertAdminManager, invitationToken, normalizeAdminRoles } from "@/lib/server/admin-team";
import { conflict, fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";
const createSchema = z.object({ method: z.enum(["email", "uid", "existing_user"]), email: z.string().trim().email().optional(), uid: z.string().trim().min(8).max(128).optional(), roles: z.array(z.string()).min(1).max(4), reason: z.string().trim().min(8).max(500) });

export async function GET(request: Request) {
  const { response } = await requireAdminPermission(request, "roles.manage");
  if (response) return response;
  const db = getAdminDb(); if (!db) return serverUnavailable("Admin team");
  const [users, invites] = await Promise.all([db.collection("users").where("adminRoles", "!=", null).limit(200).get(), db.collection("adminInvitations").where("status", "in", ["pending_invitation", "pending_security_setup"]).limit(100).get()]);
  return ok({ administrators: users.docs.map((doc) => adminTeamPublicRecord(doc.id, doc.data())), invitations: invites.docs.map((doc) => adminTeamPublicRecord(doc.id, doc.data())) });
}

export async function POST(request: Request) {
  const { user, response } = await requireRecentAdminAuthentication(request, "roles.manage"); if (response) return response;
  try { assertAdminManager(user?.adminRoles); } catch (error) { return fail(error instanceof Error ? error.message : "Permission denied.", 403); }
  const db = getAdminDb(); const auth = getAdminAuth(); if (!db || !auth) return serverUnavailable("Admin team");
  const body = await readJson(request); if (body.response) return body.response;
  const parsed = createSchema.safeParse(body.body); if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Invalid request." });
  const roles = normalizeAdminRoles(parsed.data.roles); if (!roles.length) return validationError({ roles: "Select at least one valid administrator role." });
  if (roles.includes("platform_owner") && !user?.adminRoles?.includes("platform_owner")) return fail("Only the Platform Owner may appoint another Platform Owner.", 403);
  try {
    let uid = parsed.data.uid ?? ""; let email = parsed.data.email?.toLowerCase() ?? "";
    if (parsed.data.method === "email") { if (!email) return validationError({ email: "Email is required." }); try { uid = (await auth.getUserByEmail(email)).uid; } catch { /* Keep invitation email-linked. */ } }
    else { if (!uid) return validationError({ uid: "Firebase UID is required." }); const existing = await auth.getUser(uid); email = existing.email?.toLowerCase() ?? email; }
    if (uid === user?.uid) return fail("You cannot appoint or elevate your own administrator account.", 403);
    const now = new Date().toISOString();
    if (uid) {
      const ref = db.collection("users").doc(uid); const existing = await ref.get();
      if (existing.data()?.adminAccessStatus === "active") return conflict("This Firebase identity already has active administrator access.");
      await ref.set({ adminRoles: roles, adminAccessStatus: "pending_security_setup", adminSecuritySetupComplete: false, adminAppointedAt: now, adminAppointedBy: user!.uid, adminAppointmentReason: parsed.data.reason, updatedAt: now }, { merge: true });
      await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: "admin.appointed_pending_security", targetType: "account", targetId: uid, reason: parsed.data.reason, after: { roles, status: "pending_security_setup" } }, db);
      return ok({ uid, status: "pending_security_setup" }, "Administrator appointed. Security setup is required before access is activated.");
    }
    const duplicate = await db.collection("adminInvitations").where("email", "==", email).where("status", "in", ["pending_invitation", "pending_security_setup"]).limit(1).get();
    if (!duplicate.empty) return conflict("A pending administrator invitation already exists for this email.");
    const ref = db.collection("adminInvitations").doc(); const token = invitationToken();
    await ref.set({ id: ref.id, email, roles, status: "pending_invitation", tokenHash: token.tokenHash, adminSecuritySetupComplete: false, appointedBy: user!.uid, reason: parsed.data.reason, createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() });
    await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: "admin.invitation_created", targetType: "account", targetId: ref.id, reason: parsed.data.reason, after: { email, roles, status: "pending_invitation" } }, db);
    return ok({ invitationId: ref.id, status: "pending_invitation", delivery: "email_delivery_configuration_required" }, "Invitation recorded. Email delivery must be configured before it can be sent.");
  } catch (error) { return serverError("Administrator appointment failed.", error instanceof Error ? error.message : error); }
}
