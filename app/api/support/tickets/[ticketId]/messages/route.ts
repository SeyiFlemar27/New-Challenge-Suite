import { createHash } from "node:crypto";
import { getAdminDb, getAdminStorage } from "@/lib/firebase/admin";
import { operationalTaskId } from "@/lib/server/admin-operations";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { SUPPORT_ATTACHMENT_MAX_BYTES, SUPPORT_ATTACHMENT_MAX_COUNT, SUPPORT_ATTACHMENT_TYPES, mayReopenSupportTicket, supportAttachmentBytesMatchType, supportNotificationRecord } from "@/lib/server/support-tickets";
import { normalizeSupportTicketStatus } from "@/lib/support/catalog";

export const dynamic = "force-dynamic";
async function validateAttachments(uid: string, paths: string[]) {
  if (paths.length > SUPPORT_ATTACHMENT_MAX_COUNT || new Set(paths).size !== paths.length) return null;
  if (!paths.length) return [] as Array<{ path: string; scanStatus: "quarantined"; contentType: string; size: number }>;
  const storage = getAdminStorage(); if (!storage) return null;
  const attachments: Array<{ path: string; scanStatus: "quarantined"; contentType: string; size: number }> = [];
  for (const path of paths) {
    if (!path.startsWith(`users/${uid}/support/`) || path.includes("..") || path.includes("\\") || /^https?:/i.test(path)) return null;
    try { const file = storage.bucket().file(path); const [metadata] = await file.getMetadata(); const type = String(metadata.contentType ?? ""), size = Number(metadata.size ?? 0); if (!SUPPORT_ATTACHMENT_TYPES.has(type) || !Number.isSafeInteger(size) || size < 1 || size > SUPPORT_ATTACHMENT_MAX_BYTES) return null; const [bytes] = await file.download(); if (!supportAttachmentBytesMatchType(bytes, type)) return null; attachments.push({ path, scanStatus: "quarantined", contentType: type, size }); } catch { return null; }
  }
  return attachments;
}

