import { FieldPath, Filter, type Firestore, type Transaction } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { notificationDestination } from "@/lib/notification-navigation";
import { reconciledNotificationPreferences, notificationEnabled, notificationHistoryCutoff, notificationPolicy } from "@/lib/notification-policy";

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

/** Only a delivery intent joins the business commit; actual inbox delivery and
 * preference evaluation happen separately, without shared counters or fanout. */
export function queueInAppNotification(db: Firestore, tx: Transaction, input: { eventId: string; userId: string; type: string; title: string; message: string; actionUrl: string; createdAt: string }) {
  if (!input.userId || input.userId.includes("/")) throw new Error("Notification recipient is invalid.");
  const id = createHash("sha256").update(`${input.userId}\0${input.eventId}`).digest("hex");
  tx.create(db.collection("notificationDeliveryOutbox").doc(id), { status: "pending", legacyId: null, createdAt: input.createdAt, updatedAt: input.createdAt, notification: { id, userId: input.userId, type: input.type, ...notificationPolicy(input.type), title: input.title, message: input.message, body: input.message, actionUrl: notificationDestination(input), status: "unread", read: false, readAt: null, createdAt: input.createdAt, delivery: { inApp: true, email: false, push: false } } });
}

export async function createNotification(db: Firestore, input: CreateNotificationInput) {
  const idempotencyKey = safeId(input.idempotencyKey);
  if (!input.userId || input.userId.includes("/")) throw new Error("Notification recipient is invalid.");
  const ref = idempotencyKey ? db.collection("notifications").doc(createHash("sha256").update(`${input.userId}\0${input.idempotencyKey}`).digest("hex")) : db.collection("notifications").doc();
  const createdAt = nowIso();
  const notification = {
    id: ref.id,
    userId: input.userId,
    accountType: input.accountType ?? null,
    audience: input.audience ?? null,
    type: safeText(input.type, "general", 120),
    ...notificationPolicy(input.type),
    title: safeText(input.title, "Notification", 160),
    message: safeText(input.message ?? input.body, "Notification update", 1000),
    body: safeText(input.body ?? input.message, "Notification update", 1000),
    status: input.status ?? "unread",
    priority: input.priority ?? "normal",
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? input.targetId ?? null,
    targetId: input.targetId ?? input.entityId ?? null,
    actionUrl: notificationDestination(input),
    read: false,
    readAt: null,
    archivedAt: null,
    delivery: { inApp: true, email: false, push: false },
    metadata: input.metadata ?? {},
    createdAt,
    updatedAt: createdAt
  };
  const deliveryRef = db.collection("notificationDeliveryOutbox").doc(ref.id);
  try {
    await deliveryRef.create({ notification, legacyId: idempotencyKey || null, status: "pending", createdAt, updatedAt: createdAt });
  } catch (error) {
    if ((error as { code?: number })?.code !== 6) throw error;
  }
  return deliverNotificationRecord(db, ref.id);
}

async function deliverNotificationRecord(db: Firestore, id: string) {
  const deliveryRef = db.collection("notificationDeliveryOutbox").doc(id);
  try { return await db.runTransaction(async tx => {
    const source = await tx.get(deliveryRef);
    if (!source.exists) throw new Error("Notification source is unavailable.");
    const { notification, legacyId } = source.data()! as { notification: Record<string, unknown> & { userId: string; type: string }; legacyId: string | null };
    const ref = db.collection("notifications").doc(id);
    if (source.data()?.status === "skipped_optional_preference") return { ...notification, id, deliveryStatus: "skipped_optional_preference" };
    const refs = [ref, db.collection("notificationPreferences").doc(notification.userId), ...(legacyId ? [db.collection("notifications").doc(legacyId)] : [])];
    const [existing, preferences, legacy] = await tx.getAll(...refs);
    const sponsorPreferences = await tx.get(db.collection("sponsorNotificationPreferences").doc(notification.userId));
    const complete = (status: string) => { if (!["created", "already_exists", "skipped_optional_preference"].includes(String(source.data()?.status))) tx.update(deliveryRef, { status, updatedAt: nowIso() }); };
    if (existing.exists) { complete("already_exists"); return { ...notification, ...existing.data(), id, deliveryStatus: "already_exists" }; }
    // Preserve earlier IDs/read status when the same recipient already received
    // an old-format event. A shared legacy key never authorizes overwriting it.
    if (legacy?.exists && legacy.data()?.userId === notification.userId) { complete("already_exists"); return { ...notification, ...legacy.data(), id: legacy.id, deliveryStatus: "already_exists" }; }
    if (!notificationEnabled(notification.type, reconciledNotificationPreferences(preferences.data() ?? {}, sponsorPreferences.data()?.preferences ?? {}))) { complete("skipped_optional_preference"); return { ...notification, id, deliveryStatus: "skipped_optional_preference" }; }
    tx.create(ref, notification);
    complete("created");
    return { ...notification, id, deliveryStatus: "created" };
  }); } catch {
    await deliveryRef.set({ status: "retry_pending", failure: "inbox_delivery_incomplete", updatedAt: nowIso() }, { merge: true }).catch(() => undefined);
    return { id, deliveryStatus: "pending_recovery" };
  }
}

