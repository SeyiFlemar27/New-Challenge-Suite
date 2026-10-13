import { getAdminDb } from "@/lib/firebase/admin";
import { FieldPath } from "firebase-admin/firestore";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { SUPPORT_CATEGORIES } from "@/lib/support/catalog";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;
function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function cursorEncode(value: { updatedAt: string; id: string }) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function cursorDecode(value: string | null) {
  if (!value || value.length > 500) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { updatedAt?: unknown; id?: unknown };
    if (typeof parsed.updatedAt === "string" && typeof parsed.id === "string") return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch { /* Invalid cursors are treated as a first-page request. */ }
  return null;
}

export async function GET(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Help articles");
  const params = new URL(request.url).searchParams;
  const category = text(params.get("category"), 40);
  const query = text(params.get("q"), 120).toLocaleLowerCase();
  const cursor = cursorDecode(params.get("cursor"));
  const requestedLimit = Number(params.get("limit") ?? PAGE_SIZE);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), PAGE_SIZE) : PAGE_SIZE;
  try {
    let ref = db.collection("helpArticles").where("status", "==", "published").orderBy("updatedAt", "desc").orderBy(FieldPath.documentId(), "desc");
    if (cursor) ref = ref.startAfter(cursor.updatedAt, cursor.id);
    const matches: Array<{ id: string; slug: string; title: string; summary: string; category: string; featured: boolean; updatedAt: string; cursor: { updatedAt: string; id: string } }> = [];
    let scanned = 0;
    let lastScanned: { updatedAt: string; id: string } | null = null;
    let hasDatabaseMore = false;
    const scanLimit = 500;
    while (scanned < scanLimit && matches.length <= limit) {
      const batchSize = Math.min(100, scanLimit - scanned);
      const snap = await ref.limit(batchSize).get();
      if (snap.empty) { hasDatabaseMore = false; break; }
      for (const doc of snap.docs) {
      const value = doc.data();
      scanned += 1;
      const title = text(value.title, 180);
      const summary = text(value.summary, 500);
      const body = text(value.body, 20_000);
      lastScanned = { updatedAt: String(value.updatedAt ?? ""), id: doc.id };
      if (!title || !body) continue;
      const searchable = `${title} ${summary} ${body} ${text(value.category, 40)}`.toLocaleLowerCase();
      if (category && value.category !== category) continue;
      if (query && !query.split(/\s+/).every((word) => searchable.includes(word))) continue;
      matches.push({ id: doc.id, slug: text(value.slug, 180), title, summary, category: text(value.category, 40), featured: value.featured === true, updatedAt: text(value.updatedAt, 40), cursor: lastScanned });
      }
      hasDatabaseMore = snap.size === batchSize;
      const last = snap.docs.at(-1);
      if (last) ref = ref.startAfter(last);
      if (snap.size < batchSize) { hasDatabaseMore = false; break; }
    }
    const hasMoreMatches = matches.length > limit;
    const page = matches.slice(0, limit);
    const scanLimitReached = scanned >= scanLimit && hasDatabaseMore && !hasMoreMatches;
    const hasMore = hasMoreMatches || scanLimitReached;
    const next = hasMoreMatches ? page.at(-1)?.cursor : scanLimitReached ? lastScanned : null;
    return ok({ articles: page.map(({ cursor: _cursor, ...article }) => article), categories: Object.entries(SUPPORT_CATEGORIES).map(([id, value]) => ({ id, label: value.label })), nextCursor: hasMore && next ? cursorEncode(next) : null, hasMore, searchScanLimitReached: scanLimitReached }, "Published help articles loaded.");
  } catch (error) { return serverError("Help articles could not be loaded.", error instanceof Error ? error.name : "load_failed"); }
}
