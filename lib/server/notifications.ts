import type { Firestore } from "firebase-admin/firestore";

export type NotificationStatus = "unread" | "read" | "archived";
export type NotificationPriority = "low" | "normal" | "high";

export type CreateNotificationInput = {
  userId: string;
  accountType?: string | null;
  audience?: string | null;
  type: string;
  title: string;
  body?: string;
  message?: string;
  status?: NotificationStatus;
  priority?: NotificationPriority;
  entityType?: string | null;
  entityId?: string | null;
  targetId?: string | null;
  actionUrl?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
};

type StoredNotification = {
  id: string;
  status?: string;
  read?: boolean;
  createdAt?: string;
  [key: string]: unknown;
};

function nowIso() {
  return new Date().toISOString();
}

function safeText(value: unknown, fallback = "", max = 500) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function safeId(value: unknown) {
  return safeText(value, "", 160).replace(/[^a-zA-Z0-9_.:-]/g, "_");
}

function safeActionUrl(value: unknown) {
  const path = safeText(value, "", 500);
  return path.startsWith("/") && !path.startsWith("//") ? path : null;
}

export async function createNotification(db: Firestore, input: CreateNotificationInput) {
  const idempotencyKey = safeId(input.idempotencyKey);
  const ref = idempotencyKey ? db.collection("notifications").doc(idempotencyKey) : db.collection("notifications").doc();
  const createdAt = nowIso();
  const notification = {
    id: ref.id,
    userId: input.userId,
    accountType: input.accountType ?? null,
    audience: input.audience ?? null,
    type: safeText(input.type, "general", 120),
    title: safeText(input.title, "Notification", 160),
    message: safeText(input.message ?? input.body, "Notification update", 1000),
    body: safeText(input.body ?? input.message, "Notification update", 1000),
    status: input.status ?? "unread",
    priority: input.priority ?? "normal",
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? input.targetId ?? null,
    targetId: input.targetId ?? input.entityId ?? null,
    actionUrl: safeActionUrl(input.actionUrl),
    read: false,
    readAt: null,
    archivedAt: null,
    delivery: { inApp: true, email: false, push: false },
    metadata: input.metadata ?? {},
    createdAt,
    updatedAt: createdAt
  };
  await ref.set(notification, { merge: true });
  return notification;
}

export async function listUserNotifications(db: Firestore, userId: string, limit = 50) {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const snap = await db.collection("notifications").where("userId", "==", userId).limit(100).get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as StoredNotification))
    .sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")))
    .slice(0, safeLimit);
}

export async function markNotificationRead(db: Firestore, userId: string, notificationId: string) {
  const ref = db.collection("notifications").doc(notificationId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.userId !== userId) return null;
  const updatedAt = nowIso();
  await ref.set({ status: "read", read: true, readAt: updatedAt, updatedAt }, { merge: true });
  return { id: notificationId, status: "read", read: true, readAt: updatedAt };
}

export async function markAllNotificationsRead(db: Firestore, userId: string) {
  const notifications = await db.collection("notifications").where("userId", "==", userId).limit(100).get();
  const batch = db.batch();
  const updatedAt = nowIso();
  const unread = notifications.docs.filter((doc) => doc.data().status === "unread" || doc.data().read === false);
  unread.forEach((doc) => batch.set(doc.ref, { status: "read", read: true, readAt: updatedAt, updatedAt }, { merge: true }));
  await batch.commit();
  return { updated: unread.length, readAt: updatedAt };
}
