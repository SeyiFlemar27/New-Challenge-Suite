import { ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { cleanText, isoNow } from "@/lib/sponsor-collaboration";
import { sponsorConversationMediaPath } from "@/lib/media-upload-paths";
import { canStartConversation } from "@/lib/server/messaging-permissions";

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

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const [conversationsSnap, messagesSnap] = await Promise.all([
      context.db.collection("sponsorConversations").where("sponsorId", "==", context.user.uid).limit(100).get(),
      context.db.collection("sponsorMessages").where("sponsorId", "==", context.user.uid).limit(100).get()
    ]);
    const conversations = conversationsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String((b as any).updatedAt ?? "").localeCompare(String((a as any).updatedAt ?? "")));
    const messages = messagesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String((b as any).createdAt ?? "").localeCompare(String((a as any).createdAt ?? "")));
    return ok({ conversations, messages }, "Sponsor messages loaded.");
  } catch (error) {
    console.error("[sponsor-messages:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor messages could not be loaded.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const recipientId = cleanText(body.recipientId).slice(0, 120);
  const messageBody = cleanText(body.body).slice(0, 2000);
  if (!recipientId) return validationError({ recipientId: "Open a conversation from a creator profile, host profile, challenge opportunity, invite, or discovery card." });
  if (messageBody.length < 2) return validationError({ body: "Message must be at least 2 characters." });
  try {
    const now = isoNow();
    const conversationId = cleanText(body.conversationId).slice(0, 120) || context.db.collection("sponsorConversations").doc().id;
    const source = cleanText(body.source).slice(0, 80) || (body.challengeId ? "opportunity" : "discovery_card");
    const permission = canStartConversation({ senderType: "sponsor", recipientType: "creator", source: source === "profile" || source === "challenge" || source === "opportunity" || source === "invite" ? source : "discovery_card" });
    if (!permission.allowed) return validationError({ recipientId: "This conversation must start from an allowed profile, challenge, opportunity, invite, or discovery context." });
    const conversation = { id: conversationId, sponsorId: context.user.uid, ownerUid: context.user.uid, recipientId, relatedProposalId: cleanText(body.proposalId).slice(0, 120) || null, relatedCampaignId: cleanText(body.campaignId).slice(0, 120) || null, relatedChallengeId: cleanText(body.challengeId).slice(0, 120) || null, title: cleanText(body.title, "Sponsor conversation").slice(0, 180), conversationStartSource: source, manualRecipientIdEntryAllowed: false, lastMessagePreview: messageBody.slice(0, 180), unreadCountFoundation: 0, status: "active", updatedAt: now, updatedBy: context.user.uid, createdAt: now, createdBy: context.user.uid };
    const messageRef = context.db.collection("sponsorMessages").doc();
    const attachments = safeAttachments(body.attachments, conversationId, context.user.uid);
    const message = { id: messageRef.id, sponsorId: context.user.uid, ownerUid: context.user.uid, conversationId, recipientId, body: messageBody, attachments, attachmentCount: attachments.length, visibility: "creator_visible", status: "sent", deliveryStatus: "delivery_foundation", readStatus: "not_tracked", internalOnly: false, createdAt: now, updatedAt: now, createdBy: context.user.uid };
    await Promise.all([
      context.db.collection("sponsorConversations").doc(conversationId).set(conversation, { merge: true }),
      messageRef.set(message),
      context.db.collection("sponsorProposalActivity").add({ sponsorId: context.user.uid, proposalId: conversation.relatedProposalId, conversationId, action: "message_sent", status: "sent", createdAt: now, createdBy: context.user.uid })
    ]);
    return ok({ conversation, message }, "Message saved. No sponsorship agreement or funding record was created.");
  } catch (error) {
    console.error("[sponsor-messages:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor message could not be saved.");
  }
}
