import { getAdminDb } from "@/lib/firebase/admin";
import { isEnterpriseAccessActive, normalizeEnterpriseAccess, resolveActiveWorkspace } from "@/lib/enterprise-access";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { resolveSponsorOrganizationAccess } from "@/lib/server/sponsor-organizations";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

async function workspaceState(db: FirebaseFirestore.Firestore, userId: string) {
  const [userSnap, profileSnap, sponsorAccess] = await Promise.all([
    db.collection("users").doc(userId).get(),
    db.collection("profiles").doc(userId).get(),
    resolveSponsorOrganizationAccess(db, userId)
  ]);
  const merged = { ...(profileSnap.data() ?? {}), ...(userSnap.data() ?? {}) };
  const access = normalizeEnterpriseAccess(merged);
  const enterpriseAvailable = isEnterpriseAccessActive(access);
  const sponsorAvailable = Boolean(sponsorAccess);
  const availableWorkspaces = ["personal", ...(sponsorAvailable ? ["sponsor"] as const : []), ...(enterpriseAvailable ? ["enterprise"] as const : [])] as const;
  return {
    activeWorkspace: resolveActiveWorkspace(merged, access, sponsorAvailable),
    availableWorkspaces,
    enterpriseAvailable,
    sponsorAvailable
  };
}

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Workspace context");
  return ok(await workspaceState(db, auth.user.uid), "Workspace context loaded.");
}

export async function PATCH(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Workspace switch");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const workspace = parsed.body?.workspace;
  if (workspace !== "personal" && workspace !== "sponsor" && workspace !== "enterprise") return validationError({ workspace: "Choose an available workspace." });
  const current = await workspaceState(db, auth.user.uid);
  if (workspace === "enterprise" && !current.enterpriseAvailable) return fail("Enterprise workspace access is not available for this account.", 403, undefined, "ENTERPRISE_ACCESS_REQUIRED");
  if (workspace === "sponsor" && !current.sponsorAvailable) return fail("Sponsor workspace access is not available for this account.", 403, undefined, "SPONSOR_ACCESS_REQUIRED");
  if (current.activeWorkspace === workspace) return ok({ ...current, activeWorkspace: workspace, idempotent: true }, "Workspace is already active.");
  const now = new Date().toISOString();
  const batch = db.batch();
  const update = { activeWorkspace: workspace, lastWorkspace: workspace, workspaceContextUpdatedAt: now, updatedAt: now };
  batch.set(db.collection("users").doc(auth.user.uid), update, { merge: true });
  batch.set(db.collection("profiles").doc(auth.user.uid), update, { merge: true });
  await batch.commit();
  await writeAuditLog({ actorId: auth.user.uid, actorType: "user", action: "workspace.switched", targetType: "account", targetId: auth.user.uid, before: { activeWorkspace: current.activeWorkspace }, after: { activeWorkspace: workspace }, metadata: { grantsAuthorization: false } }, db).catch(() => undefined);
  return ok({ ...current, activeWorkspace: workspace, idempotent: false }, "Workspace switched.");
}
