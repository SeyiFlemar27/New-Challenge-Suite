import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getAdminAuth, getAdminDb, getAdminStorage } from "@/lib/firebase/admin";
import { operationalTaskId } from "@/lib/server/admin-operations";
import { requireRequestUser } from "@/lib/server/auth";
import { dispatchSupportEmailOutbox, supportEmailContent } from "@/lib/server/support-email";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { SUPPORT_ATTACHMENT_MAX_BYTES, SUPPORT_ATTACHMENT_MAX_COUNT, SUPPORT_ATTACHMENT_TYPES, supportAttachmentBytesMatchType, supportNotificationRecord } from "@/lib/server/support-tickets";
import { SUPPORT_CATEGORIES, supportIssueTypeAllowed } from "@/lib/support/catalog";

export const dynamic = "force-dynamic";

const schema = z.object({
  category: z.string().min(1).max(40),
  issueType: z.string().min(1).max(60),
  subject: z.string().trim().min(5).max(200),
  description: z.string().trim().min(10).max(10_000),
  relatedType: z.enum(["challenge", "tournament", "submission"]).optional(),
  relatedId: z.string().trim().min(1).max(160).optional(),
  attachmentPaths: z.array(z.string().trim().max(500)).max(SUPPORT_ATTACHMENT_MAX_COUNT).default([]),
  contactEmail: z.string().trim().email().max(254).optional()
}).strict();

type RelatedKind = "challenge" | "tournament" | "submission";
const relatedCollections: Record<RelatedKind, string> = { challenge: "challenges", tournament: "tournaments", submission: "submissions" };
const ownershipFields: Record<RelatedKind, readonly string[]> = {
  challenge: ["userId", "ownerId", "creatorId", "creatorUid", "createdBy"],
  tournament: ["userId", "ownerId", "hostId", "hostUid", "creatorId", "createdBy"],
  submission: ["userId", "ownerId", "participantId", "creatorId", "submittedBy"]
};

async function userOwnsRelatedRecord(db: FirebaseFirestore.Firestore, uid: string, kind: RelatedKind, id: string) {
  const snap = await db.collection(relatedCollections[kind]).doc(id).get();
  if (!snap.exists) return false;
  const record = snap.data() ?? {};
  return ownershipFields[kind].some((field) => record[field] === uid);
}

