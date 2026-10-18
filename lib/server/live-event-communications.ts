import { createHash, randomUUID } from "node:crypto";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { eventKind, eventTime, LiveEventPolicyError } from "@/lib/live-event-policy";
import { readLiveEvent } from "@/lib/server/live-event-admission";
import { sendEmail, type EmailMessage } from "@/lib/server/email";
import { seedLiveEventJobs, wakeLiveEventJob } from "@/lib/server/live-event-job-outbox";
import {guestEventEmailAllowed,guestEventPreferenceId} from "@/lib/server/live-event-guest-preferences";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
type Delivery = { send(message: EmailMessage): Promise<void>; origin: string };

/** Authorization is established by the same event-management boundary as announcements. */
export async function configureLiveEventReminders(db: Firestore, input: {eventId: string; actorId: string; hours: number[]; now?: number}) {
  if (!Array.isArray(input.hours) || input.hours.length > 2 || input.hours.some(value => ![1,24].includes(value)) || new Set(input.hours).size !== input.hours.length) throw new LiveEventPolicyError("REMINDER_SETTINGS_INVALID", 422);
  return db.runTransaction(async tx => {
    const {event,ref,challengeRef,challengeExists} = await readLiveEvent(db,tx,input.eventId);
    const now = input.now ?? Date.now();
    if (event.eventApprovalStatus !== "approved" || ["cancelled","completed","deleted","rejected"].includes(String(event.status)) || eventTime(event.startsAt) <= now) throw new LiveEventPolicyError("REMINDER_SETTINGS_UNAVAILABLE");
    const hours = [...input.hours].sort((a,b)=>b-a), iso = new Date(now).toISOString();
    const patch = {liveEventReminderHours: hours, updatedAt: iso};
    tx.update(ref,patch); if(challengeExists)tx.update(challengeRef,patch);
    seedLiveEventJobs(db,tx,input.eventId,{...event,...patch},now);
    tx.create(db.collection("auditLogs").doc(),{actorId:input.actorId,action:"live_event.reminders_changed",eventId:input.eventId,before:{hours:event.liveEventReminderHours??[24,1]},after:{hours},createdAt:iso});
    return {hours};
  });
}

/** Caller has current event-management authorization. Recipients are never supplied by the client. */
export async function scheduleLiveEventAnnouncement(db: Firestore, input: { eventId: string; actorId: string; title: string; message: string; audience: "all" | "audience" | "competitors"; runAt: string; requestKey: string; confirmed: boolean; now?: number }) {
  const now = input.now ?? Date.now(), runAt = eventTime(input.runAt);
  if (!input.confirmed || !/^[A-Za-z0-9_-]{8,100}$/.test(input.requestKey) || input.title.trim().length < 1 || input.title.length > 160 || input.message.trim().length < 1 || input.message.length > 4000 || !Number.isFinite(runAt) || runAt < now - 60000 || !["all", "audience", "competitors"].includes(input.audience)) throw new LiveEventPolicyError("ANNOUNCEMENT_INVALID", 422);
  const id = hash(`${input.eventId}:${input.requestKey}`), ref = db.collection("liveEventAnnouncements").doc(id);
  const fingerprint = hash(JSON.stringify({ title: input.title, message: input.message, audience: input.audience, runAt: input.runAt }));
  return db.runTransaction(async tx => {
    const [{ event }, previous] = await Promise.all([readLiveEvent(db, tx, input.eventId), tx.get(ref)]);
    if (previous.exists) { if (previous.data()?.fingerprint !== fingerprint || previous.data()?.actorId !== input.actorId) throw new LiveEventPolicyError("ANNOUNCEMENT_REFERENCE_REUSED"); return { id, repeated: true }; }
    if (event.eventApprovalStatus !== "approved" || ["draft", "rejected", "deleted"].includes(String(event.status)) || input.audience === "competitors" && eventKind(event) !== "physical_competition") throw new LiveEventPolicyError("ANNOUNCEMENT_UNAVAILABLE");
    const createdAt = new Date(now).toISOString();
    tx.create(ref, { id, eventId: input.eventId, actorId: input.actorId, title: input.title.trim(), message: input.message.trim(), audience: input.audience, runAt: input.runAt, fingerprint, status: "scheduled", cursor: null, createdAt, updatedAt: createdAt });
    tx.set(db.collection("liveEventJobs").doc(`announcement_${id}`), { eventId: input.eventId, type: "announcement", subjectId: id, status: "pending", dispatchState: "pending", version: 1, runAt: input.runAt, createdAt, updatedAt: createdAt });
    wakeLiveEventJob(db,tx,input.eventId,createdAt);
    tx.create(db.collection("auditLogs").doc(), { actorId: input.actorId, action: "live_event.announcement_scheduled", eventId: input.eventId, targetId: id, after: { title: input.title.trim(), audience: input.audience, runAt: input.runAt }, createdAt });
    return { id, repeated: false };
  });
}

