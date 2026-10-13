import { getAdminDb } from "@/lib/firebase/admin";
import { fail, ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Help article");
  try {
    const snap = await db.collection("helpArticles").where("slug", "==", slug).where("status", "==", "published").limit(1).get();
    if (snap.empty) return fail("Help article not found.", 404);
    const doc = snap.docs[0]!;
    const value = doc.data();
    return ok({ article: { id: doc.id, slug: value.slug, title: value.title, summary: value.summary, body: value.body, category: value.category, updatedAt: value.updatedAt } });
  } catch (error) { return serverError("Help article could not be loaded.", error instanceof Error ? error.name : "load_failed"); }
}
