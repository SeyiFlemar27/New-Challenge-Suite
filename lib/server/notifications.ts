import type { Firestore } from "firebase-admin/firestore";

export async function createNotification(db: Firestore, input: { userId: string; type: string; title: string; body: string; targetId?: string }) {
  const ref = db.collection("notifications").doc();
  const notification = {
    id: ref.id,
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    targetId: input.targetId ?? null,
    read: false,
    createdAt: new Date().toISOString()
  };
  await ref.set(notification);
  return notification;
}