/** Bounded, resumable fanout; no arbitrary address list, duplicate recipient delivery or leaked guest records. */
export async function expandLiveEventAnnouncement(db: Firestore, id: string, now = Date.now()) {
  const ref = db.collection("liveEventAnnouncements").doc(id);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref), notice = snap.data() ?? {};
    if (!snap.exists || ["queued","cancelled"].includes(String(notice.status)) || eventTime(notice.runAt) > now) return { queued: 0, complete: ["queued","cancelled"].includes(String(notice.status)) };
    const {event}=await readLiveEvent(db,tx,String(notice.eventId));
    const enabledHours = Array.isArray(event.liveEventReminderHours) ? event.liveEventReminderHours : [24,1];
    const reminderHours = (eventTime(notice.sourceStartsAt)-eventTime(notice.runAt))/3600000;
    if(event.status==="cancelled"||notice.type==="reminder"&&(!enabledHours.includes(reminderHours)||eventTime(notice.sourceStartsAt)!==eventTime(event.startsAt)||now>=eventTime(event.startsAt))){tx.update(ref,{status:"cancelled",reason:"event_schedule_changed_or_notice_stale"});return {queued:0,complete:true};}
    let query = db.collection("liveEventBookings").where("eventId", "==", notice.eventId).orderBy(FieldPath.documentId()).limit(50);
    if (typeof notice.cursor === "string") query = query.startAfter(notice.cursor);
    const bookings = await tx.get(query);
    const audienceSnapshotAt = notice.audienceSnapshotAt ?? new Date(now).toISOString();
    const eligible = bookings.docs.filter(row => row.data().status === "confirmed" && row.data().activeTicketCount !== 0 && eventTime(row.data().confirmedAt ?? row.data().createdAt) <= eventTime(audienceSnapshotAt) && (notice.audience === "all" || (notice.audience === "competitors" ? row.data().kind === "competitor" : row.data().kind === "audience")));
    const recipients = [...new Map(eligible.map(row => [String(row.data().email).toLowerCase(), row])).values()];
    const targets = await Promise.all(recipients.map(async row => {
      const value = row.data(), outbox = db.collection("liveEventEmailOutbox").doc(`announcement_${id}_${hash(String(value.email).toLowerCase())}`);
      const [previous, preferences] = await Promise.all([tx.get(outbox), tx.get(db.collection("notificationPreferences").doc(value.guestSession?guestEventPreferenceId(String(notice.eventId),String(value.userId)):String(value.userId)))]);
      const emailAllowed = value.guestSession ? guestEventEmailAllowed(value,preferences.data(),String(notice.eventId)) : preferences.data()?.email === true && preferences.data()?.events !== false;
      return { row, value, outbox, previous, emailAllowed };
    }));
    const iso = new Date(now).toISOString(); let queued = 0;
    for (const target of targets) {
      if (target.previous.exists) continue;
      tx.create(target.outbox, { eventId: notice.eventId, bookingId: target.row.id, userId: target.value.userId, type: "announcement", announcementId: id, title: notice.title, message: notice.message, status: target.emailAllowed ? "pending" : "skipped", reason: target.emailAllowed ? null : "email_preference_not_enabled", createdAt: iso });
      if (!target.value.guestSession) tx.set(db.collection("notifications").doc(`live_announcement_${id}_${target.value.userId}`), { userId: target.value.userId, type: "live_event_announcement", title: notice.title, message: notice.message, actionUrl: `/live-events/${notice.eventId}`, read: false, createdAt: iso });
      queued++;
    }
    const complete = bookings.size < 50;
    tx.update(ref, { cursor: bookings.docs.at(-1)?.id ?? notice.cursor ?? null, audienceSnapshotAt, status: complete ? "queued" : "processing", updatedAt: iso });
    return { queued, complete };
  });
}

