import { z } from "zod";
import { getAdminAuth, getAdminDb, getAdminStorage } from "@/lib/firebase/admin";
import { operationalTaskId, safetyTriage, taskDeadline } from "@/lib/server/admin-operations";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { SUPPORT_ATTACHMENT_MAX_BYTES, SUPPORT_ATTACHMENT_TYPES, supportAttachmentBytesMatchType, supportAttachmentPathAllowed } from "@/lib/server/support-tickets";

const schema = z.object({ category: z.enum(["account", "challenge", "payment", "payout", "refund", "submission", "voting", "sponsor", "event", "tournament", "technical_issue", "safety_concern", "other"]), subject: z.string().trim().min(5).max(160), description: z.string().trim().min(20).max(5000), relatedType: z.string().trim().max(40).optional(), relatedId: z.string().trim().max(160).optional(), prioritySuggestion: z.enum(["low", "normal", "high", "urgent"]).default("normal"), attachmentPaths: z.array(z.string().trim().max(500)).max(5).default([]), contactPreference: z.enum(["in_app", "email"]).default("in_app") });
async function validAttachments(userId: string, paths: string[]) {
  if (!paths.length) return true;
  const storage = getAdminStorage();
  if (!storage) return false;
  const bucket = storage.bucket();
  for (const path of paths) {
    if (!supportAttachmentPathAllowed(userId, path)) return false;
    try {
      const file = bucket.file(path); const [metadata] = await file.getMetadata();
      const contentType = String(metadata.contentType ?? "");
      if (!SUPPORT_ATTACHMENT_TYPES.has(contentType) || Number(metadata.size ?? 0) > SUPPORT_ATTACHMENT_MAX_BYTES) return false;
      const [bytes] = await file.download();
      if (!supportAttachmentBytesMatchType(bytes, contentType)) return false;
    } catch { return false; }
  }
  return true;
}

export async function GET(request: Request) { const { user, response } = await requireRequestUser(request); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Support tickets"); const snap = await db.collection("supportTickets").where("userId", "==", user!.uid).orderBy("createdAt", "desc").limit(100).get(); return ok({ tickets: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) }); }
export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Support tickets"); const body = await readJson(request); if (body.response) return body.response; const parsed = schema.safeParse(body.body); if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Invalid ticket." });
  if (!await validAttachments(user!.uid, parsed.data.attachmentPaths)) return validationError({ attachmentPaths: "Only uploaded image or PDF files up to 10 MB in your support folder are accepted." });
  try {
    const now = new Date().toISOString();
    const ref = db.collection("supportTickets").doc();
    const counterRef = db.collection("sequences").doc("supportTicketNumber");
    let ticketNumber = "";
    await db.runTransaction(async (transaction) => {
      const counter = await transaction.get(counterRef);
      const next = Math.max(48290, Number(counter.data()?.lastNumber ?? 48290)) + 1;
      ticketNumber = `CS-${String(next).padStart(5, "0")}`;
      transaction.set(counterRef, { lastNumber: next, updatedAt: now }, { merge: true });
    });
    const auth = getAdminAuth();
    let email = user!.email ?? "";
    if (auth) { try { email = (await auth.getUser(user!.uid)).email ?? email; } catch { /* Authenticated account may not expose email. */ } }
    const triage = parsed.data.category === "safety_concern" ? safetyTriage("safety_concern") : { priority: parsed.data.prioritySuggestion, immediateEscalationRequired: false };
    const taskId = operationalTaskId("support_ticket", ref.id);
    const batch = db.batch();
    batch.set(ref, { id: ref.id, ticketNumber, userId: user!.uid, userEmail: email, ...parsed.data, status: "submitted", priority: triage.priority, acknowledgedAt: now, slaDueAt: taskDeadline("support_ticket", now), createdAt: now, updatedAt: now });
    batch.set(ref.collection("messages").doc("initial"), { id: "initial", authorType: "user", authorId: user!.uid, body: parsed.data.description, attachmentPaths: parsed.data.attachmentPaths, createdAt: now });
    batch.set(db.collection("adminActionTasks").doc(taskId), { id: taskId, sourceType: "support_ticket", sourceCollection: "supportTickets", sourceId: ref.id, title: parsed.data.subject, reason: "A user submitted a support ticket.", state: "unassigned", priority: triage.priority, slaDueAt: taskDeadline("support_ticket", now), createdAt: now, updatedAt: now });
    await batch.commit();
    return ok({ ticketId: ref.id, ticketNumber, status: "submitted" }, "Support ticket submitted and acknowledged.");
  } catch (error) { return serverError("Support ticket could not be created.", error instanceof Error ? error.message : error); }
}
