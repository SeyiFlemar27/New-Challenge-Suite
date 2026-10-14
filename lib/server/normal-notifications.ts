import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";
export async function deliverNormalNotificationOutbox(db: Firestore, challengeId: string) {
  const events = await db.collection("normalNotificationOutbox").where("challengeId", "==", challengeId).get();
  let delivered = 0;
  for (const event of events.docs) {
    const count = await db.runTransaction(async transaction => {
      const current = await transaction.get(event.ref);
      const data = current.data() ?? {};
      if (!current.exists || data.status === "completed") return 0;
      let query = db.collection("challengeParticipants").where("challengeId", "==", challengeId).orderBy(FieldPath.documentId()).limit(100);
      if (typeof data.cursor === "string") query = query.startAfter(data.cursor);
      const participants = await transaction.get(query);
      const recipients = new Set(participants.docs.map(doc => String(doc.data().userId)).filter(Boolean));
      if (!data.cursor && typeof data.creatorId === "string" && data.creatorId) recipients.add(data.creatorId);
      const refs = [...recipients].map(userId => ({ userId, ref: db.collection("notifications").doc(deterministicId("normal_notice", event.id, userId)) }));
      const existing = await Promise.all(refs.map(item => transaction.get(item.ref)));
      const now = new Date().toISOString();
      refs.forEach((item, index) => {
        if (!existing[index].exists) transaction.create(db.collection("normalEmailOutbox").doc(item.ref.id), { challengeId, userId: item.userId, sourceEventId: event.id, title: data.title, message: data.message, status: "pending", createdAt: now });
        if (!existing[index].exists) transaction.create(item.ref, { id: item.ref.id, userId: item.userId, type: data.type, title: data.title, message: data.message, body: data.message, status: "unread", read: false, actionUrl: `/challenges/${challengeId}`, targetId: challengeId, entityType: "challenge", entityId: challengeId, createdAt: now, updatedAt: now, delivery: { inApp: true, email: false, push: false }, metadata: { sourceEventId: event.id, effectiveVotingStartsAt: data.effectiveVotingStartsAt ?? null, effectiveVotingEndsAt: data.effectiveVotingEndsAt ?? null } });
      });
      transaction.update(event.ref, { cursor: participants.docs.at(-1)?.id ?? data.cursor ?? null, status: participants.size < 100 ? "completed" : "pending", emailDeliveryStatus: "provider_not_configured", updatedAt: now });
      return refs.filter((_, index) => !existing[index].exists).length;
    });
    delivered += count;
  }
  return { delivered };
}
