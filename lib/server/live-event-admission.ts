import { createHash, randomBytes } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { wakeLiveEventJob } from "@/lib/server/live-event-job-outbox";
import {readLiveEventUpgrade,convertLiveEventAdmission} from "@/lib/server/live-event-upgrades";
import { assertAvailableSpaces, assertEventBookingOpen, assertEventCheckInOpen, eventOptions, eventTime, LiveEventPolicyError, type LiveEventRecord } from "@/lib/live-event-policy";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export type EventActor = { uid: string; email?: string; emailVerified?: boolean; managementAuthorized?: boolean; guestSession?: boolean };

/** Read the canonical challenge and its operational projection in the same transaction. */
export async function readLiveEvent(db: Firestore, transaction: Transaction, id: string) {
  const ref = db.collection("liveEvents").doc(id), challengeRef = db.collection("challenges").doc(id);
  const [projection, challenge] = await Promise.all([transaction.get(ref), transaction.get(challengeRef)]);
  if (!projection.exists) throw new LiveEventPolicyError("EVENT_NOT_FOUND", 404);
  if (challenge.exists && challenge.data()?.isLiveEvent !== true) throw new LiveEventPolicyError("EVENT_NOT_FOUND", 404);
  // Challenge content/approval always wins; operational counters remain on liveEvents.
  const event: LiveEventRecord = { ...projection.data(), ...(challenge.exists ? challenge.data() : {}), id };
  for (const key of ["audienceCount", "competitorCount", "audienceReserved", "competitorReserved", "checkInCount"]) event[key] = projection.data()?.[key] ?? 0;
  return { ref, challengeRef, event, challengeExists: challenge.exists };
}

export async function assertCheckInManager(db: Firestore, tx: Transaction, id: string, event: LiveEventRecord, actor: EventActor, now = Date.now()) {
  const staff = await tx.get(db.collection("liveEventStaff").doc(hash(`${id}:${actor.uid}`)));
  const staffData = staff.data();
  const activeStaff = staff.exists && staffData?.eventId === id && staffData?.userId === actor.uid && staffData?.status === "active" && staffData?.permission === "check_in" && Number.isFinite(eventTime(staffData?.expiresAt)) && now < eventTime(staffData?.expiresAt);
  const official = Boolean(event.organizationOwnerId || event.officialChallenge || event.ownershipType === "challenge_suite_official");
  const owner = !official && [event.creatorId, event.hostId, event.userId].includes(actor.uid);
  if (!actor.managementAuthorized && !owner && !activeStaff) throw new LiveEventPolicyError("EVENT_STAFF_REQUIRED", 403);
}

