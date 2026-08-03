import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";
import { createNotification } from "@/lib/server/notifications";

export const MESSAGE_START_SOURCES = ["profile", "challenge", "opportunity", "invite", "discovery_card", "existing_conversation"] as const;
export type MessageStartSource = (typeof MESSAGE_START_SOURCES)[number];

type StoredRecord = Record<string, unknown> & { id: string };
type MessageAttachment = { url: string; path: string; fileName: string | null; contentType: string; size: number | null };

function cleanText(value: unknown, max = 2000) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
}

function safeAttachments(value: unknown): MessageAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const url = cleanText(record.url, 800);
    const path = cleanText(record.path, 500);
    const contentType = cleanText(record.contentType, 120).toLowerCase();
    const supported = contentType.startsWith("image/") || ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"].includes(contentType);
    if (!url.startsWith("https://") || !path || !supported) return [];
    return [{ url, path, contentType, fileName: cleanText(record.fileName, 180) || null, size: Number.isFinite(Number(record.size)) ? Number(record.size) : null }];
  });
}

function blockedIds(profile: Record<string, unknown>) {
  const direct = [...stringList(profile.blockedUserIds), ...stringList(profile.blockedUsers)];
  const mapIds = profile.blockedUsers && typeof profile.blockedUsers === "object" && !Array.isArray(profile.blockedUsers)
    ? Object.entries(profile.blockedUsers as Record<string, unknown>).filter(([, blocked]) => blocked === true).map(([id]) => id)
    : [];
  return new Set([...direct, ...mapIds]);
}

function profileSummary(id: string, profile: Record<string, unknown>) {
  return {
    id,
    displayName: cleanText(profile.displayName ?? profile.name ?? profile.username, 120) || "Challenge Suite member",
    username: cleanText(profile.username, 80) || null,
    avatarUrl: cleanText(profile.avatarUrl ?? profile.photoURL ?? profile.profileImageUrl, 500) || null,
    accountType: cleanText(profile.accountType, 40) || "user",
    role: cleanText(profile.role, 40) || null
  };
}

export async function assertUsersCanMessage(db: Firestore, senderId: string, recipientId: string) {
  if (!recipientId || senderId === recipientId) throw messageError("INVALID_RECIPIENT", "Choose another Challenge Suite member.");
  const [senderSnap, recipientSnap] = await Promise.all([
    db.collection("users").doc(senderId).get(),
    db.collection("users").doc(recipientId).get()
  ]);
  if (!recipientSnap.exists) throw messageError("RECIPIENT_NOT_FOUND", "This member is not available.");
  const sender = senderSnap.data() ?? {};
  const recipient = recipientSnap.data() ?? {};
  if (blockedIds(sender).has(recipientId) || blockedIds(recipient).has(senderId)) {
    throw messageError("MESSAGING_BLOCKED", "Messaging is unavailable between these accounts.");
  }
  if (recipient.accountStatus === "suspended" || recipient.messagingDisabled === true) {
    throw messageError("RECIPIENT_UNAVAILABLE", "This member cannot receive messages.");
  }
  return { sender: profileSummary(senderId, sender), recipient: profileSummary(recipientId, recipient) };
}

export function conversationIdForUsers(firstId: string, secondId: string) {
  return deterministicId("conversation", ...[firstId, secondId].sort());
}

export async function listConversations(db: Firestore, userId: string, limit = 50) {
  const snap = await db.collection("conversations").where("participantIds", "array-contains", userId).limit(Math.min(Math.max(limit, 1), 100)).get();
  const records = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as StoredRecord))
    .filter((item) => item.status !== "deleted")
    .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")));
  const otherIds = [...new Set(records.flatMap((item) => stringList(item.participantIds)).filter((id) => id !== userId))];
  const profileSnaps = await Promise.all(otherIds.map((id) => db.collection("users").doc(id).get()));
  const profiles = new Map(profileSnaps.map((snap) => [snap.id, profileSummary(snap.id, snap.data() ?? {})]));
  const conversations = records.map((record) => {
    const otherId = stringList(record.participantIds).find((id) => id !== userId) ?? "";
    return { ...record, otherParticipant: profiles.get(otherId) ?? null, unread: stringList(record.unreadUserIds).includes(userId) };
  });
  return { conversations, unreadCount: conversations.filter((item) => item.unread).length };
}

export async function getConversation(db: Firestore, conversationId: string, userId: string) {
  const snap = await db.collection("conversations").doc(conversationId).get();
  if (!snap.exists) throw messageError("CONVERSATION_NOT_FOUND", "Conversation not found.");
  const conversation = { id: snap.id, ...snap.data() } as StoredRecord;
  if (!stringList(conversation.participantIds).includes(userId)) throw messageError("CONVERSATION_FORBIDDEN", "You do not have access to this conversation.");
  return conversation;
}