/** Uses the existing inbox; this outbox is delivery state, never a second inbox. */
export async function recoverNotificationDeliveries(db: Firestore) {
  const state = db.collection("notificationRecoveryState").doc("inbox"), cursor = (await state.get()).data()?.cursor;
  const base = db.collection("notificationDeliveryOutbox").where("status", "in", ["pending", "retry_pending"]).orderBy(FieldPath.documentId());
  let rows = await (typeof cursor === "string" ? base.startAfter(cursor) : base).limit(50).get();
  if (rows.empty && cursor) rows = await base.limit(50).get();
  if (!rows.empty) await state.set({ cursor: rows.docs.at(-1)!.id, updatedAt: nowIso() });
  const outcomes = [];
  for (const row of rows.docs) outcomes.push(await deliverNotificationRecord(db, row.id));
  const normalState = db.collection("notificationRecoveryState").doc("normal_sources"), normalCursor = (await normalState.get()).data()?.cursor;
  const normalBase = db.collection("normalNotificationOutbox").where("status", "==", "pending").orderBy(FieldPath.documentId());
  let normalPending = await (typeof normalCursor === "string" ? normalBase.startAfter(normalCursor) : normalBase).limit(25).get();
  if (normalPending.empty && normalCursor) normalPending = await normalBase.limit(25).get();
  if (!normalPending.empty) await normalState.set({ cursor: normalPending.docs.at(-1)!.id, updatedAt: nowIso() });
  const { deliverNormalNotificationOutbox } = await import("@/lib/server/normal-notifications");
  for (const challengeId of new Set(normalPending.docs.map(row => String(row.data().challengeId)).filter(id => id && !id.includes("/")))) await deliverNormalNotificationOutbox(db, challengeId).catch(() => undefined);
  const { recoverVoterAudiences } = await import("@/lib/server/voter-notifications");
  await recoverVoterAudiences(db).catch(() => undefined);
  const { deliverAdminActionNotifications } = await import("@/lib/server/admin-notifications");
  await deliverAdminActionNotifications(db).catch(() => undefined);
  return { processed: rows.size, pendingRecovery: outcomes.filter(row => row.deliveryStatus === "pending_recovery").length };
}

export async function listUserNotifications(db: Firestore, userId: string, limit = 50) {
  return (await pageUserNotifications(db, userId, { limit })).notifications;
}

export function unreadNotification(value: { status?: unknown; read?: unknown }) {
  return value.status !== "archived" && (value.status === "unread" || value.read === false);
}

function notificationView(id: string, data: Record<string, unknown>) {
  const notification = { ...data, id } as StoredNotification;
  return { id, title: safeText(notification.title, "Notification", 160), message: safeText(notification.message ?? notification.body, "An update is available.", 1000),
    createdAt: String(notification.createdAt ?? ""), read: !unreadNotification(notification), status: unreadNotification(notification) ? "unread" : "read", priority: notification.priority === "high" ? "high" : "normal",
    ...notificationPolicy(String(notification.type ?? "")), actionUrl: notificationDestination({ type: notification.type, entityType: notification.entityType, entityId: notification.entityId, targetId: notification.targetId, actionUrl: notification.actionUrl, metadata: notification.metadata }) };
}