export async function GET(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { user, response } = await requireRequestUser(request); if (response) return response;
  const { ticketId } = await params; const db = getAdminDb(); if (!db) return serverUnavailable("Support messages");
  const ref = db.collection("supportTickets").doc(ticketId); const ticket = await ref.get();
  if (!ticket.exists || ticket.data()?.userId !== user!.uid) return fail("Ticket not found.", 404);
  const [messages, issues] = await Promise.all([ref.collection("messages").orderBy("createdAt", "asc").limit(200).get(), ref.collection("issues").orderBy("createdAt", "asc").limit(50).get()]);
  const data = ticket.data() ?? {};
  const safeMessages = messages.docs.flatMap((doc) => { const value = doc.data(); if (value.visibility === "internal" || value.internalOnly === true) return []; return [{ id: doc.id, authorType: value.authorType === "admin" ? "support" : "you", body: value.body, createdAt: value.createdAt, attachmentPaths: Array.isArray(value.attachmentPaths) ? value.attachmentPaths : [], emailDeliveryStatus: value.emailDeliveryStatus === "sent" ? "sent" : value.emailDeliveryStatus === "failed" ? "failed" : null }]; });
  return ok({ ticket: { id: ticket.id, ticketNumber: data.ticketNumber, subject: data.subject, category: data.category, issueType: data.issueType, status: normalizeSupportTicketStatus(data.status), priority: data.priority, canReply: mayReopenSupportTicket(data), createdAt: data.createdAt, updatedAt: data.updatedAt, lastActivityAt: data.lastActivityAt ?? data.updatedAt, resolvedAt: data.resolvedAt ?? null, reopenUntil: data.reopenUntil ?? null, resolutionSummary: data.resolutionSummary ?? null, relatedRecord: data.relatedRecord ?? null, attachments: Array.isArray(data.attachments) ? data.attachments.map((item: Record<string, unknown>) => ({ path: item.path, scanStatus: item.scanStatus })) : [] }, messages: safeMessages, issues: issues.docs.map((doc) => { const value = doc.data(); return { id: doc.id, title: value.title, issueType: value.issueType, condition: value.condition, customerExplanation: value.customerExplanation ?? null, createdAt: value.createdAt, updatedAt: value.updatedAt }; }) });
}

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { user, response } = await requireRequestUser(request); if (response) return response;
  const { ticketId } = await params; const db = getAdminDb(); if (!db) return serverUnavailable("Support reply");
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const body = typeof parsed.body?.message === "string" ? parsed.body.message.trim() : "";
  const paths = Array.isArray(parsed.body?.attachmentPaths) ? parsed.body.attachmentPaths.filter((value: unknown): value is string => typeof value === "string") : [];
  if ((!body && !paths.length) || body.length > 10_000) return validationError({ message: "Add a message or attachment. Messages are limited to 10,000 characters." });
  const attachments = await validateAttachments(user!.uid, paths);
  if (!attachments) return validationError({ attachments: "Attachments must be private, owned by this account, and within the approved type and size limits." });
  const key = request.headers.get("idempotency-key")?.trim() || createHash("sha256").update(`${user!.uid}:${ticketId}:${body}`).digest("hex");
  const messageId = `user_${createHash("sha256").update(key).digest("hex")}`;
  const ticketRef = db.collection("supportTickets").doc(ticketId); const messageRef = ticketRef.collection("messages").doc(messageId);
  const notificationId = `support_customer_reply_${createHash("sha256").update(messageId).digest("hex")}`;
  const notificationRef = db.collection("notifications").doc(notificationId);
  try {
    const now = new Date().toISOString(); let duplicate = false;
    await db.runTransaction(async (transaction) => {
      const [ticketSnap, messageSnap] = await Promise.all([transaction.get(ticketRef), transaction.get(messageRef)]);
      if (!ticketSnap.exists || ticketSnap.data()?.userId !== user!.uid) throw new Error("NOT_FOUND");
      if (messageSnap.exists) { duplicate = true; return; }
      const ticket = ticketSnap.data() ?? {};
      if (!mayReopenSupportTicket(ticket, Date.now())) throw new Error("REOPEN_WINDOW_EXPIRED");
      const status = normalizeSupportTicketStatus(ticket.status);
      const wasResolved = status === "resolved";
      const nextStatus = wasResolved ? "open" : status === "waiting_for_you" ? "in_review" : status;
      transaction.create(messageRef, { id: messageId, authorType: "customer", authorId: user!.uid, visibility: "customer", body, attachmentPaths: paths, attachments, createdAt: now, idempotencyKeyHash: createHash("sha256").update(key).digest("hex") });
      transaction.create(notificationRef, supportNotificationRecord({ id: notificationId, userId: user!.uid, type: wasResolved ? "support_ticket_reopened" : "support_customer_reply_saved", title: wasResolved ? "Support request reopened" : "Reply added", message: wasResolved ? "Your response reopened this request for Support." : "Your message was added to the Support conversation.", ticketId, createdAt: now }));
      transaction.set(ticketRef, { status: nextStatus, reopenedAt: wasResolved ? now : ticket.reopenedAt ?? null, lastCustomerResponseAt: now, lastActivityAt: now, updatedAt: now, version: Number(ticket.version ?? 0) + 1, resolvedAt: wasResolved ? null : ticket.resolvedAt ?? null, reopenUntil: wasResolved ? null : ticket.reopenUntil ?? null, attachments: [...(Array.isArray(ticket.attachments) ? ticket.attachments : []), ...attachments] }, { merge: true });
      const taskRef = db.collection("adminActionTasks").doc(operationalTaskId("support_ticket", ticketId));
      transaction.set(taskRef, { state: "in_progress", updatedAt: now, lastCustomerResponseAt: now }, { merge: true });
    });
    return ok({ ticketId, messageId, duplicate, attachmentScanStatus: attachments.map((attachment) => attachment.scanStatus) }, duplicate ? "Reply already recorded." : "Your message was added to the Support conversation.");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Ticket not found.", 404);
    if (error instanceof Error && error.message === "REOPEN_WINDOW_EXPIRED") return fail("This resolved ticket can no longer be reopened. Create a new support ticket.", 409);
    return serverError("Support reply could not be saved.", error instanceof Error ? error.message : error);
  }
}