/** Free registration only. Paid reservations must enter the provider-backed checkout path. */
export async function bookFreeLiveEvent(db: Firestore, input: { eventId: string; actor: EventActor; names: string[]; kind: "audience" | "competitor"; requestKey: string; announcementEmailConsent?: boolean;upgradeTicketId?:string;personalAdmissionConfirmed?:boolean; now?: number }) {
  const now = input.now ?? Date.now();
  if (!input.actor.emailVerified || !input.actor.email) throw new LiveEventPolicyError("VERIFIED_EMAIL_REQUIRED", 403);
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestKey)) throw new LiveEventPolicyError("BOOKING_REFERENCE_REQUIRED", 422);
  const names = input.names.map(name => text(name));
  if (input.kind === "competitor" && input.actor.guestSession === true) throw new LiveEventPolicyError("ACCOUNT_REQUIRED", 403);
  if (names.some(name => name.length < 1 || name.length > 160)) throw new LiveEventPolicyError("GUEST_NAME_REQUIRED", 422);
  const bookingId = hash(`${input.eventId}:${input.actor.uid}:${input.requestKey}`);
  const bookingRef = db.collection("liveEventBookings").doc(bookingId);
  const registrationRef = db.collection("liveEventRegistrations").doc(`${input.eventId}_${input.actor.uid}`);
  const tokens = names.map(() => randomBytes(32).toString("base64url"));
  return db.runTransaction(async tx => {
    const [{ ref, event }, previous, registration] = await Promise.all([readLiveEvent(db, tx, input.eventId), tx.get(bookingRef), tx.get(registrationRef)]);
    const fingerprint = hash(JSON.stringify({ names, kind: input.kind,...(input.upgradeTicketId?{upgradeTicketId:input.upgradeTicketId}:{}) }));
    if (previous.exists) {
      if (previous.data()?.fingerprint !== fingerprint) throw new LiveEventPolicyError("BOOKING_REFERENCE_REUSED");
      if (previous.data()?.status !== "confirmed" || !Array.isArray(previous.data()?.ticketIds) || !previous.data()?.ticketIds.length) throw new LiveEventPolicyError("BOOKING_PAYMENT_NOT_CONFIRMED");
      return { bookingId, ticketIds: previous.data()?.ticketIds as string[], repeated: true };
    }
    assertEventBookingOpen(event, now);
    const account = input.actor.guestSession ? null : await tx.get(db.collection("users").doc(input.actor.uid));
    const accountData = account?.data() ?? {};
    if (["suspended", "disabled", "banned", "restricted", "deleted"].includes(String(accountData.accountStatus ?? "")) || input.kind === "competitor" && String(accountData.role ?? accountData.accountType ?? "").toLowerCase() === "sponsor") throw new LiveEventPolicyError("PARTICIPATION_NOT_ELIGIBLE", 403);
    const options = eventOptions(event);
    if(input.upgradeTicketId&&(input.kind!=="competitor"||input.actor.guestSession||!account?.exists||accountData.disabled===true||accountData.suspended===true))throw new LiveEventPolicyError("ACCOUNT_REQUIRED",403);
    const upgrade=input.upgradeTicketId?await readLiveEventUpgrade(db,tx,{eventId:input.eventId,userId:input.actor.uid,ticketId:input.upgradeTicketId,personalAdmissionConfirmed:input.personalAdmissionConfirmed===true}):null;
    if (Number(event.registrationCount ?? event.attendeeCount ?? 0) > 0 && event.audienceCount === 0 && event.competitorCount === 0) throw new LiveEventPolicyError("CAPACITY_RECONCILIATION_REQUIRED");
    if ([event.creatorId, event.hostId, event.userId].includes(input.actor.uid)) throw new LiveEventPolicyError("HOST_CANNOT_REGISTER", 403);
    if (input.kind === "competitor" && registration.exists && !["cancelled", "refunded"].includes(String(registration.data()?.status))) throw new LiveEventPolicyError("ALREADY_COMPETING");
    if(input.kind==="competitor"){
      const pending=await tx.get(db.collection("liveEventBookings").where("eventId","==",input.eventId).where("userId","==",input.actor.uid).limit(101));
      if(pending.size>100)throw new LiveEventPolicyError("BOOKING_RECONCILIATION_REQUIRED");
      if(pending.docs.some(row=>row.data().kind==="competitor"&&["payment_pending","payment_review_required","refund_pending"].includes(String(row.data().status))))throw new LiveEventPolicyError("CHECKOUT_ALREADY_PENDING");
    }
    const admission = Number(options.ticketPrice ?? event.ticketPrice ?? event.price ?? 0);
    const entry = input.kind === "competitor" ? Number(options.competitionEntryFee ?? 0) : 0;
    if (![admission, entry].every(value => Number.isFinite(value) && value >= 0)) throw new LiveEventPolicyError("PAYMENT_CONFIGURATION_INVALID");
    if (!upgrade&&admission > 0 || entry > 0 || !upgrade&&options.ticketType === "paid_setup_required") throw new LiveEventPolicyError("PAID_BOOKING_UNAVAILABLE", 503);
    if(upgrade&&Number(event.audienceCount)<1)throw new LiveEventPolicyError("CAPACITY_RECONCILIATION_REQUIRED");
    assertAvailableSpaces(event, input.kind, names.length);
    const createdAt = new Date(now).toISOString();
    const ticketIds = names.map((_, index) => hash(`${bookingId}:${index}`));
    // Credential and purchaser information remain server-only. Public presentation returns an allowlist.
    ticketIds.forEach((ticketId, index) => {
      tx.create(db.collection("liveEventTickets").doc(ticketId), {
        id: ticketId, eventId: input.eventId, bookingId, userId: input.actor.uid, guestName: names[index],
        kind: input.kind, status: "confirmed", credentialHash: hash(tokens[index]), credential: tokens[index],
        checkedInAt: null, createdAt, updatedAt: createdAt,...(upgrade?{admissionSourceTicketId:upgrade.ticket.id,admissionSourceBookingId:upgrade.booking.id}:{}),
      });
    });
    tx.create(bookingRef, { id: bookingId, eventId: input.eventId, userId: input.actor.uid, email: input.actor.email, guestSession: input.actor.guestSession === true, announcementEmailConsent: input.announcementEmailConsent === true, kind: input.kind, activeTicketCount:names.length, ticketIds, fingerprint, status: "confirmed", amountCents: 0, currency: "usd",quantity:names.length,admissionCents:0,competitionEntryCents:0,...(upgrade?{admissionSourceTicketId:upgrade.ticket.id,admissionSourceBookingId:upgrade.booking.id,personalAdmissionConfirmedAt:createdAt}:{}), admissionRefundPolicy: options.admissionRefundPolicy ?? "standard", bookedEventStartsAt: event.startsAt, createdAt });
    if (input.kind === "competitor") tx.set(registrationRef, { id: registrationRef.id, eventId: input.eventId, userId: input.actor.uid, fullName: names[0], kind: "competitor", ticketId: ticketIds[0], status: "confirmed", eligible: true, checkedInAt: null, createdAt });
    tx.update(ref, { [input.kind === "audience" ? "audienceCount" : "competitorCount"]: Number(event[input.kind === "audience" ? "audienceCount" : "competitorCount"]) + names.length,...(upgrade?{audienceCount:Number(event.audienceCount)-1}:{}), updatedAt: createdAt });
    tx.create(db.collection("liveEventEmailOutbox").doc(`booking_${bookingId}`), { eventId: input.eventId, bookingId, userId: input.actor.uid, status: "pending", type: "ticket_confirmation", createdAt });
    wakeLiveEventJob(db,tx,input.eventId,createdAt);
    if(upgrade){convertLiveEventAdmission(tx,upgrade,ticketIds[0],bookingId,createdAt);tx.create(db.collection("auditLogs").doc(`live_upgrade_${bookingId}`),{actorId:input.actor.uid,action:"live_event.admission_upgraded",eventId:input.eventId,originalTicketId:upgrade.ticket.id,originalBookingId:upgrade.booking.id,competitionBookingId:bookingId,participantPassId:ticketIds[0],personalAdmissionConfirmed:true,additionalPaymentCents:0,createdAt});}
    return { bookingId, ticketIds, repeated: false };
  });
}