export async function pageUserNotifications(db: Firestore, userId: string, options: { limit?: number; cursor?: string | null; unread?: boolean; cutoff?: string; category?: string } = {}) {
  const limit = Math.min(50, Math.max(1, options.limit ?? 25));
  const cutoff = options.cutoff ?? notificationHistoryCutoff();
  const base = db.collection("notifications").where("userId", "==", userId).where("createdAt", ">=", cutoff).orderBy("createdAt", "desc");
  const unread = Filter.or(Filter.where("status", "==", "unread"), Filter.where("read", "==", false));
  let query = (options.unread ? base.where(unread) : base).orderBy(FieldPath.documentId(), "desc");
  if (options.cursor) {
    if (options.cursor.includes("/") || options.cursor.length > 500) throw new Error("INVALID_NOTIFICATION_CURSOR");
    const anchor = await db.collection("notifications").doc(options.cursor).get();
    if (!anchor.exists || anchor.data()?.userId !== userId || String(anchor.data()?.createdAt ?? "") < cutoff) throw new Error("INVALID_NOTIFICATION_CURSOR");
    query = query.startAfter(anchor);
  }
  const notifications: ReturnType<typeof notificationView>[] = [];
  let nextCursor: string | null = null;
  // Legacy records need no rewrite to participate in category filters. Scan a
  // bounded chronological slice and return a continuation, never a partial
  // history disguised as a complete empty result.
  for (let scan = 0; scan < (options.category && options.category !== "all" ? 4 : 1); scan++) {
    const size = options.category && options.category !== "all" ? 50 : limit;
    const snapshot = await query.limit(size + 1).get();
    const rows = snapshot.docs.slice(0, size);
    let last = rows.at(-1);
    for (const row of rows) {
      if (row.data().status === "archived") continue;
      const item = notificationView(row.id, row.data());
      if (!options.category || options.category === "all" || item.category === options.category || options.category === "updates" && !item.essential) notifications.push(item);
      if (notifications.length >= limit) { last = row; break; }
    }
    const more = Boolean(last && (last.id !== rows.at(-1)?.id || snapshot.size > size));
    nextCursor = more ? last!.id : null;
    if (!more || notifications.length >= limit) break;
    query = query.startAfter(last!);
  }
  const [count, archived] = await Promise.all([base.where(unread).count().get(), base.where("status", "==", "archived").where("read", "==", false).count().get()]);
  return { notifications, unreadCount: Math.max(0, count.data().count - archived.data().count), nextCursor, retentionCutoff: cutoff };
}

export async function markNotificationRead(db: Firestore, userId: string, notificationId: string) {
  const ref = db.collection("notifications").doc(notificationId);
  const updatedAt = nowIso();
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.userId !== userId) return null;
    if (snap.data()?.status !== "archived" && unreadNotification(snap.data() ?? {})) tx.update(ref, { status: "read", read: true, readAt: updatedAt, updatedAt });
    return { id: notificationId, status: "read", read: true, readAt: snap.data()?.readAt ?? updatedAt };
  });
}

export async function markAllNotificationsRead(db: Firestore, userId: string, cursor?: string | null, before = nowIso()) {
  let query = db.collection("notifications").where("userId", "==", userId).orderBy(FieldPath.documentId());
  if (cursor) {
    if (cursor.includes("/") || cursor.length > 500) throw new Error("INVALID_NOTIFICATION_CURSOR");
    const anchor = await db.collection("notifications").doc(cursor).get();
    if (!anchor.exists || anchor.data()?.userId !== userId) throw new Error("INVALID_NOTIFICATION_CURSOR");
    query = query.startAfter(anchor);
  }
  const notifications = await query.limit(200).get();
  const batch = db.batch();
  const updatedAt = nowIso();
  const unread = notifications.docs.filter(doc => unreadNotification(doc.data()) && String(doc.data().createdAt ?? "") <= before);
  unread.forEach(doc => batch.update(doc.ref, { status: "read", read: true, readAt: doc.data().readAt ?? updatedAt, updatedAt }, { lastUpdateTime: doc.updateTime }));
  await batch.commit();
  return { updated: unread.length, readAt: updatedAt, before, nextCursor: notifications.size === 200 ? notifications.docs.at(-1)!.id : null };
}
