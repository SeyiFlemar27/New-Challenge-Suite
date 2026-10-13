import { createHash } from "node:crypto";
import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { createAuditLogRecord } from "@/lib/server/audit";
import { requireAdminPermission } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { normalizeSupportTicketStatus } from "@/lib/support/catalog";

const schema = z.object({
  issueId: z.string().trim().min(1).max(160),
  reason: z.string().trim().min(8).max(1000),
  confirmed: z.literal(true),
  expectedVersion: z.number().int().nonnegative().optional()
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { user, response } = await requireAdminPermission(request, "tickets.resolve");
  if (response) return response;
  const body = await readJson(request);
  if (body.response) return body.response;
  const parsed = schema.safeParse(body.body);
  if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Primary issue confirmation is invalid." });
  const db = getAdminDb();
  if (!db) return serverUnavailable("Support primary issue");
  const { ticketId } = await params;
  const ticketRef = db.collection("supportTickets").doc(ticketId);
  const issuesQuery = ticketRef.collection("issues");
  const requestKey = request.headers.get("idempotency-key")?.trim() || `${ticketId}:${parsed.data.issueId}:${parsed.data.expectedVersion ?? "current"}:${user!.uid}`;
  const auditId = createHash("sha256").update(requestKey).digest("hex");
  const auditRef = db.collection("auditLogs").doc(`support_primary_${auditId}`);
  const now = new Date().toISOString();
  try {
    let duplicate = false;
    await db.runTransaction(async (transaction) => {
      const [ticketSnap, issuesSnap, auditSnap] = await Promise.all([
        transaction.get(ticketRef), transaction.get(issuesQuery), transaction.get(auditRef)
      ]);
      if (!ticketSnap.exists) throw new Error("NOT_FOUND");
      if (auditSnap.exists) { duplicate = true; return; }
      const ticket = ticketSnap.data() ?? {};
      const status = normalizeSupportTicketStatus(ticket.status);
      if (status === "closed" || status === "resolved") throw new Error("NOT_ACTIONABLE");
      if (parsed.data.expectedVersion !== undefined && parsed.data.expectedVersion !== Number(ticket.version ?? 0)) throw new Error("STALE_TICKET");
      const selected = issuesSnap.docs.find((issue) => issue.id === parsed.data.issueId);
      if (!selected) throw new Error("ISSUE_NOT_FOUND");
      const beforeId = typeof ticket.primaryIssueId === "string" ? ticket.primaryIssueId : null;
      for (const issue of issuesSnap.docs) transaction.set(issue.ref, { primary: issue.id === selected.id, updatedAt: now, primaryConfirmedBy: user!.uid }, { merge: true });
      transaction.set(ticketRef, {
        primaryIssueId: selected.id,
        primaryIssueDesignation: "admin_confirmed",
        primaryIssueConfirmedAt: now,
        primaryIssueConfirmedBy: user!.uid,
        version: Number(ticket.version ?? 0) + 1,
        updatedAt: now,
        lastActivityAt: now
      }, { merge: true });
      transaction.create(auditRef, createAuditLogRecord({
        actorId: user!.uid,
        actorType: "admin",
        action: "support.primary_issue_confirmed",
        targetType: "supportTicket",
        targetId: ticketId,
        reason: parsed.data.reason,
        before: { primaryIssueId: beforeId },
        after: { primaryIssueId: selected.id, designation: "admin_confirmed" },
        metadata: { issueCount: issuesSnap.size, manualFallback: ticket.primaryIssueSuggestionStatus !== "available" }
      }, auditRef.id, now));
    });
    return ok({ ticketId, issueId: parsed.data.issueId, duplicate }, duplicate ? "This primary issue confirmation was already recorded." : "Primary issue confirmed by Admin.");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Ticket not found.", 404);
    if (error instanceof Error && error.message === "ISSUE_NOT_FOUND") return fail("Issue not found on this ticket.", 404);
    if (error instanceof Error && error.message === "NOT_ACTIONABLE") return fail("Resolved or closed tickets cannot change primary issue designation.", 409);
    if (error instanceof Error && error.message === "STALE_TICKET") return fail("This ticket changed elsewhere. Reload before confirming the primary issue.", 409);
    return serverError("Primary issue could not be confirmed.", error instanceof Error ? error.name : "primary_issue_failed");
  }
}