async function validateAttachments(uid: string, paths: string[]) {
  if (new Set(paths).size !== paths.length) return null;
  if (!paths.length) return [] as Array<{ path: string; scanStatus: "quarantined"; contentType: string; size: number }>;
  const storage = getAdminStorage();
  if (!storage) return null;
  const attachments: Array<{ path: string; scanStatus: "quarantined"; contentType: string; size: number }> = [];
  for (const path of paths) {
    if (!path.startsWith(`users/${uid}/support/`) || path.includes("..") || path.includes("\\") || /^https?:/i.test(path)) return null;
    try {
      const file = storage.bucket().file(path);
      const [metadata] = await file.getMetadata();
      const contentType = String(metadata.contentType ?? "");
      const size = Number(metadata.size ?? 0);
      if (!SUPPORT_ATTACHMENT_TYPES.has(contentType) || !Number.isSafeInteger(size) || size < 1 || size > SUPPORT_ATTACHMENT_MAX_BYTES) return null;
      const [bytes] = await file.download();
      if (!supportAttachmentBytesMatchType(bytes, contentType)) return null;
      attachments.push({ path, scanStatus: "quarantined", contentType, size });
    } catch { return null; }
  }
  return attachments;
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Support tickets");
  try {
    const snap = await db.collection("supportTickets").where("userId", "==", user!.uid).orderBy("createdAt", "desc").limit(100).get();
    const tickets = snap.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, ticketNumber: data.ticketNumber, subject: data.subject, category: data.category, issueType: data.issueType, status: data.status, priority: data.priority, createdAt: data.createdAt, updatedAt: data.updatedAt, lastActivityAt: data.lastActivityAt ?? data.updatedAt, reopenUntil: data.reopenUntil ?? null };
    });
    return ok({ tickets });
  } catch (error) { return serverError("Support tickets could not be loaded.", error instanceof Error ? error.name : "load_failed"); }
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Support tickets");
  const parsedBody = await readJson(request);
  if (parsedBody.response) return parsedBody.response;
  const parsed = schema.safeParse(parsedBody.body);
  if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Complete the required support fields." });
  const { category, issueType, relatedType, relatedId, attachmentPaths } = parsed.data;
  if (!Object.hasOwn(SUPPORT_CATEGORIES, category) || !supportIssueTypeAllowed(category, issueType)) return validationError({ issueType: "Choose an issue type for the selected support category." });
  if (Boolean(relatedType) !== Boolean(relatedId)) return validationError({ relatedRecord: "Choose both a related record type and record." });
  if (relatedType && relatedId && !await userOwnsRelatedRecord(db, user!.uid, relatedType, relatedId)) return fail("That related record is unavailable for this account.", 404);
  const attachments = await validateAttachments(user!.uid, attachmentPaths);
  if (!attachments) return validationError({ attachmentPaths: "Attachments must be uploaded to your account, within the file limits, and use an accepted file format." });

  const auth = getAdminAuth();
  let accountEmail = user!.email ?? "";
  if (auth) { try { accountEmail = (await auth.getUser(user!.uid)).email ?? accountEmail; } catch { /* Email is optional when unavailable in Auth. */ } }
  const contactEmail = parsed.data.contactEmail ?? accountEmail;
  const now = new Date().toISOString();
  const ticketRef = db.collection("supportTickets").doc();
  const counterRef = db.collection("sequences").doc("supportTicketNumber");
  const taskRef = db.collection("adminActionTasks").doc(operationalTaskId("support_ticket", ticketRef.id));
  const requestKey = request.headers.get("idempotency-key")?.trim() || randomUUID();
  const requestHash = createHash("sha256").update(`${user!.uid}:${requestKey}`).digest("hex");
  const requestRef = db.collection("supportTicketRequests").doc(requestHash);
  const messageRef = ticketRef.collection("messages").doc("initial");
  const issueRef = ticketRef.collection("issues").doc("primary");
  const emailRef = db.collection("supportEmailOutbox").doc(`ticket_created_${ticketRef.id}`);
  const notificationId = `support_ticket_created_${ticketRef.id}`;
  const notificationRef = db.collection("notifications").doc(notificationId);
  let ticketNumber = "";
  let duplicateTicketId: string | null = null;
  try {
    await db.runTransaction(async (transaction) => {
      const [counter, previousRequest] = await Promise.all([transaction.get(counterRef), transaction.get(requestRef)]);
      if (previousRequest.exists) { duplicateTicketId = String(previousRequest.data()?.ticketId ?? ""); return; }
      const next = Math.max(48_290, Number(counter.data()?.lastNumber ?? 48_290)) + 1;
      ticketNumber = `CS-${String(next).padStart(5, "0")}`;
      const emailContent = supportEmailContent(ticketNumber, "We received your support request", `Your request ${parsed.data.subject} is open. You can follow it in My Requests.`);
      const taskId = operationalTaskId("support_ticket", ticketRef.id);
      transaction.set(counterRef, { lastNumber: next, updatedAt: now }, { merge: true });
      transaction.create(ticketRef, {
        id: ticketRef.id, ticketNumber, userId: user!.uid, userEmail: accountEmail, contactEmail,
        category, issueType, subject: parsed.data.subject, description: parsed.data.description,
        relatedRecord: relatedType && relatedId ? { type: relatedType, id: relatedId } : null,
        attachments, attachmentPaths: attachments.map((attachment) => attachment.path),
        status: "open", priority: "normal", version: 1, issueLifecycleVersion: 1,
        primaryIssueId: null, primaryIssueDesignation: "awaiting_admin_confirmation",
        createdAt: now, updatedAt: now, lastActivityAt: now, lastCustomerResponseAt: now
      });
      transaction.create(messageRef, { id: "initial", authorType: "customer", authorId: user!.uid, body: parsed.data.description, attachmentPaths: attachments.map((attachment) => attachment.path), visibility: "customer", createdAt: now });
      transaction.create(issueRef, { id: "primary", category, issueType, title: parsed.data.subject, customerDescription: parsed.data.description, condition: "investigating", primary: false, primaryCandidate: true, createdAt: now, updatedAt: now });
      transaction.create(taskRef, { id: taskId, sourceType: "support_ticket", sourceCollection: "supportTickets", sourceId: ticketRef.id, title: parsed.data.subject, reason: "A customer submitted a support ticket.", state: "unassigned", priority: "normal", createdAt: now, updatedAt: now });
      transaction.create(requestRef, { userId: user!.uid, ticketId: ticketRef.id, createdAt: now });
      transaction.create(emailRef, { id: emailRef.id, ticketId: ticketRef.id, messageId: "initial", type: "ticket_created", recipient: contactEmail || null, ...emailContent, status: "waiting_configuration", attempts: 0, createdAt: now, updatedAt: now });
      transaction.create(notificationRef, supportNotificationRecord({ id: notificationId, userId: user!.uid, type: "support_ticket_created", title: "Support request received", message: `Ticket ${ticketNumber} is open. You can follow its progress in My Requests.`, ticketId: ticketRef.id, createdAt: now }));
    });
    if (duplicateTicketId) {
      const duplicateSnap = await db.collection("supportTickets").doc(duplicateTicketId).get();
      if (!duplicateSnap.exists || duplicateSnap.data()?.userId !== user!.uid) return fail("This request could not be confirmed. Please try again.", 409);
      return ok({ ticketId: duplicateTicketId, ticketNumber: duplicateSnap.data()?.ticketNumber, status: duplicateSnap.data()?.status, duplicate: true }, "This support request was already received.");
    }
    const emailResult = await dispatchSupportEmailOutbox(db, emailRef.id);
    if (emailResult.status === "sent") await emailRef.set({ customerNotifiedAt: new Date().toISOString() }, { merge: true });
    return ok({ ticketId: ticketRef.id, ticketNumber, status: "open", attachments: attachments.map(({ path, scanStatus }) => ({ path, scanStatus })) }, "Your support request was received. Any attachments remain private while awaiting security scanning.");
  } catch (error) { return serverError("Support ticket could not be created.", error instanceof Error ? error.name : "create_failed"); }
}
