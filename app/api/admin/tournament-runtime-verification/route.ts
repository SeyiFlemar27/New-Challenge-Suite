import { getAdminDb, getAdminStorage, getFirebaseAdminConfigStatus } from "@/lib/firebase/admin";
import { requireRecentAdminAuthentication } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { cleanupTournamentVerification, createTournamentVerification, dispatchTournamentVerification, readTournamentVerification, scheduleTournamentVerificationRecovery } from "@/lib/server/tournament-runtime-verification";
import { writeAuditLog } from "@/lib/server/audit";
import { createGoogleCloudTasksScheduler, verifyTournamentCloudTaskRequest } from "@/lib/server/tournament-cloud-tasks";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  // The existing worker identity may operate only this isolated diagnostic;
  // it receives no Admin permissions or access to any competition endpoint.
  const workerIdentity = await verifyTournamentCloudTaskRequest(request);
  const { user, response } = workerIdentity
    ? { user: { uid: String(process.env.TOURNAMENT_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT) }, response: null }
    : await requireRecentAdminAuthentication(request, "challenges.review");
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body as Record<string, unknown> | null;
  if (!body || typeof body.reason !== "string" || body.reason.trim().length < 10 || body.reason.length > 500) return fail("Provide a reason for this synthetic verification operation.", 400);
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament runtime verification");
  try {
    if (!["access", "create", "status", "dispatch", "recovery", "cleanup"].includes(String(body.action))) return fail("Unknown verification operation.", 400);
    if (body.action === "access") {
      const config = getFirebaseAdminConfigStatus();
      const required = ["storage.objects.get", "storage.objects.create", "storage.objects.update", "storage.objects.delete"];
      const storage = getAdminStorage();
      const permissions = storage ? (await storage.bucket().iam.testPermissions(required))[0] : {};
      return ok({ dispatchPermission: await createGoogleCloudTasksScheduler()?.verifyDispatchAccess?.() === true, productionStorageTargetMatches: config.projectId === "challenge-suite" && config.storageBucket === "challenge-suite.firebasestorage.app", storagePermissionsVerified: required.every(name => permissions[name as keyof typeof permissions] === true) }, "Runtime permissions inspected; no object or readiness was written.");
    }
    await writeAuditLog({ actorId: user!.uid, actorType: workerIdentity ? "system" : "admin", action: "tournament.runtime_verification_requested", targetType: "system", targetId: "isolated_tournament_runtime_verification", reason: body.reason, metadata: { operation: String(body.action), syntheticOnly: true } }, db);
    if (body.action === "create") return ok(await createTournamentVerification(db, user!.uid, body.reason, body.retryOnce === true), "Synthetic verification created.");
    const id = typeof body.id === "string" ? body.id : "";
    const record = await readTournamentVerification(db, id);
    if (!record || record.actorId !== user!.uid) return fail("Synthetic verification was not found.", 404);
    if (body.action === "status") return ok({ record }, "Synthetic verification loaded.");
    if (body.action === "dispatch") return ok(await dispatchTournamentVerification(db, id), "Synthetic verification dispatched.");
    if (body.action === "recovery") return ok(await scheduleTournamentVerificationRecovery(db, id), "Isolated recovery delivery scheduled.");
    if (body.action === "cleanup") return ok(await cleanupTournamentVerification(db, id), "Synthetic verification cleaned up.");
    return fail("Unknown verification operation.", 400);
  } catch { return fail("Synthetic verification could not be completed. Check its status before retrying.", 503, undefined, "VERIFICATION_FAILED"); }
}
