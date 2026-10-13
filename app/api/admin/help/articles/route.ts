import { createHash } from "node:crypto";
import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { createAuditLogRecord } from "@/lib/server/audit";
import { requireAdminPermission } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { SUPPORT_CATEGORIES } from "@/lib/support/catalog";

export const dynamic = "force-dynamic";
const categoryIds = Object.keys(SUPPORT_CATEGORIES) as [keyof typeof SUPPORT_CATEGORIES, ...(keyof typeof SUPPORT_CATEGORIES)[]];
const contentSchema = z.object({ title: z.string().trim().min(5).max(180), slug: z.string().trim().min(3).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), summary: z.string().trim().min(10).max(500), body: z.string().trim().min(20).max(20_000), category: z.enum(categoryIds), status: z.enum(["draft", "published"]), featured: z.boolean().default(false), sortOrder: z.number().int().min(0).max(10_000).default(100), reason: z.string().trim().min(8).max(500), confirmed: z.literal(true) });
const patchSchema = contentSchema.partial().extend({ articleId: z.string().min(1).max(160), expectedUpdatedAt: z.string().optional(), reason: z.string().trim().min(8).max(500), confirmed: z.literal(true) });
const deleteSchema = z.object({ articleId: z.string().min(1).max(160), reason: z.string().trim().min(8).max(500), confirmed: z.literal(true) });
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function GET(request: Request) {
  const { response } = await requireAdminPermission(request, "content.preview");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin help content");
  try {
    const snap = await db.collection("helpArticles").orderBy("updatedAt", "desc").limit(200).get();
    return ok({ articles: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  } catch (error) { return serverError("Help content could not be loaded.", error instanceof Error ? error.name : "load_failed"); }
}

export async function POST(request: Request) {
  const { user, response } = await requireAdminPermission(request, "content.publish");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin help content");
  const body = await readJson(request);
  if (body.response) return body.response;
  const parsed = contentSchema.safeParse(body.body);
  if (!parsed.success) return validationError({ content: parsed.error.issues[0]?.message ?? "Help article content is invalid." });
  const ref = db.collection("helpArticles").doc();
  const now = new Date().toISOString();
  const versionRef = ref.collection("versions").doc(`v_${createHash("sha256").update(`${now}:${user!.uid}`).digest("hex").slice(0, 24)}`);
  const auditId = `help_article_create_${ref.id}`;
  const auditRef = db.collection("auditLogs").doc(auditId);
  const { reason, confirmed: _confirmed, ...content } = parsed.data;
  const value = { ...content, createdAt: now, updatedAt: now, createdBy: user!.uid, updatedBy: user!.uid };
  try {
    await db.runTransaction(async (transaction) => {
      const duplicateSlug = await transaction.get(db.collection("helpArticles").where("slug", "==", parsed.data.slug).limit(1));
      if (!duplicateSlug.empty) throw new Error("SLUG_EXISTS");
      transaction.create(ref, value);
      transaction.create(versionRef, { ...value, versionAt: now, versionBy: user!.uid });
      transaction.create(auditRef, createAuditLogRecord({ actorId: user!.uid, actorType: "admin", action: "support.help_article_created", targetType: "helpArticle", targetId: ref.id, reason, after: { status: value.status, slug: value.slug } }, auditId, now));
    });
    return ok({ article: { id: ref.id, ...value } }, "Help article saved.");
  } catch (error) {
    if (error instanceof Error && error.message === "SLUG_EXISTS") return fail("That article URL is already in use.", 409);
    return serverError("Help article could not be saved.", error instanceof Error ? error.name : "save_failed");
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireAdminPermission(request, "content.publish");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin help content");
  const body = await readJson(request);
  if (body.response) return body.response;
  const parsed = patchSchema.safeParse(body.body);
  if (!parsed.success) return validationError({ content: parsed.error.issues[0]?.message ?? "Help article update is invalid." });
  const { articleId, expectedUpdatedAt, reason, confirmed: _confirmed, ...patch } = parsed.data;
  const ref = db.collection("helpArticles").doc(articleId);
  const now = new Date().toISOString();
  const auditId = `help_article_update_${createHash("sha256").update(`${articleId}:${request.headers.get("idempotency-key") || now}:${user!.uid}`).digest("hex")}`;
  const auditRef = db.collection("auditLogs").doc(auditId);
  const versionRef = ref.collection("versions").doc(`v_${createHash("sha256").update(auditId).digest("hex").slice(0, 24)}`);
  try {
    const result = await db.runTransaction(async (transaction) => {
      const [snapshot, audit] = await Promise.all([transaction.get(ref), transaction.get(auditRef)]);
      if (!snapshot.exists) throw new Error("NOT_FOUND");
      const before = snapshot.data() ?? {};
      if (expectedUpdatedAt && before.updatedAt !== expectedUpdatedAt) throw new Error("STALE_VERSION");
      if (audit.exists) return { duplicate: true, value: before };
      const merged = { ...before, ...patch, updatedAt: now, updatedBy: user!.uid };
      if (patch.slug && patch.slug !== before.slug) {
        const duplicateSlug = await transaction.get(db.collection("helpArticles").where("slug", "==", patch.slug).limit(2));
        if (duplicateSlug.docs.some((doc) => doc.id !== articleId)) throw new Error("SLUG_EXISTS");
      }
      transaction.set(ref, merged, { merge: true });
      transaction.create(versionRef, { ...merged, versionAt: now, versionBy: user!.uid });
      transaction.create(auditRef, createAuditLogRecord({ actorId: user!.uid, actorType: "admin", action: "support.help_article_updated", targetType: "helpArticle", targetId: articleId, reason, before: { status: before.status, updatedAt: before.updatedAt }, after: { status: merged.status, updatedAt: now } }, auditRef.id, now));
      return { duplicate: false, value: merged };
    });
    return ok({ article: { id: articleId, ...result.value }, duplicate: result.duplicate }, result.duplicate ? "This article update was already saved." : "Help article updated.");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Help article not found.", 404);
    if (error instanceof Error && error.message === "STALE_VERSION") return fail("This article changed elsewhere. Reload before saving.", 409);
    if (error instanceof Error && error.message === "SLUG_EXISTS") return fail("That article URL is already in use.", 409);
    return serverError("Help article could not be updated.", error instanceof Error ? error.name : "update_failed");
  }
}

export async function DELETE(request: Request) {
  const { user, response } = await requireAdminPermission(request, "content.publish");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin help content");
  const body = await readJson(request);
  if (body.response) return body.response;
  const parsed = deleteSchema.safeParse(body.body);
  if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Provide a reason and confirm archiving." });
  const ref = db.collection("helpArticles").doc(parsed.data.articleId);
  const now = new Date().toISOString();
  const auditId = `help_article_archive_${createHash("sha256").update(`${ref.id}:${request.headers.get("idempotency-key") || now}:${user!.uid}`).digest("hex")}`;
  const auditRef = db.collection("auditLogs").doc(auditId);
  try {
    await db.runTransaction(async (transaction) => {
      const [snapshot, audit] = await Promise.all([transaction.get(ref), transaction.get(auditRef)]);
      if (!snapshot.exists) throw new Error("NOT_FOUND");
      if (audit.exists) return;
      const before = snapshot.data() ?? {};
      transaction.set(ref, { status: "archived", updatedAt: now, updatedBy: user!.uid }, { merge: true });
      transaction.create(auditRef, createAuditLogRecord({ actorId: user!.uid, actorType: "admin", action: "support.help_article_archived", targetType: "helpArticle", targetId: ref.id, reason: parsed.data.reason, before: { status: before.status }, after: { status: "archived" } }, auditId, now));
    });
    return ok({ articleId: ref.id, status: "archived" }, "Help article archived.");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Help article not found.", 404);
    return serverError("Help article could not be archived.", error instanceof Error ? error.name : "archive_failed");
  }
}
