import { createHash } from "node:crypto";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { eventTime, type LiveEventRecord } from "@/lib/live-event-policy";

export function wakeLiveEventJob(db: Firestore, tx: Transaction, eventId: string, runAt: string) {
  tx.set(db.collection("liveEventJobs").doc(`event_${eventId}`), { eventId, type: "event", status: "pending", dispatchState: "pending", version: FieldValue.increment(1), runAt, updatedAt: new Date().toISOString() }, { merge: true });
}
/** Called in the approval/material-change transaction; no external schedule is activated here. */
export function seedLiveEventJobs(db: Firestore, tx: Transaction, eventId: string, event: LiveEventRecord, now = Date.now()) {
  const createdAt = new Date(now).toISOString();
  wakeLiveEventJob(db, tx, eventId, createdAt);
  const start = eventTime(event.startsAt);
  if (!Number.isFinite(start)) return;
  const configured = Array.isArray(event.liveEventReminderHours) ? event.liveEventReminderHours : [24, 1];
  for (const hours of [24,1].filter(value => configured.includes(value))) {
    const runAt = new Date(start - hours * 3600000).toISOString();
    if (eventTime(runAt) <= now) continue;
    const id = `reminder_${createHash("sha256").update(`${eventId}:${start}:${hours}`).digest("hex")}`;
    tx.set(db.collection("liveEventAnnouncements").doc(id), { id, eventId, actorId: "live_event_lifecycle", type: "reminder", sourceStartsAt: event.startsAt, title: `${String(event.title)} starts in ${hours === 24 ? "24 hours" : "1 hour"}`, message: "Your event is coming up. Open your ticket for the event time, venue and admission details.", audience: "all", runAt, status: "scheduled", cursor: null, createdAt, updatedAt: createdAt }, { merge: true });
    tx.set(db.collection("liveEventJobs").doc(`announcement_${id}`), { eventId, type: "announcement", subjectId: id, status: "pending", dispatchState: "pending", version: 1, runAt, createdAt, updatedAt: createdAt }, { merge: true });
  }
}
