import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { cleanText, isoNow } from "@/lib/sponsor-collaboration";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const { conversationId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorConversations", conversationId, context.user.uid);
    if (owned.response) return owned.response;
    const snap = await context.db.collection("sponsorMessages").where("conversationId", "==", conversationId).where("sponsorId", "==", context.user.uid).limit(100).get();
    const messages = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String((a as any).createdAt ?? "").localeCompare(String((b as any).createdAt ?? "")));
    return ok({ conversation: { id: owned.snap.id, ...owned.snap.data() }, messages }, "Conversation loaded.");
  } catch (error) {
    console.error("[sponsor-conversation:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Conversation could not be loaded.");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const text = cleanText(body.body).slice(0, 2000);
  if (text.length < 2) return validationError({ body: "Message must be at least 2 characters." });
  try {
    const { conversationId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorConversations", conversationId, context.user.uid);
    if (owned.response) return owned.response;
    const now = isoNow();
    const conversation = owned.snap.data() ?? {};
    const ref = context.db.collection("sponsorMessages").doc();
    const message = { id: ref.id, sponsorId: context.user.uid, ownerUid: context.user.uid, conversationId, recipientId: conversation.recipientId ?? null, body: text, visibility: "creator_visible", status: "sent", deliveryStatus: "delivered_foundation", readStatus: "read_foundation", internalOnly: false, createdAt: now, updatedAt: now, createdBy: context.user.uid };
    await Promise.all([ref.set(message), context.db.collection("sponsorConversations").doc(conversationId).set({ lastMessagePreview: text.slice(0, 180), updatedAt: now, updatedBy: context.user.uid }, { merge: true })]);
    return ok({ message }, "Message saved. Delivery remains foundation-only.");
  } catch (error) {
    console.error("[sponsor-conversation:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Message could not be saved.");
  }
}
