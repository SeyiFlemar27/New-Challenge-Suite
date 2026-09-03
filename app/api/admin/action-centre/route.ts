import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/server/audit";
import { effectiveTaskState, operationalTaskId, taskDeadline } from "@/lib/server/admin-operations";
import { requireAdminPermission } from "@/lib/server/auth";
import { hasAdminPermission, type AdminPermission } from "@/lib/server/admin-permissions";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

const updateSchema = z.object({ taskId: z.string().min(1), action: z.enum(["assign_to_me", "assign", "reassign", "unassign", "start", "wait_user", "wait_provider", "escalate", "resolve", "dismiss", "add_note"]), assigneeId: z.string().optional(), reason: z.string().trim().max(1000).optional(), note: z.string().trim().max(2000).optional() });
const sources: ReadonlyArray<readonly [string, string, readonly string[], AdminPermission]> = [
  ["sponsor_application", "sponsorProfiles", ["submitted", "pending_review"], "sponsors.view"],
  ["challenge_review", "challenges", ["pending_review", "flagged"], "challenges.view"],
  ["submission_review", "submissions", ["pending_review", "flagged"], "submissions.view"],
  ["winner_confirmation", "winners", ["pending_admin_review"], "winners.view"],
  ["withdrawal_review", "withdrawalRequests", ["pending_review", "needs_kyc"], "withdrawals.review"],
  ["refund_review", "refundCases", ["pending_review", "approved"], "refunds.request"],
  ["chargeback", "chargebackCases", ["submitted", "needs_response"], "chargebacks.review"],
  ["dispute", "disputes", ["submitted", "under_review"], "disputes.review"],
  ["appeal", "appeals", ["submitted", "under_review"], "appeals.review"],
  ["critical_safety_report", "safetyReports", ["submitted", "triaged"], "safetyReports.review"],
  ["support_ticket", "supportTickets", ["submitted", "acknowledged", "assigned", "in_progress"], "tickets.view"],
  ["failed_lifecycle_transition", "backgroundJobs", ["failed", "needs_attention"], "jobs.view"]
];

const actionPermissions: Record<z.infer<typeof updateSchema>["action"], AdminPermission> = {
  assign_to_me: "admin.actionCentre.assign", assign: "admin.actionCentre.assign", reassign: "admin.actionCentre.assign", unassign: "admin.actionCentre.assign",
  start: "admin.actionCentre.manage", wait_user: "admin.actionCentre.manage", wait_provider: "admin.actionCentre.manage", add_note: "admin.actionCentre.manage",
  escalate: "admin.actionCentre.escalate", resolve: "admin.actionCentre.resolve", dismiss: "admin.actionCentre.resolve"
};

export async function GET(request: Request) {
  const { user, response } = await requireAdminPermission(request, "admin.actionCentre.view"); if (response) return response;
  const db = getAdminDb(); if (!db) return serverUnavailable("Action Centre");
  try {
    const visibleSources = sources.filter(([, , , permission]) => hasAdminPermission(user?.adminPermissions, permission));
    const snapshots = await Promise.all(visibleSources.map(([, collection]) => db.collection(collection).limit(150).get()));
    const batch = db.batch(); let writes = 0;
    snapshots.forEach((snapshot, index) => snapshot.docs.forEach((doc) => {
      const [sourceType, collection, statuses] = visibleSources[index]; const data = doc.data(); const status = String(data.status ?? data.adminReviewStatus ?? data.sponsorVerificationStatus ?? "");
      if (!statuses.includes(status as never)) return;
      const id = operationalTaskId(sourceType, doc.id); const ref = db.collection("adminActionTasks").doc(id);
      const refreshedAt = new Date().toISOString();
      batch.set(ref, { id, sourceType, sourceCollection: collection, sourceId: doc.id, sourceStatus: status, title: data.title ?? data.subject ?? data.brandName ?? sourceType.replaceAll("_", " "), reason: `Source record is ${status.replaceAll("_", " ")}.`, priority: sourceType.includes("critical") || sourceType.includes("failed") || sourceType === "chargeback" ? "critical" : "normal", slaDueAt: taskDeadline(sourceType, data.createdAt), createdAt: data.createdAt ?? refreshedAt, lastSourceRefreshAt: refreshedAt }, { merge: true }); writes += 1;
    }));
    if (writes) await batch.commit();
    const tasks = await db.collection("adminActionTasks").orderBy("updatedAt", "desc").limit(300).get();
    return ok({ tasks: tasks.docs.map((doc) => { const data = doc.data(); return { id: doc.id, ...data, state: effectiveTaskState(data), isMine: data.assignedTo === user?.uid }; }) });
  } catch (error) { return serverError("Action Centre could not be loaded.", error instanceof Error ? error.message : error); }
}

export async function PATCH(request: Request) {
  const body = await readJson(request); if (body.response) return body.response;
  const parsed = updateSchema.safeParse(body.body); if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Invalid task update." });
  const { user, response } = await requireAdminPermission(request, actionPermissions[parsed.data.action]); if (response) return response;
  const db = getAdminDb(); if (!db) return serverUnavailable("Action Centre");
  const { taskId, action, assigneeId, reason, note } = parsed.data;
  if (["escalate", "resolve", "dismiss", "reassign"].includes(action) && !reason) return validationError({ reason: "A reason is required for this action." });
  if (action === "add_note" && !note) return validationError({ note: "Enter an internal staff note." });
  try {
    const ref = db.collection("adminActionTasks").doc(taskId); const snap = await ref.get(); if (!snap.exists) return fail("Task not found.", 404);
    const now = new Date().toISOString(); const update: Record<string, unknown> = { updatedAt: now };
    if (action === "assign_to_me") { update.assignedTo = user!.uid; update.state = "assigned"; }
    if (["assign", "reassign"].includes(action)) { if (!assigneeId) return validationError({ assigneeId: "Select an administrator." }); update.assignedTo = assigneeId; update.state = "assigned"; }
    if (action === "unassign") { update.assignedTo = null; update.state = "unassigned"; }
    if (action === "start") update.state = "in_progress";
    if (action === "wait_user") update.state = "waiting_for_user";
    if (action === "wait_provider") update.state = "waiting_for_provider";
    if (action === "escalate") { update.state = "escalated"; update.escalatedAt = now; update.escalationReason = reason; }
    if (action === "resolve") { update.state = "resolved"; update.resolvedAt = now; update.resolutionReason = reason; }
    if (action === "dismiss") { update.state = "dismissed"; update.dismissedAt = now; update.dismissalReason = reason; }
    await ref.set(update, { merge: true });
    if (action === "add_note") { const noteRef = ref.collection("staffNotes").doc(); await noteRef.set({ id: noteRef.id, taskId, body: note, authorId: user!.uid, internalOnly: true, createdAt: now }); }
    await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: `action_task.${action}`, targetType: "adminActionTask", targetId: taskId, reason: reason ?? (action === "add_note" ? "Internal staff note added." : null), metadata: { assigneeId, internalOnly: action === "add_note" } }, db);
    return ok({ taskId, action }, "Action Centre task updated.");
  } catch (error) { return serverError("Task could not be updated.", error instanceof Error ? error.message : error); }
}
