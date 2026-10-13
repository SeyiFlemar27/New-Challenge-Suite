import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { createAuditLogRecord } from "@/lib/server/audit";
import { operationalTaskId } from "@/lib/server/admin-operations";
import { requireAdminPermission } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { supportNotificationRecord } from "@/lib/server/support-tickets";
import { dispatchSupportEmailOutbox, supportEmailContent } from "@/lib/server/support-email";
import { normalizeSupportTicketStatus } from "@/lib/support/catalog";

export const dynamic = "force-dynamic";
const schema = z.object({ message: z.string().trim().min(1).max(10_000), reason: z.string().trim().min(8).max(1000), confirmed: z.literal(true) });

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { user, response } = await requireAdminPermission(request, "tickets.resolve");
  if (response) return response;
  const { ticketId } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin support reply");
  const parsedBody = await readJson(request);
  if (parsedBody.response) return parsedBody.response;
  const parsed = schema.safeParse(parsedBody.body);
  if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Confirm the Admin reply and provide a reason." });
  const key = request.headers.get("idempotency-key")?.trim() || randomUUID();
  const messageId = `admin_${createHash("sha256").update(`${ticketId}:${user!.uid}:${key}`).digest("hex")}`;
  const ticketRef = db.collection("supportTickets").doc(ticketId);
  const messageRef = ticketRef.collection("messages").doc(messageId);
  const outboxRef = db.collection("supportEmailOutbox").doc(`support_reply_${messageId}`);
  const auditRef = db.collection("auditLogs").doc(`support_reply_${messageId}`);
  const notificationId = `support_admin_reply_${createHash("sha256").update(messageId).digest("hex")}`;
  const notificationRef = db.collection("notifications").doc(notificationId);
  const now = new Date().toISOString();
  let email = "";
  let ticketNumber = "";
  let duplicate = false;
  try {
    await db.runTransaction(async (transaction) => {
      const [ticketSnap, messageSnap, outboxSnap, auditSnap] = await Promise.all([transaction.get(ticketRef), transaction.get(messageRef), transaction.get(outboxRef), transaction.get(auditRef)]);
      if (!ticketSnap.exists) throw new Error("NOT_FOUND");
      const ticket = ticketSnap.data() ?? {};
      const currentStatus = normalizeSupportTicketStatus(ticket.status);
      if (currentStatus === "closed") throw new Error("CLOSED");
      email = typeof ticket.contactEmail === "string" && ticket.contactEmail ? ticket.contactEmail : String(ticket.userEmail ?? "");
      ticketNumber = String(ticket.ticketNumber ?? ticketId);
      if (!messageSnap.exists) {
        transaction.create(messageRef, { id: messageId, authorType: "admin", authorId: user!.uid, visibility: "customer", body: parsed.data.message, createdAt: now, emailDeliveryStatus: "waiting_configuration" });
        if (typeof ticket.userId === "string" && ticket.userId) transaction.create(notificationRef, supportNotificationRecord({ id: notificationId, userId: ticket.userId, type: "support_admin_reply", title: "Support replied", message: `Challenge Suite Support replied to ticket ${ticketNumber}.`, ticketId, createdAt: now }));
        transaction.set(ticketRef, { ...(currentStatus === "waiting_for_you" ? { status: "in_review" } : {}), lastAdminResponseAt: now, lastActivityAt: now, updatedAt: now, version: Number(ticket.version ?? 0) + 1 }, { merge: true });
        if (currentStatus === "waiting_for_you") transaction.set(db.collection("adminActionTasks").doc(operationalTaskId("support_ticket", ticketId)), { state: "in_progress", updatedAt: now }, { merge: true });
      } else duplicate = true;
      if (!outboxSnap.exists) {
        const emailContent = supportEmailContent(ticketNumber, `Support update for ${ticketNumber}`, parsed.data.message);
        transaction.create(outboxRef, { id: outboxRef.id, ticketId, messageId, type: "admin_reply", recipient: email || null, ...emailContent, status: email ? "waiting_configuration" : "blocked", lastError: email ? null : "recipient_email_unavailable", attempts: 0, createdAt: now, updatedAt: now });
      }
      if (!auditSnap.exists) transaction.create(auditRef, createAuditLogRecord({ actorId: user!.uid, actorType: "admin", action: "support.ticket_replied", targetType: "supportTicket", targetId: ticketId, reason: parsed.data.reason, after: { messageId, emailDeliveryStatus: email ? "waiting_configuration" : "blocked", outcome: "message_saved" } }, auditRef.id, now));
    });

    const delivery = await dispatchSupportEmailOutbox(db, outboxRef.id);
    await messageRef.set({ emailDeliveryStatus: delivery.status, emailUpdatedAt: new Date().toISOString() }, { merge: true });
    await auditRef.set({ after: { messageId, emailDeliveryStatus: delivery.status, outcome: delivery.status === "failed" ? "message_saved_delivery_failed" : "message_saved" }, updatedAt: new Date().toISOString() }, { merge: true });
    if (delivery.status === "sent") return ok({ ticketId, messageId, emailDeliveryStatus: "sent", duplicate }, duplicate ? "The saved reply was already delivered." : "Reply saved and email delivered.");
    if (delivery.status === "failed") return ok({ ticketId, messageId, emailDeliveryStatus: "failed", duplicate }, "Reply saved. Email delivery failed and is available for an authorized retry.");
    return ok({ ticketId, messageId, emailDeliveryStatus: delivery.status, duplicate }, "Reply saved. Email delivery is waiting for approved configuration.");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Ticket not found.", 404);
    if (error instanceof Error && error.message === "CLOSED") return fail("Closed tickets cannot receive a reply.", 409);
    return serverError("Admin reply could not be saved.", error instanceof Error ? error.name : "reply_failed");
  }
}
