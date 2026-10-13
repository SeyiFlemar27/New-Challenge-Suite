import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { createAuditLogRecord } from "@/lib/server/audit";
import { requireAdminPermission } from "@/lib/server/auth";
import { dispatchSupportEmailOutbox } from "@/lib/server/support-email";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";
const schema = z.object({ outboxId: z.string().min(1).max(180), reason: z.string().trim().min(8).max(1000), confirmed: z.literal(true) });

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { user, response } = await requireAdminPermission(request, "tickets.resolve");
  if (response) return response;
  const { ticketId } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Support email retry");
  const body = await readJson(request);
  if (body.response) return body.response;
  const parsed = schema.safeParse(body.body);
  if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Confirm the retry and provide an audit reason." });

  const ticketRef = db.collection("supportTickets").doc(ticketId);
  const outboxRef = db.collection("supportEmailOutbox").doc(parsed.data.outboxId);
  const requestKey = request.headers.get("idempotency-key")?.trim() || randomUUID();
  const auditId = createHash("sha256").update(`${ticketId}:${outboxRef.id}:${user!.uid}:${requestKey}`).digest("hex");
  const auditRef = db.collection("auditLogs").doc(`support_email_retry_${auditId}`);
  const now = new Date().toISOString();
  try {
    let duplicate = false;
    let duplicateStatus = "";
    await db.runTransaction(async (transaction) => {
      const [ticket, outbox, audit] = await Promise.all([transaction.get(ticketRef), transaction.get(outboxRef), transaction.get(auditRef)]);
      if (!ticket.exists || !outbox.exists || outbox.data()?.ticketId !== ticketId) throw new Error("NOT_FOUND");
      const status = String(outbox.data()?.status ?? "blocked");
      if (audit.exists || status === "sent") { duplicate = true; duplicateStatus = status; return; }
      if (!new Set(["waiting_configuration", "failed", "blocked"]).has(status)) throw new Error("EMAIL_RETRY_NOT_ALLOWED");
      transaction.create(auditRef, createAuditLogRecord({ actorId: user!.uid, actorType: "admin", action: "support.email_retry_requested", targetType: "supportTicket", targetId: ticketId, reason: parsed.data.reason, before: { emailStatus: status }, after: { outboxId: outboxRef.id, outcome: "retry_requested" } }, auditRef.id, now));
    });
    if (duplicate) return ok({ ticketId, outboxId: outboxRef.id, status: duplicateStatus, duplicate: true }, duplicateStatus === "sent" ? "This email is already delivered." : "This retry was already recorded.");
    const delivery = await dispatchSupportEmailOutbox(db, outboxRef.id);
    await auditRef.set({ after: { outboxId: outboxRef.id, outcome: delivery.status, deliveryStatus: delivery.status }, updatedAt: new Date().toISOString() }, { merge: true });
    return ok({ ticketId, outboxId: outboxRef.id, status: delivery.status }, delivery.status === "sent" ? "Support email delivered." : delivery.status === "failed" ? "The support response remains saved; email delivery failed." : "The support response remains saved; email delivery is waiting for approved configuration.");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Support email record not found.", 404);
    if (error instanceof Error && error.message === "EMAIL_RETRY_NOT_ALLOWED") return fail("This email delivery is already in progress and cannot be retried yet.", 409);
    return serverError("Support email could not be retried.", error instanceof Error ? error.name : "retry_failed");
  }
}
