import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { createAuditLogRecord } from "@/lib/server/audit";
import { operationalTaskId } from "@/lib/server/admin-operations";
import { isFinalSupportIssueCondition, normalizeSupportTicketStatus } from "@/lib/support/catalog";

export const SUPPORT_REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const SUPPORT_RESOLUTION_MIN_LENGTH = 10;
export const SUPPORT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const SUPPORT_ATTACHMENT_MAX_COUNT = 3;
export const SUPPORT_ATTACHMENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export function supportAttachmentUploadsEnabled() {
  return process.env.SUPPORT_ATTACHMENT_UPLOADS_ENABLED === "true";
}

export function supportTicketNumber(value: unknown) {
  return typeof value === "string" && /^CS-\d{5,}$/.test(value) ? value : null;
}

export function supportTicketReplyAddress(ticketNumber: string, configuredAddress = process.env.SUPPORT_INBOUND_EMAIL ?? "") {
  const match = configuredAddress.trim().match(/^([^@+]+)(?:\+[^@]*)?@([^@]+)$/);
  return match ? `${match[1]}+${ticketNumber}@${match[2]}` : null;
}

export function supportInboundTicketNumber(recipients: unknown) {
  const values = Array.isArray(recipients) ? recipients : typeof recipients === "string" ? [recipients] : [];
  for (const recipient of values) {
    const address = String(recipient).trim().toLowerCase();
    const match = address.match(/^[^+@]+\+(cs-\d{5,})@[^@]+$/);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

export function supportInboundMessageId(value: string) {
  return `inbound_${createHash("sha256").update(value).digest("hex")}`;
}

export function supportNotificationRecord(input: { id: string; userId: string; type: string; title: string; message: string; ticketId: string; createdAt: string }) {
  const actionUrl = `/support/tickets/${encodeURIComponent(input.ticketId)}`;
  return { id: input.id, userId: input.userId, accountType: null, type: input.type, title: input.title, message: input.message, body: input.message, status: "unread", priority: "normal", entityType: "supportTicket", entityId: input.ticketId, targetId: input.ticketId, actionUrl, read: false, readAt: null, archivedAt: null, delivery: { inApp: true, email: false, push: false }, metadata: {}, createdAt: input.createdAt, updatedAt: input.createdAt };
}

export function mayReopenSupportTicket(ticket: Record<string, unknown>, now = Date.now()) {
  const status = normalizeSupportTicketStatus(ticket.status);
  if (status !== "resolved") return status !== "closed";
  const deadline = Date.parse(String(ticket.reopenUntil ?? ""));
  return Number.isFinite(deadline) && now < deadline;
}

export function supportClosureDeadline(resolvedAt: string) {
  return new Date(Date.parse(resolvedAt) + SUPPORT_REOPEN_WINDOW_MS).toISOString();
}

export function supportAttachmentPathAllowed(userId: string, path: string) {
  return path.startsWith(`users/${userId}/support/`) && !/^https?:/i.test(path) && !path.includes("..") && !path.includes("\\");
}

export function supportAttachmentBytesMatchType(bytes: Uint8Array, contentType: string) {
  if (contentType === "application/pdf") return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (contentType === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (contentType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

export function supportIssuesConcluded(issues: Array<Record<string, unknown>>) {
  return issues.length > 0 && issues.every((issue) => isFinalSupportIssueCondition(issue.condition ?? issue.outcome));
}

export async function closeExpiredSupportTickets(db: Firestore, now = new Date()) {
  const nowIso = now.toISOString();
  const due = await db.collection("supportTickets").where("status", "==", "resolved").where("reopenUntil", "<=", nowIso).orderBy("reopenUntil", "asc").limit(500).get();
  let closed = 0;
  const closedOutboxIds: string[] = [];
  for (const candidate of due.docs) {
    const changed = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(candidate.ref);
      if (!current.exists || current.data()?.status !== "resolved" || Date.parse(String(current.data()?.reopenUntil ?? "")) > now.getTime()) return null;
      const ticket = current.data() ?? {};
      const issueQuery = await transaction.get(candidate.ref.collection("issues"));
      const issues = issueQuery.docs.map((doc) => doc.data() as Record<string, unknown>);
      const legacyResolvedTicket = ticket.issueLifecycleVersion == null && typeof ticket.resolutionSummary === "string" && ticket.resolutionSummary.trim().length >= SUPPORT_RESOLUTION_MIN_LENGTH;
      if (!supportIssuesConcluded(issues) && !legacyResolvedTicket) return null;
      const auditId = `support_auto_close_${createHash("sha256").update(`${candidate.id}:${ticket.reopenUntil}`).digest("hex")}`;
      const auditRef = db.collection("auditLogs").doc(auditId);
      const taskRef = db.collection("adminActionTasks").doc(operationalTaskId("support_ticket", candidate.id));
      const messageRef = candidate.ref.collection("messages").doc(auditId);
      const outboxRef = db.collection("supportEmailOutbox").doc(`ticket_auto_closed_${auditId}`);
      const notificationId = `support_auto_closed_${createHash("sha256").update(candidate.id).digest("hex")}`;
      const notificationRef = db.collection("notifications").doc(notificationId);
      const [audit, task] = await Promise.all([transaction.get(auditRef), transaction.get(taskRef)]);
      if (audit.exists) return null;
      transaction.set(candidate.ref, { status: "closed", closedAt: nowIso, closeReason: "reopen_window_expired", updatedAt: nowIso, version: Number(ticket.version ?? 0) + 1 }, { merge: true });
      if (task.exists) transaction.set(taskRef, { state: "resolved", resolvedAt: nowIso, resolutionReason: "reopen_window_expired", updatedAt: nowIso }, { merge: true });
      const ticketNumber = String(ticket.ticketNumber ?? candidate.id);
      const customerMessage = "This support request was automatically closed because the seven-day response window expired. You can create a new request if you still need help.";
      transaction.create(messageRef, { id: auditId, authorType: "system", visibility: "customer", body: customerMessage, createdAt: nowIso });
      const content = {
        subject: `Support request ${ticketNumber} closed`,
        text: `${customerMessage}\n\nSupport reference: ${ticketNumber}`,
        html: `<p>${customerMessage}</p><p>Support reference: <strong>${ticketNumber}</strong></p>`,
        replyTo: null
      };
      transaction.create(outboxRef, { id: outboxRef.id, ticketId: candidate.id, messageId: auditId, type: "ticket_auto_closed", recipient: ticket.contactEmail ?? ticket.userEmail ?? null, ...content, status: ticket.contactEmail || ticket.userEmail ? "waiting_configuration" : "blocked", lastError: ticket.contactEmail || ticket.userEmail ? null : "recipient_email_unavailable", attempts: 0, createdAt: nowIso, updatedAt: nowIso });
      if (typeof ticket.userId === "string" && ticket.userId) transaction.create(notificationRef, { id: notificationId, userId: ticket.userId, accountType: ticket.accountType ?? null, type: "support_ticket_closed", title: "Support request closed", message: `Ticket ${ticketNumber} was closed after its seven-day response window expired.`, body: `Ticket ${ticketNumber} was closed after its seven-day response window expired.`, status: "unread", priority: "normal", entityType: "supportTicket", entityId: candidate.id, targetId: candidate.id, actionUrl: `/support/tickets/${encodeURIComponent(candidate.id)}`, read: false, readAt: null, archivedAt: null, delivery: { inApp: true, email: false, push: false }, metadata: {}, createdAt: nowIso, updatedAt: nowIso });
      transaction.create(auditRef, createAuditLogRecord({ actorId: "system:support-ticket-closure", actorType: "system", action: "support.ticket_auto_closed", targetType: "supportTicket", targetId: candidate.id, reason: "The seven-day user response window expired.", before: { status: "resolved" }, after: { status: "closed", outcome: "success" }, metadata: { legacyResolvedTicket } }, auditId, nowIso));
      return outboxRef.id;
    });
    if (changed) { closed += 1; closedOutboxIds.push(changed); }
  }
  return { scanned: due.size, closed, closedOutboxIds };
}
