import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { cleanText, isoNow } from "@/lib/sponsor-collaboration";
import { sponsorConversationMediaPath } from "@/lib/media-upload-paths";
import { canReplyToConversation } from "@/lib/server/messaging-permissions";

export const dynamic = "force-dynamic";

function safeAttachments(value: unknown, conversationId: string, sponsorId: string) {
  if (!Array.isArray(value)) return [];
  const allowedPrefixes = [
    sponsorConversationMediaPath(conversationId, sponsorId, "images") + "/",
    sponsorConversationMediaPath(conversationId, sponsorId, "documents") + "/"
  ];
  return value.slice(0, 4).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const url = cleanText(record.url).slice(0, 700);
    const path = cleanText(record.path).slice(0, 700);
    const contentType = cleanText(record.contentType).slice(0, 140);
    const kind = contentType.startsWith("image/") ? "image" : contentType === "application/pdf" || contentType.includes("wordprocessingml") || contentType === "application/msword" || contentType === "text/plain" ? "document" : "";
    if (!url || !path || !kind || !allowedPrefixes.some((prefix) => path.startsWith(prefix))) return [];
    return [{ url, path, contentType, kind, fileName: cleanText(record.fileName).slice(0, 180), size: Number(record.size ?? 0) }];
  });
}

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
    const replyPermission = canReplyToConversation({ isParticipant: true, anonymous: false });
    if (!replyPermission.allowed) return validationError({ conversationId: "Only conversation participants can reply." });
    const now = isoNow();
    const conversation = owned.snap.data() ?? {};
    const ref = context.db.collection("sponsorMessages").doc();
    const attachments = safeAttachments(body.attachments, conversationId, context.user.uid);
    const message = { id: ref.id, sponsorId: context.user.uid, ownerUid: context.user.uid, conversationId, recipientId: conversation.recipientId ?? null, body: text, attachments, attachmentCount: attachments.length, visibility: "creator_visible", status: "sent", deliveryStatus: "delivery_foundation", readStatus: "not_tracked", internalOnly: false, createdAt: now, updatedAt: now, createdBy: context.user.uid };
    await Promise.all([ref.set(message), context.db.collection("sponsorConversations").doc(conversationId).set({ lastMessagePreview: text.slice(0, 180), updatedAt: now, updatedBy: context.user.uid }, { merge: true })]);
    return ok({ message }, "Message saved. No funding or sponsorship status changed.");
  } catch (error) {
    console.error("[sponsor-conversation:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Message could not be saved.");
  }
}
