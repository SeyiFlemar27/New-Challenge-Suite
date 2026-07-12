import { ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { cleanText, isoNow } from "@/lib/sponsor-collaboration";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const url = new URL(request.url);
  const relatedEntityId = url.searchParams.get("relatedEntityId");
  try {
    let query: FirebaseFirestore.Query = context.db.collection("sponsorInternalNotes").where("sponsorId", "==", context.user.uid);
    if (relatedEntityId) query = query.where("relatedEntityId", "==", relatedEntityId);
    const snap = await query.limit(100).get();
    const notes = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String((b as any).createdAt ?? "").localeCompare(String((a as any).createdAt ?? "")));
    return ok({ notes }, "Internal notes loaded.");
  } catch (error) {
    console.error("[sponsor-notes:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Internal notes could not be loaded.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const noteBody = cleanText(body.body).slice(0, 2000);
  if (noteBody.length < 2) return validationError({ body: "Internal note is required." });
  try {
    const now = isoNow();
    const ref = context.db.collection("sponsorInternalNotes").doc();
    const note = { id: ref.id, sponsorId: context.user.uid, ownerUid: context.user.uid, authorId: context.user.uid, relatedEntity: cleanText(body.relatedEntity, "proposal").slice(0, 80), relatedEntityId: cleanText(body.relatedEntityId).slice(0, 120), body: noteBody, visibility: "internal_only", creatorVisible: false, createdAt: now, updatedAt: now, createdBy: context.user.uid, updatedBy: context.user.uid };
    await ref.set(note);
    return ok({ note }, "Internal note saved. It is visible only to the sponsor team foundation.");
  } catch (error) {
    console.error("[sponsor-notes:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Internal note could not be saved.");
  }
}
