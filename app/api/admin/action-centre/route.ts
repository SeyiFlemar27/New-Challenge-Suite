import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/server/audit";
import { effectiveTaskState, operationalTaskId, taskDeadline } from "@/lib/server/admin-operations";
import { requireAdminPermission } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

const updateSchema = z.object({ taskId: z.string().min(1), action: z.enum(["assign_to_me", "assign", "reassign", "unassign", "start", "wait_user", "wait_provider", "escalate", "resolve", "dismiss", "add_note"]), assigneeId: z.string().optional(), reason: z.string().trim().max(1000).optional(), note: z.string().trim().max(2000).optional() });
const sources = [
  ["sponsor_application", "sponsorProfiles", ["submitted", "pending_review"]], ["challenge_review", "challenges", ["pending_review", "flagged"]],
  ["submission_review", "submissions", ["pending_review", "flagged"]], ["winner_confirmation", "winners", ["pending_admin_review"]],
  ["withdrawal_review", "withdrawalRequests", ["pending_review", "needs_kyc"]], ["refund_review", "refundCases", ["pending_review", "approved"]],
  ["chargeback", "chargebackCases", ["submitted", "needs_response"]], ["dispute", "disputes", ["submitted", "under_review"]],
  ["appeal", "appeals", ["submitted", "under_review"]], ["critical_safety_report", "safetyReports", ["submitted", "triaged"]],
  ["support_ticket", "supportTickets", ["submitted", "acknowledged", "assigned", "in_progress"]], ["failed_lifecycle_transition", "backgroundJobs", ["failed", "needs_attention"]]
] as const;

export async function GET(request: Request) {
  const { user, response } = await requireAdminPermission(request, "admin.actionCentre.view"); if (response) return response;
  const db = getAdminDb(); if (!db) return serverUnavailable("Action Centre");
  try {
    const snapshots = await Promise.all(sources.map(([, collection]) => db.collection(collection).limit(150).get()));
    const batch = db.batch(); let writes = 0;
    snapshots.forEach((snapshot, index) => snapshot.docs.forEach((doc) => {
      const [sourceType, collection, statuses] = sources[index]; const data = doc.data(); const status = String(data.status ?? data.adminReviewStatus ?? data.sponsorVerificationStatus ?? "");
      if (!statuses.includes(status as never)) return;
      const id = operationalTaskId(sourceType, doc.id); const ref = db.collection("adminActionTasks").doc(id);
      batch.set(ref, { id, sourceType, sourceCollection: collection, sourceId: doc.id, title: data.title ?? data.subject ?? data.brandName ?? sourceType.replaceAll("_", " "), reason: `Source record is ${status.replaceAll("_", " ")}.`, state: "unassigned", priority: sourceType.includes("critical") || sourceType.includes("failed") || sourceType === "chargeback" ? "critical" : "normal", slaDueAt: taskDeadline(sourceType, data.createdAt), createdAt: data.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true }); writes += 1;
    }));
    if (writes) await batch.commit();
    const tasks = await db.collection("adminActionTasks").orderBy("updatedAt", "desc").limit(300).get();
    return ok({ tasks: tasks.docs.map((doc) => { const data = doc.data(); return { id: doc.id, ...data, state: effectiveTaskState(data), isMine: data.assignedTo === user?.uid }; }) });
  } catch (error) { return serverError("Action Centre could not be loaded.", error instanceof Error ? error.message : error); }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireAdminPermission(request, "admin.actionCentre.view"); if (response) return response;
  const db = getAdminDb(); if (!db) return serverUnavailable("Action Centre"); const body = await readJson(request); if (body.response) return body.response;
  const parsed = updateSchema.safeParse(body.body); if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Invalid task update." });
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
