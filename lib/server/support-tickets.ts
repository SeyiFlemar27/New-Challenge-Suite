import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { createAuditLogRecord } from "@/lib/server/audit";
import { operationalTaskId } from "@/lib/server/admin-operations";

export const SUPPORT_REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const SUPPORT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const SUPPORT_ATTACHMENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

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

export function mayReopenSupportTicket(ticket: Record<string, unknown>, now = Date.now()) {
  if (ticket.status !== "resolved") return ticket.status !== "closed";
  const deadline = Date.parse(String(ticket.reopenUntil ?? ""));
  return Number.isFinite(deadline) && now <= deadline;
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

export async function closeExpiredSupportTickets(db: Firestore, now = new Date()) {
  const nowIso = now.toISOString();
  const due = await db.collection("supportTickets").where("status", "==", "resolved").where("reopenUntil", "<=", nowIso).orderBy("reopenUntil", "asc").limit(500).get();
  let closed = 0;
  for (const candidate of due.docs) {
    const changed = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(candidate.ref);
      if (!current.exists || current.data()?.status !== "resolved" || Date.parse(String(current.data()?.reopenUntil ?? "")) > now.getTime()) return false;
      const ticket = current.data() ?? {};
      const auditId = `support_auto_close_${createHash("sha256").update(`${candidate.id}:${ticket.reopenUntil}`).digest("hex")}`;
      const auditRef = db.collection("auditLogs").doc(auditId);
      const taskRef = db.collection("adminActionTasks").doc(operationalTaskId("support_ticket", candidate.id));
      const [audit, task] = await Promise.all([transaction.get(auditRef), transaction.get(taskRef)]);
      transaction.set(candidate.ref, { status: "closed", closedAt: nowIso, closeReason: "reopen_window_expired", updatedAt: nowIso }, { merge: true });
      if (task.exists) transaction.set(taskRef, { state: "resolved", resolvedAt: nowIso, resolutionReason: "reopen_window_expired", updatedAt: nowIso }, { merge: true });
      if (!audit.exists) transaction.create(auditRef, createAuditLogRecord({ actorId: "system:support-ticket-closure", actorType: "system", action: "support.ticket_auto_closed", targetType: "supportTicket", targetId: candidate.id, reason: "The seven-day user response window expired.", before: { status: "resolved" }, after: { status: "closed", outcome: "success" } }, auditId, nowIso));
      return true;
    });
    if (changed) closed += 1;
  }
  return { scanned: due.size, closed };
}