/** Provider acceptance is recorded separately from inbox delivery. Disabled without explicit configuration. */
export async function deliverLiveEventEmail(db: Firestore, eventId: string, adapter?: Delivery) {
  if (!adapter && process.env.LIVE_EVENT_EMAIL_DELIVERY_ENABLED !== "true") return { enabled: false, accepted: 0 };
  const delivery = adapter ?? { send: sendEmail, origin: process.env.NEXT_PUBLIC_APP_URL ?? "" };
  const origin = new URL(delivery.origin);
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) throw new LiveEventPolicyError("EMAIL_ORIGIN_INVALID", 503);
  const outbox = await db.collection("liveEventEmailOutbox").where("eventId", "==", eventId).where("status", "in", ["pending", "retry_pending", "sending"]).limit(25).get();
  let accepted = 0;
  for (const row of outbox.docs.filter(row => !["accepted", "skipped", "review_required"].includes(String(row.data().status))).slice(0, 25)) {
    const token = randomUUID(), now = Date.now();
    const claim = await db.runTransaction(async tx => {
      const [latest, { event }] = await Promise.all([tx.get(row.ref), readLiveEvent(db, tx, eventId)]), value = latest.data() ?? {};
      if (!latest.exists || ["accepted", "skipped", "review_required"].includes(String(value.status)) || eventTime(value.nextAttemptAt) > now || value.status === "sending" && eventTime(value.leaseUntil) > now) return null;
      const bookingSnap = await tx.get(db.collection("liveEventBookings").doc(String(value.bookingId))), booking = bookingSnap.data() ?? {};
      const tickets = value.type === "ticket_confirmation" ? await tx.get(db.collection("liveEventTickets").where("bookingId", "==", bookingSnap.id).limit(21)) : null;
      const preferences = value.type === "announcement" ? await tx.get(db.collection("notificationPreferences").doc(booking.guestSession?guestEventPreferenceId(String(value.eventId),String(booking.userId)):String(booking.userId))) : null;
      const announcement=value.type==="announcement"&&typeof value.announcementId==="string"?await tx.get(db.collection("liveEventAnnouncements").doc(value.announcementId)):null;
      const notice=announcement?.data();
      if(notice?.type==="reminder"){
        const hours=(eventTime(notice.sourceStartsAt)-eventTime(notice.runAt))/3600000;
        const enabled=Array.isArray(event.liveEventReminderHours)?event.liveEventReminderHours:[24,1];
        if(!enabled.includes(hours)||eventTime(notice.sourceStartsAt)!==eventTime(event.startsAt)||now>=eventTime(event.startsAt)){tx.update(row.ref,{status:"skipped",reason:"reminder_disabled_or_schedule_changed",updatedAt:new Date(now).toISOString()});return null;}
      }
      if (!bookingSnap.exists || value.type!=="event_cancellation"&&(booking.status !== "confirmed" || booking.activeTicketCount === 0 || event.status === "cancelled") || value.type === "announcement" && (booking.guestSession ? !guestEventEmailAllowed(booking,preferences?.data(),String(value.eventId)) : preferences?.data()?.email !== true || preferences.data()?.events === false)) { tx.update(row.ref, { status: "skipped", reason: "recipient_or_registration_unavailable", updatedAt: new Date(now).toISOString() }); return null; }
      if (value.firstAttemptAt && now - eventTime(value.firstAttemptAt) >= 23 * 3600000) { tx.update(row.ref, { status: "review_required", reason: "provider_acceptance_requires_review" }); return null; }
      tx.update(row.ref, { status: "sending", token, leaseUntil: new Date(now + 300000).toISOString(), firstAttemptAt: value.firstAttemptAt ?? new Date(now).toISOString(), attempts: Number(value.attempts ?? 0) + 1 });
      return { value, booking, event, tickets: tickets?.docs.map(ticket => ticket.data()).filter(ticket => ticket.status === "confirmed") ?? [] };
    });
    if (!claim) continue;
    try {
      const ticketMessage = claim.value.type === "ticket_confirmation", title = ticketMessage ? `Your tickets for ${String(claim.event.title)}` : String(claim.value.title);
      const links = claim.tickets.map(ticket => ({ name: String(ticket.guestName), url: `${origin.origin}/live-events/${encodeURIComponent(eventId)}/ticket#${ticket.id}.${ticket.credential}` }));
      const message = ticketMessage ? `You're on the guest list for ${String(claim.event.title)}. Your tickets remain available even if this email is delayed. Present each unused ticket at the entrance.` : String(claim.value.message);
      await delivery.send({ to: String(claim.booking.email), subject: title.slice(0, 200), text: `${message}\n${links.map(link => `${link.name}: ${link.url}`).join("\n")}`, html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h1>Challenge Suite</h1><h2>${escape(title)}</h2><p style="white-space:pre-wrap">${escape(message)}</p>${links.map(link => `<p><a href="${escape(link.url)}">Open ${escape(link.name)}'s ticket</a></p>`).join("")}<p>Keep individual ticket links private. A used ticket cannot admit another guest.</p></div>`, idempotencyKey: `live-event-email-${row.id}` });
      await db.runTransaction(async tx => { const latest = await tx.get(row.ref); if (latest.data()?.token === token) tx.update(row.ref, { status: "accepted", providerAcceptedAt: new Date().toISOString(), recipientDeliveryVerified: false, leaseUntil: null }); });
      accepted++;
    } catch {
      await db.runTransaction(async tx => { const latest = await tx.get(row.ref); if (latest.data()?.token === token) tx.update(row.ref, { status: "retry_pending", reason: "provider_acceptance_unverified", nextAttemptAt: new Date(now + 300000).toISOString(), leaseUntil: null }); });
    }
  }
  return { enabled: true, accepted };
}
