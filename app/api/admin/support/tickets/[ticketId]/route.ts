import { createHash } from "node:crypto";
import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { createAuditLogRecord } from "@/lib/server/audit";
import { requireAdminPermission } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { normalizeSupportTicketStatus, SUPPORT_CATEGORIES, supportIssueTypeAllowed, type SupportIssueCondition } from "@/lib/support/catalog";

export const dynamic = "force-dynamic";

const createIssueSchema = z.object({
  category: z.string().min(1).max(40),
  issueType: z.string().min(1).max(60),
  title: z.string().trim().min(5).max(180),
  customerDescription: z.string().trim().max(5000).optional(),
  reason: z.string().trim().min(8).max(1000),
  confirmed: z.literal(true)
});

const updateIssueSchema = z.object({
  issueId: z.string().min(1).max(160),
  condition: z.enum(["investigating", "awaiting_customer", "pending_provider", "awaiting_remediation", "explained", "fixed"]),
  customerExplanation: z.string().trim().max(5000).optional(),
  verifiedAuditId: z.string().trim().max(180).optional(),
  reason: z.string().trim().min(8).max(1000),
  confirmed: z.literal(true),
  expectedUpdatedAt: z.string().optional()
});

const categoryIds = Object.keys(SUPPORT_CATEGORIES);
const issueConditions: SupportIssueCondition[] = ["investigating", "awaiting_customer", "pending_provider", "awaiting_remediation", "explained", "fixed"];

