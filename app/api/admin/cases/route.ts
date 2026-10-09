import { z } from "zod";
import { createHash } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { createAuditLogRecord, writeAuditLog } from "@/lib/server/audit";
import { appealDeadline, safetyTriage } from "@/lib/server/admin-operations";
import { requireAdminPermission } from "@/lib/server/auth";
import type { AdminPermission } from "@/lib/server/admin-permissions";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

const config: Record<string, { collection: string; readPermission: AdminPermission }> = { support: { collection: "supportTickets", readPermission: "tickets.view" }, disputes: { collection: "disputes", readPermission: "disputes.review" }, appeals: { collection: "appeals", readPermission: "appeals.review" }, safety: { collection: "safetyReports", readPermission: "safetyReports.review" } };
const schema = z.object({ kind: z.enum(["support", "disputes", "appeals", "safety"]), caseId: z.string().min(1), action: z.enum(["assign", "start", "wait_user", "wait_provider", "escalate", "resolve", "close", "reopen", "add_note", "view_reported_message"]), reason: z.string().trim().min(8).max(1000), assigneeId: z.string().optional(), note: z.string().trim().max(3000).optional() });
function mutationPermission(kind: z.infer<typeof schema>["kind"], action: z.infer<typeof schema>["action"]): AdminPermission {
  if (kind === "support") return ["resolve", "close", "reopen"].includes(action) ? "tickets.resolve" : "tickets.assign";
  if (kind === "disputes") return "disputes.decide";
  if (kind === "appeals") return "appeals.manage";
  return action === "view_reported_message" ? "reportedMessages.view" : "safetyReports.manage";
}
export async function GET(request: Request) { const kind = new URL(request.url).searchParams.get("kind") ?? "support"; const target = config[kind]; if (!target) return fail("Unknown case workspace.", 404); const { response } = await requireAdminPermission(request, target.readPermission); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Admin cases"); const snap = await db.collection(target.collection).orderBy("createdAt", "desc").limit(250).get(); return ok({ kind, cases: snap.docs.map((doc) => { const data = doc.data(); return { id: doc.id, ...data, appealDeadline: kind === "appeals" && data.decisionAt ? appealDeadline(String(data.decisionAt)) : data.appealDeadline ?? null, triage: kind === "safety" ? safetyTriage(String(data.category ?? data.type ?? "")) : null }; }) }); }
export async function PATCH(request: Request) {
  const body = await readJson(request); if (body.response) return body.response;
  const parsed = schema.safeParse(body.body); if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Invalid case action." });
  const target = config[parsed.data.kind]; const { user, response } = await requireAdminPermission(request, mutationPermission(parsed.data.kind, parsed.data.action)); if (response) return response;
  const db = getAdminDb(); if (!db) return serverUnavailable("Admin cases");
  try {
    const ref = db.collection(target.collection).doc(parsed.data.caseId); const now = new Date().toISOString();
    const requestKey = request.headers.get("idempotency-key")?.trim() || `${parsed.data.kind}:${parsed.data.caseId}:${parsed.data.action}:${user!.uid}:${parsed.data.reason}`;
    const auditId = createHash("sha256").update(requestKey).digest("hex"); const auditRef = db.collection("auditLogs").doc(`case_${auditId}`);
    let duplicate = false; let finalStatus = "";
    await db.runTransaction(async (transaction) => {
      const [snap, priorAudit] = await Promise.all([transaction.get(ref), transaction.get(auditRef)]);
      if (!snap.exists) throw new Error("NOT_FOUND");
      const data = snap.data() ?? {}; finalStatus = String(data.status ?? "submitted");
      if (parsed.data.action === "view_reported_message" && data.reportedMessageId == null && data.validInvestigationReason !== true) throw new Error("PRIVATE_MESSAGE_NOT_AUTHORIZED");
      if (priorAudit.exists) { duplicate = true; return; }
      const states: Record<string, string> = { assign: "assigned", start: "in_progress", wait_user: "waiting_for_user", wait_provider: "waiting_for_provider", escalate: "escalated", resolve: "resolved", close: "closed", reopen: "under_review" };
      const nextStatus = states[parsed.data.action]; const update: Record<string, unknown> = { updatedAt: now };
      if (nextStatus) update.status = nextStatus;
      if (parsed.data.assigneeId) update.assignedTo = parsed.data.assigneeId;
      if (parsed.data.kind === "support" && parsed.data.action === "resolve") { update.resolvedAt = now; update.reopenUntil = new Date(Date.now() + 7 * 86400000).toISOString(); update.resolutionReason = parsed.data.reason; }
      if (parsed.data.kind === "support" && parsed.data.action === "close") update.closedAt = now;
      if (parsed.data.kind === "support" && parsed.data.action === "reopen") { update.resolvedAt = null; update.reopenUntil = null; update.closedAt = null; }
      if (parsed.data.action !== "view_reported_message") transaction.set(ref, update, { merge: true });
      if (parsed.data.action === "add_note") { const noteRef = ref.collection("staffNotes").doc(`note_${auditId}`); transaction.create(noteRef, { id: noteRef.id, body: parsed.data.note ?? parsed.data.reason, authorId: user!.uid, internalOnly: true, createdAt: now }); }
      finalStatus = String(nextStatus ?? data.status ?? "submitted");
      transaction.create(auditRef, createAuditLogRecord({ actorId: user!.uid, actorType: "admin", action: `${parsed.data.kind}.${parsed.data.action}`, targetType: parsed.data.kind, targetId: parsed.data.caseId, reason: parsed.data.reason, before: { status: data.status ?? "submitted" }, after: { status: finalStatus, outcome: "success" }, metadata: { internalOnly: parsed.data.action === "add_note", limitedMessageContext: parsed.data.action === "view_reported_message" } }, auditRef.id, now));
    });
    return ok({ caseId: parsed.data.caseId, action: parsed.data.action, status: finalStatus, duplicate }, duplicate ? "This case action was already recorded." : "Case updated.");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Case not found.", 404);
    if (error instanceof Error && error.message === "PRIVATE_MESSAGE_NOT_AUTHORIZED") return fail("Private message access requires a reported message or valid investigation reason.", 403);
    return serverError("Case could not be updated.", error instanceof Error ? error.message : error);
  }
}