export async function inspectLiveEventTicket(db: Firestore, input: { eventId: string; actor: EventActor; ticketId: string; credential?: string; now?: number; confirm: boolean; competitorIdentityConfirmed?: boolean; reason?: string }) {
  if (!/^[a-f0-9]{64}$/.test(input.ticketId)) throw new LiveEventPolicyError("TICKET_NOT_VERIFIED", 422);
  const ticketRef = db.collection("liveEventTickets").doc(input.ticketId);
  return db.runTransaction(async tx => {
    const [{ event, ref }, ticket] = await Promise.all([readLiveEvent(db, tx, input.eventId), tx.get(ticketRef)]);
    await assertCheckInManager(db, tx, input.eventId, event, input.actor, input.now ?? Date.now());
    assertEventCheckInOpen(event, input.now ?? Date.now());
    const data = ticket.data() ?? {};
    if (!ticket.exists || data.eventId !== input.eventId || !["confirmed", "checked_in"].includes(String(data.status))) throw new LiveEventPolicyError("TICKET_NOT_VERIFIED", 422);
    // A manual lookup is permitted to current event staff; scanning must verify the credential.
    if (input.credential !== undefined && hash(input.credential) !== data.credentialHash) throw new LiveEventPolicyError("TICKET_NOT_VERIFIED", 422);
    const registrationRef = db.collection("liveEventRegistrations").doc(`${input.eventId}_${String(data.userId)}`);
    const registration = data.kind === "competitor" ? await tx.get(registrationRef) : null;
    const retainedAdmission=data.kind==="competitor"&&data.admissionRetained===true&&Boolean(data.competitionWithdrawnAt)&&registration?.data()?.status==="withdrawn"&&registration.data()?.withdrawnAt===data.competitionWithdrawnAt&&registration.data()?.eligible===false;
    if (data.kind === "competitor" && (!registration?.exists || registration.data()?.ticketId !== ticket.id || !retainedAdmission&&(registration.data()?.eligible !== true || !["confirmed", "checked_in"].includes(String(registration.data()?.status))))) throw new LiveEventPolicyError("COMPETITOR_NOT_ELIGIBLE");
    if (input.confirm && !data.checkedInAt) {
      if (data.kind === "competitor" && input.competitorIdentityConfirmed !== true) throw new LiveEventPolicyError("COMPETITOR_IDENTITY_REQUIRED", 422);
      const checkedInAt = new Date(input.now ?? Date.now()).toISOString();
      tx.update(ticketRef, { status: "checked_in", checkedInAt, checkedInBy: input.actor.uid, updatedAt: checkedInAt });
      if (data.kind === "competitor"&&!retainedAdmission) tx.update(registrationRef, { status: "checked_in", checkedInAt, updatedAt: checkedInAt });
      tx.update(ref, { checkInCount: Number(event.checkInCount) + 1, updatedAt: checkedInAt });
      tx.create(db.collection("auditLogs").doc(), { actorId: input.actor.uid, action: "live_event.arrival_confirmed", targetId: ticket.id, eventId: input.eventId, competitorIdentityConfirmed: data.kind === "competitor", createdAt: checkedInAt });
    }
    return { ticketId: ticket.id, guestName: data.guestName, kind: data.kind, competitionWithdrawn:retainedAdmission, competitorId: data.kind === "competitor" ? data.userId : null, alreadyCheckedIn: Boolean(data.checkedInAt), confirmed: input.confirm, status: input.confirm ? "checked_in" : data.status };
  });
}

/** Default-denied Firestore ticket records are never returned wholesale. */
export function publicTicket(data: LiveEventRecord) {
  return { id: data.id, eventId: data.eventId, guestName: data.guestName, kind: data.kind, status: data.status, competitionWithdrawn:Boolean(data.competitionWithdrawnAt), checkedInAt: data.checkedInAt ?? null };
}