export async function GET(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { response } = await requireAdminPermission(request, "tickets.view");
  if (response) return response;
  const { ticketId } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin support ticket");
  try {
    const ref = db.collection("supportTickets").doc(ticketId);
    const ticketSnap = await ref.get();
    if (!ticketSnap.exists) return fail("Ticket not found.", 404);
    const [messages, issues, staffNotes, emailOutboxes] = await Promise.all([
      ref.collection("messages").orderBy("createdAt", "asc").limit(200).get(),
      ref.collection("issues").orderBy("createdAt", "asc").limit(50).get(),
      ref.collection("staffNotes").orderBy("createdAt", "asc").limit(100).get(),
      db.collection("supportEmailOutbox").where("ticketId", "==", ticketId).limit(50).get()
    ]);
    return ok({
      ticket: { id: ticketSnap.id, ...ticketSnap.data(), status: normalizeSupportTicketStatus(ticketSnap.data()?.status) },
      messages: messages.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      issues: issues.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      staffNotes: staffNotes.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      emailOutboxes: emailOutboxes.docs.map((doc) => { const value = doc.data(); return { id: doc.id, type: value.type, status: value.status, attempts: value.attempts, lastError: value.lastError ?? null, updatedAt: value.updatedAt }; })
    });
  } catch (error) {
    return serverError("Admin support ticket could not be loaded.", error instanceof Error ? error.name : "load_failed");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { user, response } = await requireAdminPermission(request, "tickets.resolve");
  if (response) return response;
  const { ticketId } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin support issue");
  const body = await readJson(request);
  if (body.response) return body.response;
  const parsed = createIssueSchema.safeParse(body.body);
  if (!parsed.success) return validationError({ issue: parsed.error.issues[0]?.message ?? "Issue details are invalid." });
  if (!categoryIds.includes(parsed.data.category) || !supportIssueTypeAllowed(parsed.data.category, parsed.data.issueType)) {
    return validationError({ issueType: "Choose a supported issue type for this category." });
  }
  const ticketRef = db.collection("supportTickets").doc(ticketId);
  const issueRef = ticketRef.collection("issues").doc(`issue_${createHash("sha256").update(`${ticketId}:${request.headers.get("idempotency-key") ?? `${user!.uid}:${parsed.data.title}`}`).digest("hex").slice(0, 32)}`);
  const auditRef = db.collection("auditLogs").doc(`support_issue_${issueRef.id}`);
  const now = new Date().toISOString();
  try {
    let duplicate = false;
    await db.runTransaction(async (transaction) => {
      const [ticketSnap, issueSnap, auditSnap] = await Promise.all([transaction.get(ticketRef), transaction.get(issueRef), transaction.get(auditRef)]);
      if (!ticketSnap.exists) throw new Error("NOT_FOUND");
      const ticket = ticketSnap.data() ?? {};
      const ticketStatus = normalizeSupportTicketStatus(ticket.status);
      if (ticketStatus === "closed") throw new Error("CLOSED");
      if (ticketStatus === "resolved") throw new Error("RESOLVED");
      if (issueSnap.exists) { duplicate = true; return; }
      const issue = { id: issueRef.id, category: parsed.data.category, issueType: parsed.data.issueType, title: parsed.data.title, customerDescription: parsed.data.customerDescription ?? "", condition: "investigating", primary: false, createdAt: now, updatedAt: now, createdBy: user!.uid };
      transaction.create(issueRef, issue);
      transaction.set(ticketRef, { issueLifecycleVersion: Number(ticket.issueLifecycleVersion ?? 1) + 1, issueCount: Number(ticket.issueCount ?? 1) + 1, lastActivityAt: now, updatedAt: now, version: Number(ticket.version ?? 0) + 1 }, { merge: true });
      if (!auditSnap.exists) transaction.create(auditRef, createAuditLogRecord({ actorId: user!.uid, actorType: "admin", action: "support.issue_added", targetType: "supportTicket", targetId: ticketId, reason: parsed.data.reason, after: { issueId: issueRef.id, issueType: parsed.data.issueType, condition: "investigating" } }, auditRef.id, now));
    });
    return ok({ issueId: issueRef.id, duplicate }, duplicate ? "This issue was already added." : "Issue added to the support request.");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Ticket not found.", 404);
    if (error instanceof Error && error.message === "CLOSED") return fail("Closed requests are read-only.", 409);
    if (error instanceof Error && error.message === "RESOLVED") return fail("Resolved requests cannot gain or change issues. Reply within the reopen window to reopen the request first.", 409);
    return serverError("Issue could not be added.", error instanceof Error ? error.name : "add_issue_failed");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { user, response } = await requireAdminPermission(request, "tickets.resolve");
  if (response) return response;
  const { ticketId } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin support issue");
  const body = await readJson(request);
  if (body.response) return body.response;
  const parsed = updateIssueSchema.safeParse(body.body);
  if (!parsed.success) return validationError({ issue: parsed.error.issues[0]?.message ?? "Issue update is invalid." });
  if (!issueConditions.includes(parsed.data.condition)) return validationError({ condition: "Choose a valid issue state." });
  if (parsed.data.condition === "explained" && (parsed.data.customerExplanation?.trim().length ?? 0) < 10) return validationError({ customerExplanation: "Explain the outcome to the customer." });
  if (parsed.data.condition === "fixed" && (!parsed.data.verifiedAuditId || (parsed.data.customerExplanation?.trim().length ?? 0) < 10)) return validationError({ verifiedAuditId: "A successful related operation audit and customer explanation are required before marking an issue fixed." });
  const ticketRef = db.collection("supportTickets").doc(ticketId);
  const issueRef = ticketRef.collection("issues").doc(parsed.data.issueId);
  const auditId = createHash("sha256").update(`${ticketId}:${parsed.data.issueId}:${parsed.data.expectedUpdatedAt ?? "current"}:${parsed.data.condition}:${parsed.data.reason}:${user!.uid}`).digest("hex");
  const auditRef = db.collection("auditLogs").doc(`support_issue_state_${auditId}`);
  const operationAuditRef = parsed.data.verifiedAuditId ? db.collection("auditLogs").doc(parsed.data.verifiedAuditId) : null;
  const now = new Date().toISOString();
  try {
    let duplicate = false;
    await db.runTransaction(async (transaction) => {
      const refs = [ticketRef, issueRef, auditRef, ...(operationAuditRef ? [operationAuditRef] : [])];
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      const [ticketSnap, issueSnap, actionAuditSnap, operationAuditSnap] = snapshots;
      if (!ticketSnap.exists || !issueSnap.exists) throw new Error("NOT_FOUND");
      const ticketStatus = normalizeSupportTicketStatus(ticketSnap.data()?.status);
      if (ticketStatus === "closed") throw new Error("CLOSED");
      if (ticketStatus === "resolved") throw new Error("RESOLVED");
      if (actionAuditSnap.exists) { duplicate = true; return; }
      const issue = issueSnap.data() ?? {};
      if (parsed.data.expectedUpdatedAt && issue.updatedAt !== parsed.data.expectedUpdatedAt) throw new Error("STALE_ISSUE");
      if (parsed.data.condition === "fixed") {
        const relatedId = String(ticketSnap.data()?.relatedRecord?.id ?? "");
        const operation = operationAuditSnap?.data() ?? {};
        const after = operation.after as Record<string, unknown> | undefined;
        if (!operationAuditSnap?.exists || !relatedId || operation.targetId !== relatedId || after?.outcome !== "success" || String(operation.action ?? "").startsWith("support.")) throw new Error("OPERATION_NOT_VERIFIED");
      }
      transaction.set(issueRef, { condition: parsed.data.condition, customerExplanation: parsed.data.customerExplanation?.trim() ?? null, ...(parsed.data.condition === "fixed" ? { verifiedAuditId: parsed.data.verifiedAuditId } : { verifiedAuditId: null }), updatedAt: now, updatedBy: user!.uid, outcomeReason: parsed.data.reason }, { merge: true });
      transaction.set(ticketRef, { issueLifecycleVersion: Number(ticketSnap.data()?.issueLifecycleVersion ?? 1) + 1, lastActivityAt: now, updatedAt: now, version: Number(ticketSnap.data()?.version ?? 0) + 1 }, { merge: true });
      transaction.create(auditRef, createAuditLogRecord({ actorId: user!.uid, actorType: "admin", action: "support.issue_condition_changed", targetType: "supportTicket", targetId: ticketId, reason: parsed.data.reason, before: { issueId: issueRef.id, condition: issue.condition ?? "investigating" }, after: { issueId: issueRef.id, condition: parsed.data.condition, verifiedAuditId: parsed.data.verifiedAuditId ?? null } }, auditRef.id, now));
    });
    return ok({ issueId: issueRef.id, condition: parsed.data.condition, duplicate }, duplicate ? "This issue update was already recorded." : "Issue status updated.");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Support issue not found.", 404);
    if (error instanceof Error && error.message === "CLOSED") return fail("Closed requests are read-only.", 409);
    if (error instanceof Error && error.message === "RESOLVED") return fail("Resolved requests are immutable. Reopen the conversation through a customer reply before changing issue outcomes.", 409);
    if (error instanceof Error && error.message === "STALE_ISSUE") return fail("This issue changed elsewhere. Reload before updating it.", 409);
    if (error instanceof Error && error.message === "OPERATION_NOT_VERIFIED") return fail("A successful audited operation on the related record is required before marking this issue fixed.", 409);
    return serverError("Issue status could not be updated.", error instanceof Error ? error.name : "update_issue_failed");
  }
}
