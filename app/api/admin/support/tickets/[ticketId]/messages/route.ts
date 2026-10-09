import { createHash, randomUUID } from "node:crypto";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/server/audit";
import { requireAdminPermission } from "@/lib/server/auth";
import { sendEmail } from "@/lib/server/email";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { supportTicketReplyAddress } from "@/lib/server/support-tickets";
import { z } from "zod";

export const dynamic = "force-dynamic";
const schema = z.object({ message: z.string().trim().min(1).max(5000), reason: z.string().trim().min(8).max(1000), confirmed: z.literal(true) });
function escapeHtml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { user, response } = await requireAdminPermission(request, "tickets.resolve"); if (response) return response;
  const { ticketId } = await params; const db = getAdminDb(); if (!db) return serverUnavailable("Admin support reply");
  const parsedBody = await readJson(request); if (parsedBody.response) return parsedBody.response;
  const parsed = schema.safeParse(parsedBody.body); if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Confirm the Admin reply and provide a reason." });
  const key = request.headers.get("idempotency-key")?.trim() || randomUUID();
  const messageId = `admin_${createHash("sha256").update(`${ticketId}:${user!.uid}:${key}`).digest("hex")}`;
  const ref = db.collection("supportTickets").doc(ticketId); const messageRef = ref.collection("messages").doc(messageId); const now = new Date().toISOString();
  try {
    let email = ""; let ticketNumber = ""; let duplicate = false;
    await db.runTransaction(async (transaction) => {
      const [ticketSnap, messageSnap] = await Promise.all([transaction.get(ref), transaction.get(messageRef)]);
      if (!ticketSnap.exists) throw new Error("NOT_FOUND");
      const ticket = ticketSnap.data() ?? {};
      if (ticket.status === "closed") throw new Error("CLOSED");
      email = String(ticket.userEmail ?? ""); ticketNumber = String(ticket.ticketNumber ?? ticketId);
      if (messageSnap.exists) { duplicate = true; return; }
      transaction.create(messageRef, { id: messageId, authorType: "admin", authorId: user!.uid, body: parsed.data.message, createdAt: now, emailDeliveryStatus: "pending" });
      transaction.set(ref, { status: "waiting_for_user", lastAdminResponseAt: now, updatedAt: now }, { merge: true });
    });
    if (duplicate) {
      const existing = await messageRef.get();
      if (existing.data()?.emailDeliveryStatus === "sent") return ok({ ticketId, messageId, emailDeliveryStatus: "sent", duplicate: true }, "Reply and email were already sent.");
    }
    const auth = getAdminAuth();
    if (!email && auth) { try { email = (await auth.getUser(String((await ref.get()).data()?.userId ?? ""))).email ?? ""; } catch { /* Email may not be available for this account. */ } }
    if (!email) {
      await messageRef.set({ emailDeliveryStatus: "failed", emailError: "recipient_email_unavailable", emailUpdatedAt: new Date().toISOString() }, { merge: true });
      await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: "support.ticket_reply_email_failed", targetType: "supportTicket", targetId: ticketId, reason: parsed.data.reason, after: { messageId, outcome: "email_delivery_failed", code: "recipient_email_unavailable" } }, db);
      return ok({ ticketId, messageId, emailDeliveryStatus: "failed" }, "Reply was saved, but the user email is unavailable.");
    }
    const replyTo = supportTicketReplyAddress(ticketNumber);
    if (!replyTo) {
      await messageRef.set({ emailDeliveryStatus: "failed", emailError: "support_inbound_email_not_configured", emailUpdatedAt: new Date().toISOString() }, { merge: true });
      await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: "support.ticket_reply_email_failed", targetType: "supportTicket", targetId: ticketId, reason: parsed.data.reason, after: { messageId, outcome: "email_delivery_failed", code: "support_inbound_email_not_configured" } }, db);
      return ok({ ticketId, messageId, emailDeliveryStatus: "failed" }, "Reply was saved, but support email replies are not configured.");
    }
    try {
      await sendEmail({ to: email, subject: `Support update for ${ticketNumber}`, text: `Support replied to your ticket ${ticketNumber}:\n\n${parsed.data.message}\n\nReply to this email to reopen or continue your ticket.`, html: `<p>Support replied to your ticket <strong>${escapeHtml(ticketNumber)}</strong>:</p><p>${escapeHtml(parsed.data.message).replaceAll("\n", "<br>")}</p><p>Reply to this email to continue your ticket.</p>`, ...(replyTo ? { replyTo } : {}), idempotencyKey: `support-reply-${messageId}` });
      await messageRef.set({ emailDeliveryStatus: "sent", emailUpdatedAt: new Date().toISOString(), replyToAddress: replyTo }, { merge: true });
      await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: "support.ticket_replied", targetType: "supportTicket", targetId: ticketId, reason: parsed.data.reason, after: { messageId, outcome: "success", emailDeliveryStatus: "sent" } }, db);
      return ok({ ticketId, messageId, emailDeliveryStatus: "sent" }, "Reply sent to the user by email.");
    } catch (error) {
      await messageRef.set({ emailDeliveryStatus: "failed", emailError: error instanceof Error ? error.name : "delivery_failed", emailUpdatedAt: new Date().toISOString() }, { merge: true });
      await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: "support.ticket_reply_email_failed", targetType: "supportTicket", targetId: ticketId, reason: parsed.data.reason, after: { messageId, outcome: "email_delivery_failed" } }, db);
      return ok({ ticketId, messageId, emailDeliveryStatus: "failed" }, "Reply was saved, but email delivery failed. Retry this request to deliver it.");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Ticket not found.", 404);
    if (error instanceof Error && error.message === "CLOSED") return fail("Closed tickets cannot receive an Admin reply.", 409);
    return serverError("Admin reply could not be saved.", error instanceof Error ? error.message : error);
  }
}
