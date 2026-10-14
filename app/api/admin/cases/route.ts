import { z } from "zod";
import { createHash } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { createAuditLogRecord, writeAuditLog } from "@/lib/server/audit";
import { appealDeadline, operationalTaskId, safetyTriage } from "@/lib/server/admin-operations";
import { requireAdminPermission } from "@/lib/server/auth";
import type { AdminPermission } from "@/lib/server/admin-permissions";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { normalizeSupportTicketStatus, isFinalSupportIssueCondition } from "@/lib/support/catalog";
import { supportIssuesConcluded } from "@/lib/server/support-tickets";
import { supportNotificationRecord } from "@/lib/server/support-tickets";
import { dispatchSupportEmailOutbox, supportEmailContent } from "@/lib/server/support-email";

const config: Record<string, { collection: string; readPermission: AdminPermission }> = { support: { collection: "supportTickets", readPermission: "tickets.view" }, disputes: { collection: "disputes", readPermission: "disputes.review" }, appeals: { collection: "appeals", readPermission: "appeals.review" }, safety: { collection: "safetyReports", readPermission: "safetyReports.review" } };
const schema = z.object({ kind: z.enum(["support", "disputes", "appeals", "safety"]), caseId: z.string().min(1), action: z.enum(["assign", "start", "wait_user", "wait_provider", "escalate", "resolve", "close", "reopen", "add_note", "view_reported_message"]), reason: z.string().trim().min(8).max(1000), confirmed: z.literal(true), assigneeId: z.string().optional(), note: z.string().trim().max(3000).optional(), resolutionSummary: z.string().trim().min(10).max(5000).optional(), customerMessage: z.string().trim().min(10).max(5000).optional(), priority: z.enum(["urgent", "high", "normal", "low"]).optional() });
function mutationPermission(kind: z.infer<typeof schema>["kind"], action: z.infer<typeof schema>["action"]): AdminPermission {
  if (kind === "support") return ["resolve", "close", "reopen"].includes(action) ? "tickets.resolve" : "tickets.assign";
  if (kind === "disputes") return "disputes.decide";
  if (kind === "appeals") return "appeals.manage";
  return action === "view_reported_message" ? "reportedMessages.view" : "safetyReports.manage";
}
export async function GET(request: Request) { const kind = new URL(request.url).searchParams.get("kind") ?? "support"; const target = config[kind]; if (!target) return fail("Unknown case workspace.", 404); const { response } = await requireAdminPermission(request, target.readPermission); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Admin cases"); try { const snap = await db.collection(target.collection).orderBy("createdAt", "desc").limit(250).get(); return ok({ kind, cases: snap.docs.map((doc) => { const data = doc.data(); return { id: doc.id, ...data, ...(kind === "support" ? { status: normalizeSupportTicketStatus(data.status) } : {}), appealDeadline: kind === "appeals" && data.decisionAt ? appealDeadline(String(data.decisionAt)) : data.appealDeadline ?? null, triage: kind === "safety" ? safetyTriage(String(data.category ?? data.type ?? "")) : null }; }) }); } catch (error) { return serverError("Admin cases could not be loaded.", error instanceof Error ? error.name : "load_failed"); } }
export async function PATCH(request: Request) {
  const body = await readJson(request); if (body.response) return body.response;
  const parsed = schema.safeParse(body.body); if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Invalid case action." });
  const target = config[parsed.data.kind]; const { user, response } = await requireAdminPermission(request, mutationPermission(parsed.data.kind, parsed.data.action)); if (response) return response;
  const db = getAdminDb(); if (!db) return serverUnavailable("Admin cases");
  try {
    const ref = db.collection(target.collection).doc(parsed.data.caseId); const now = new Date().toISOString();
    const requestKey = request.headers.get("idempotency-key")?.trim() || `${parsed.data.kind}:${parsed.data.caseId}:${parsed.data.action}:${user!.uid}:${parsed.data.reason}`;
    const auditId = createHash("sha256").update(requestKey).digest("hex"); const auditRef = db.collection("auditLogs").doc(`case_${auditId}`);
    let duplicate = false; let finalStatus = ""; const customerNoticeRef: { value: { userId: string; title: string; body: string; type: string; outboxId: string } | null } = { value: null };
    await db.runTransaction(async (transaction) => {
      const [snap, priorAudit] = await Promise.all([transaction.get(ref), transaction.get(auditRef)]);
      if (!snap.exists) throw new Error("NOT_FOUND");
      const data = snap.data() ?? {}; finalStatus = String(data.status ?? "submitted");
      if (data.type === "normal_submission_appeal" && ["resolve", "close", "reopen"].includes(parsed.data.action)) throw new Error("USE_SUBMISSION_APPEAL_DECISION");
      if (parsed.data.action === "view_reported_message" && data.reportedMessageId == null && data.validInvestigationReason !== true) throw new Error("PRIVATE_MESSAGE_NOT_AUTHORIZED");
      if (priorAudit.exists) { duplicate = true; return; }
      let nextStatus: string | undefined;
      const update: Record<string, unknown> = { updatedAt: now };
      if (parsed.data.kind === "support") {
        const currentStatus = normalizeSupportTicketStatus(data.status);
        if (parsed.data.action === "reopen") throw new Error("CLOSED_TICKETS_READ_ONLY");
        if (currentStatus === "closed" && parsed.data.action !== "view_reported_message") throw new Error("CLOSED_TICKETS_READ_ONLY");
        if (["start", "wait_user", "wait_provider"].includes(parsed.data.action) && currentStatus === "resolved") throw new Error("RESOLVED_TICKET_READ_ONLY");
        if (parsed.data.action === "start") nextStatus = "in_review";
        if (parsed.data.action === "wait_user") {
          if (!parsed.data.customerMessage) throw new Error("CUSTOMER_MESSAGE_REQUIRED");
          nextStatus = "waiting_for_you";
          const messageId = `admin_request_info_${auditId}`;
          transaction.create(ref.collection("messages").doc(messageId), { id: messageId, authorType: "admin", authorId: user!.uid, visibility: "customer", body: parsed.data.customerMessage, createdAt: now });
          const outboxId = `ticket_waiting_for_customer_${auditId}`;
          const outboxRef = db.collection("supportEmailOutbox").doc(outboxId);
          const content = supportEmailContent(String(data.ticketNumber ?? parsed.data.caseId), `Information needed for ${String(data.ticketNumber ?? "your ticket")}`, parsed.data.customerMessage);
          transaction.create(outboxRef, { id: outboxId, ticketId: parsed.data.caseId, messageId, type: "request_information", recipient: data.contactEmail ?? data.userEmail ?? null, ...content, status: "waiting_configuration", attempts: 0, createdAt: now, updatedAt: now });
          customerNoticeRef.value = { userId: String(data.userId ?? ""), title: "Support needs more information", body: "Support added a question to your request.", type: "support_information_requested", outboxId };
        }
        if (parsed.data.action === "wait_provider") { nextStatus = "in_review"; }
        if (parsed.data.action === "escalate") { update.priority = parsed.data.priority ?? "high"; }
        if (parsed.data.action === "assign") {
          if (parsed.data.assigneeId && parsed.data.assigneeId !== user!.uid) throw new Error("ONLY_CURRENT_ADMIN_ASSIGNMENT_SUPPORTED");
          update.assignedTo = user!.uid;
        }
        if (["resolve", "close"].includes(parsed.data.action)) {
          const issuesSnap = await transaction.get(ref.collection("issues"));
          const issues = issuesSnap.docs.map((issue) => issue.data() as Record<string, unknown>);
          if (!supportIssuesConcluded(issues)) throw new Error("ISSUES_UNRESOLVED");
          if (parsed.data.action === "resolve") {
            const primaryIssueId = typeof data.primaryIssueId === "string" ? data.primaryIssueId : "";
            if (!primaryIssueId || !issuesSnap.docs.some((issue) => issue.id === primaryIssueId && issue.data().primary === true)) throw new Error("PRIMARY_ISSUE_NOT_CONFIRMED");
            if (!parsed.data.resolutionSummary) throw new Error("RESOLUTION_SUMMARY_REQUIRED");
            if (currentStatus === "resolved") throw new Error("ALREADY_RESOLVED");
            nextStatus = "resolved";
            update.resolvedAt = now;
            update.reopenUntil = new Date(Date.now() + 7 * 86400000).toISOString();
            update.resolutionSummary = parsed.data.resolutionSummary;
            update.resolutionReason = parsed.data.reason;
            const messageId = `admin_resolution_${auditId}`;
            transaction.create(ref.collection("messages").doc(messageId), { id: messageId, authorType: "admin", authorId: user!.uid, visibility: "customer", body: parsed.data.resolutionSummary, createdAt: now });
            customerNoticeRef.value = { userId: String(data.userId ?? ""), title: "Support request resolved", body: "All tracked issues have a final outcome. You can reply within seven days if more help is needed.", type: "support_ticket_resolved", outboxId: `ticket_resolved_${auditId}` };
          } else {
            if (currentStatus !== "resolved" || !parsed.data.customerMessage) throw new Error("EARLY_CLOSE_REQUIRES_RESOLVED_TICKET_AND_CUSTOMER_NOTICE");
            nextStatus = "closed";
            update.closedAt = now;
            update.closeReason = parsed.data.reason;
            transaction.create(ref.collection("messages").doc(`early_close_${auditId}`), { id: `early_close_${auditId}`, authorType: "admin", authorId: user!.uid, visibility: "customer", body: parsed.data.customerMessage, createdAt: now });
            customerNoticeRef.value = { userId: String(data.userId ?? ""), title: "Support request closed", body: parsed.data.customerMessage, type: "support_ticket_closed", outboxId: `ticket_closed_${auditId}` };
          }
          if (parsed.data.action !== "wait_user") {
            const messageText = parsed.data.action === "resolve" ? parsed.data.resolutionSummary! : parsed.data.customerMessage!;
            const content = supportEmailContent(String(data.ticketNumber ?? ref.id), parsed.data.action === "resolve" ? "Support request resolved" : "Support request closed", messageText);
            const outboxRef = db.collection("supportEmailOutbox").doc(customerNoticeRef.value!.outboxId);
            transaction.create(outboxRef, { id: outboxRef.id, ticketId: ref.id, type: `ticket_${parsed.data.action}`, recipient: data.contactEmail ?? data.userEmail ?? null, ...content, status: "waiting_configuration", attempts: 0, createdAt: now, updatedAt: now });
          }
        }
      } else {
        const states: Record<string, string> = { assign: "assigned", start: "in_progress", wait_user: "waiting_for_user", wait_provider: "waiting_for_provider", escalate: "escalated", resolve: "resolved", close: "closed", reopen: "under_review" };
        nextStatus = states[parsed.data.action];
        if (parsed.data.assigneeId) update.assignedTo = parsed.data.assigneeId;
      }
      if (nextStatus) update.status = nextStatus;
      if (parsed.data.kind === "support") {
        update.version = Number(data.version ?? 0) + 1;
        update.lastActivityAt = now;
        const taskRef = db.collection("adminActionTasks").doc(operationalTaskId("support_ticket", ref.id));
        const taskState = parsed.data.action === "wait_provider" ? "waiting_for_provider" : nextStatus === "waiting_for_you" ? "waiting_for_user" : ["resolved", "closed"].includes(String(nextStatus)) ? "resolved" : "in_progress";
        transaction.set(taskRef, { state: taskState, updatedAt: now, ...(taskState === "resolved" ? { resolvedAt: now } : {}) }, { merge: true });
        const notice = customerNoticeRef.value;
        if (notice?.userId) {
          const notificationId = `support_case_${auditId}`;
          transaction.create(db.collection("notifications").doc(notificationId), supportNotificationRecord({ id: notificationId, userId: notice.userId, type: notice.type, title: notice.title, message: notice.body, ticketId: ref.id, createdAt: now }));
        }
      }
      if (parsed.data.action !== "view_reported_message") transaction.set(ref, update, { merge: true });
      if (parsed.data.action === "add_note") { const noteRef = ref.collection("staffNotes").doc(`note_${auditId}`); transaction.create(noteRef, { id: noteRef.id, body: parsed.data.note ?? parsed.data.reason, authorId: user!.uid, internalOnly: true, createdAt: now }); }
      finalStatus = String(nextStatus ?? data.status ?? "submitted");
      transaction.create(auditRef, createAuditLogRecord({ actorId: user!.uid, actorType: "admin", action: `${parsed.data.kind}.${parsed.data.action}`, targetType: parsed.data.kind, targetId: parsed.data.caseId, reason: parsed.data.reason, before: { status: data.status ?? "submitted" }, after: { status: finalStatus, outcome: "success" }, metadata: { internalOnly: parsed.data.action === "add_note", limitedMessageContext: parsed.data.action === "view_reported_message" } }, auditRef.id, now));
    });
    const customerNotice = customerNoticeRef.value;
    if (customerNotice && !duplicate) {
      const delivery = await dispatchSupportEmailOutbox(db, customerNotice.outboxId);
      if (delivery.status === "failed") await db.collection("supportEmailOutbox").doc(customerNotice.outboxId).set({ customerNotice: "in_app_delivered_email_failed" }, { merge: true });
    }
    return ok({ caseId: parsed.data.caseId, action: parsed.data.action, status: finalStatus, duplicate }, duplicate ? "This case action was already recorded." : "Case updated.");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Case not found.", 404);
    if (error instanceof Error && error.message === "PRIVATE_MESSAGE_NOT_AUTHORIZED") return fail("Private message access requires a reported message or valid investigation reason.", 403);
    if (error instanceof Error && error.message === "ISSUES_UNRESOLVED") return fail("Resolve or explain every issue before resolving or closing the ticket.", 409);
    if (error instanceof Error && error.message === "PRIMARY_ISSUE_NOT_CONFIRMED") return fail("Confirm the primary issue before resolving the ticket.", 409);
    if (error instanceof Error && error.message === "RESOLUTION_SUMMARY_REQUIRED") return validationError({ resolutionSummary: "Provide the customer-visible outcome for all concluded issues." });
    if (error instanceof Error && error.message === "CUSTOMER_MESSAGE_REQUIRED") return validationError({ customerMessage: "Provide the question Support needs the customer to answer." });
    if (error instanceof Error && error.message === "EARLY_CLOSE_REQUIRES_RESOLVED_TICKET_AND_CUSTOMER_NOTICE") return fail("Only a resolved ticket can be closed early, and the customer needs an explanation.", 409);
    if (error instanceof Error && ["CLOSED_TICKETS_READ_ONLY", "RESOLVED_TICKET_READ_ONLY", "ALREADY_RESOLVED"].includes(error.message)) return fail("This ticket cannot make that transition from its current state.", 409);
    if (error instanceof Error && error.message === "ONLY_CURRENT_ADMIN_ASSIGNMENT_SUPPORTED") return fail("This workspace supports assignment to the authorized Admin only.", 403);
    return serverError("Case could not be updated.", error instanceof Error ? error.message : error);
  }
}