export async function listMessages(db: Firestore, conversationId: string, userId: string, limit = 100) {
  const conversation = await getConversation(db, conversationId, userId);
  const snap = await db.collection("messages").where("conversationId", "==", conversationId).limit(Math.min(Math.max(limit, 1), 200)).get();
  const messages = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as StoredRecord))
    .filter((message) => stringList(conversation.participantIds).includes(String(message.senderId ?? "")))
    .sort((left, right) => String(left.createdAt ?? "").localeCompare(String(right.createdAt ?? "")));
  await markConversationRead(db, conversationId, userId);
  return { conversation, messages };
}

export async function startConversation(db: Firestore, input: {
  senderId: string;
  recipientId: string;
  source: MessageStartSource;
  body: string;
  relatedChallengeId?: string | null;
  relatedProposalId?: string | null;
  relatedCampaignId?: string | null;
  attachments?: unknown;
}) {
  if (!MESSAGE_START_SOURCES.includes(input.source) || input.source === "existing_conversation") {
    throw messageError("INVALID_MESSAGE_SOURCE", "Open messaging from a member profile, challenge, invite, or discovery page.");
  }
  const participants = await assertUsersCanMessage(db, input.senderId, input.recipientId);
  const conversationId = conversationIdForUsers(input.senderId, input.recipientId);
  const conversationRef = db.collection("conversations").doc(conversationId);
  const existing = await conversationRef.get();
  if (!existing.exists) {
    const now = new Date().toISOString();
    await conversationRef.set({
      id: conversationId,
      participantIds: [input.senderId, input.recipientId].sort(),
      source: input.source,
      relatedChallengeId: cleanText(input.relatedChallengeId, 160) || null,
      relatedProposalId: cleanText(input.relatedProposalId, 160) || null,
      relatedCampaignId: cleanText(input.relatedCampaignId, 160) || null,
      status: "active",
      unreadUserIds: [],
      createdAt: now,
      updatedAt: now,
      createdBy: input.senderId
    });
  }
  const message = input.body ? await sendMessage(db, { conversationId, senderId: input.senderId, body: input.body, attachments: input.attachments }) : null;
  return { conversationId, participants, message };
}

export async function sendMessage(db: Firestore, input: { conversationId: string; senderId: string; body: string; attachments?: unknown; idempotencyKey?: string | null }) {
  const body = cleanText(input.body, 2000);
  if (body.length < 1) throw messageError("MESSAGE_REQUIRED", "Write a message before sending.");
  const conversation = await getConversation(db, input.conversationId, input.senderId);
  const participantIds = stringList(conversation.participantIds);
  const recipientId = participantIds.find((id) => id !== input.senderId);
  if (!recipientId) throw messageError("RECIPIENT_NOT_FOUND", "Conversation recipient is unavailable.");
  await assertUsersCanMessage(db, input.senderId, recipientId);
  const messageId = input.idempotencyKey
    ? deterministicId("message", input.conversationId, input.senderId, cleanText(input.idempotencyKey, 160))
    : db.collection("messages").doc().id;
  const messageRef = db.collection("messages").doc(messageId);
  const conversationRef = db.collection("conversations").doc(input.conversationId);
  const now = new Date().toISOString();
  const attachments = safeAttachments(input.attachments);
  const message = {
    id: messageId,
    conversationId: input.conversationId,
    senderId: input.senderId,
    recipientId,
    body,
    attachments,
    status: "sent",
    readBy: [input.senderId],
    createdAt: now,
    updatedAt: now
  };
  const result = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(messageRef);
    if (existing.exists) return { id: existing.id, ...existing.data(), duplicate: true };
    transaction.set(messageRef, message);
    transaction.set(conversationRef, {
      lastMessagePreview: body.slice(0, 180),
      lastMessageAt: now,
      lastMessageSenderId: input.senderId,
      unreadUserIds: FieldValue.arrayUnion(recipientId),
      updatedAt: now
    }, { merge: true });
    transaction.set(db.collection("messageAuditLogs").doc(deterministicId("message_sent", messageId)), {
      actorId: input.senderId,
      action: "message.sent",
      targetType: "conversation",
      targetId: input.conversationId,
      messageId,
      recipientId,
      createdAt: now
    });
    return { ...message, duplicate: false };
  });
  if (!result.duplicate) {
    await createNotification(db, {
      userId: recipientId,
      type: "new_message",
      title: "New message",
      message: body.slice(0, 140),
      entityType: "conversation",
      entityId: input.conversationId,
      actionUrl: `/messages/${input.conversationId}`,
      idempotencyKey: `message_${messageId}`
    });
  }
  return result;
}

export async function markConversationRead(db: Firestore, conversationId: string, userId: string) {
  await getConversation(db, conversationId, userId);
  const now = new Date().toISOString();
  await db.collection("conversations").doc(conversationId).set({
    unreadUserIds: FieldValue.arrayRemove(userId),
    [`lastReadAt.${userId}`]: now,
    updatedAt: now
  }, { merge: true });
  return { conversationId, readAt: now };
}

function messageError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}
