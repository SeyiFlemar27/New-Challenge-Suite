import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { assertAvailableSpaces,assertEventBookingOpen, eventOptions, liveEventReservationWindow, LiveEventPolicyError } from "@/lib/live-event-policy";
import { readLiveEvent, type EventActor } from "@/lib/server/live-event-admission";
import { wakeLiveEventJob } from "@/lib/server/live-event-job-outbox";
import {readLiveEventUpgrade,readRestorableUpgrade,restoreLiveEventAdmission} from "@/lib/server/live-event-upgrades";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type ReservationInput = { eventId: string; actor: EventActor; names: string[]; kind: "audience" | "competitor"; requestKey: string; announcementEmailConsent?: boolean;upgradeTicketId?:string;personalAdmissionConfirmed?:boolean;newAdmissionConfirmed?:boolean; now?: number };

/** Reserves only inventory. It never confirms payment, creates tickets or credits earnings. */
export async function reserveLiveEventCheckout(db: Firestore, input: ReservationInput) {
  if (!input.actor.emailVerified || !input.actor.email) throw new LiveEventPolicyError("VERIFIED_EMAIL_REQUIRED", 403);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(input.requestKey)) throw new LiveEventPolicyError("BOOKING_REFERENCE_REQUIRED", 422);
  if (input.kind === "competitor" && input.actor.guestSession) throw new LiveEventPolicyError("ACCOUNT_REQUIRED", 403);
  const names = input.names.map(name => name.trim());
  if (names.some(name => !name || name.length > 160)) throw new LiveEventPolicyError("GUEST_NAME_REQUIRED", 422);
  const id = hash(`${input.eventId}:${input.actor.uid}:${input.requestKey}`);
  const ref = db.collection("liveEventBookings").doc(id);
  const fingerprint = hash(JSON.stringify({ names, kind: input.kind,...(input.upgradeTicketId?{upgradeTicketId:input.upgradeTicketId}:{}) }));
  return db.runTransaction(async tx => {
    const [{ event, ref: eventRef }, previous, registration, account] = await Promise.all([
      readLiveEvent(db, tx, input.eventId), tx.get(ref),
      tx.get(db.collection("liveEventRegistrations").doc(`${input.eventId}_${input.actor.uid}`)),
      input.actor.guestSession ? Promise.resolve(null) : tx.get(db.collection("users").doc(input.actor.uid)),
    ]);
    const now = input.now ?? Date.now();
    if (previous.exists) {
      const value = previous.data()!;
      if (value.fingerprint !== fingerprint || value.userId !== input.actor.uid || value.eventId !== input.eventId) throw new LiveEventPolicyError("BOOKING_REFERENCE_REUSED");
      // Retries reuse the persisted deadline and cannot revive expired reservations.
      if (value.status !== "payment_pending" || Date.parse(String(value.reservationExpiresAt)) <= now) throw new LiveEventPolicyError("RESERVATION_EXPIRED");
      assertEventBookingOpen(event,now);
      if(value.admissionSourceTicketId)await readLiveEventUpgrade(db,tx,{eventId:input.eventId,userId:input.actor.uid,ticketId:String(value.admissionSourceTicketId),personalAdmissionConfirmed:Boolean(value.personalAdmissionConfirmedAt),upgradeBookingId:id});
      return { id, amountCents: Number(value.amountCents), currency: "usd", expiresAt: String(value.reservationExpiresAt), sessionExpiresAtSeconds: Number(value.sessionExpiresAtSeconds), checkoutSessionId: value.stripeCheckoutSessionId as string | null, repeated: true };
    }
    const window = liveEventReservationWindow(event, now), options = eventOptions(event);
    if ([event.creatorId, event.hostId, event.userId].includes(input.actor.uid)) throw new LiveEventPolicyError("HOST_CANNOT_REGISTER", 403);
    const user = account?.data() ?? {};
    if (!input.actor.guestSession && (!account?.exists || user.disabled === true || user.suspended === true || ["suspended", "disabled", "banned", "restricted", "deleted", "blocked", "deactivated"].includes(String(user.accountStatus ?? "")))) throw new LiveEventPolicyError("PARTICIPATION_NOT_ELIGIBLE", 403);
    if (input.kind === "competitor" && ["sponsor", "enterprise"].includes(String(user.role ?? user.accountType ?? "").toLowerCase())) throw new LiveEventPolicyError("PARTICIPATION_NOT_ELIGIBLE", 403);
    if (input.kind === "competitor" && registration.exists && !["cancelled", "refunded"].includes(String(registration.data()?.status))) throw new LiveEventPolicyError("ALREADY_COMPETING");
    if (Number(event.registrationCount ?? event.attendeeCount ?? 0) > 0 && event.audienceCount === 0 && event.competitorCount === 0) throw new LiveEventPolicyError("CAPACITY_RECONCILIATION_REQUIRED");
    // Serialize all reservations and competitor attempts on the canonical operational event.
    const locks = await tx.get(db.collection("liveEventBookings").where("eventId", "==", input.eventId).where("userId", "==", input.actor.uid).limit(101));
    if (locks.size > 100) throw new LiveEventPolicyError("BOOKING_RECONCILIATION_REQUIRED");
    if (input.kind === "competitor" && locks.docs.some(row => row.data().kind === "competitor" && ["payment_pending","payment_review_required","refund_pending"].includes(String(row.data().status)))) throw new LiveEventPolicyError("CHECKOUT_ALREADY_PENDING");
    // A purchaser may have named/shared audience tickets. Until an identity-safe
    // upgrade is established, never charge the same account a second admission.
    if(input.kind==="competitor"&&!input.upgradeTicketId&&!input.newAdmissionConfirmed&&locks.docs.some(row=>row.data().kind==="audience"&&row.data().status==="confirmed"&&Number(row.data().activeTicketCount??row.data().ticketIds?.length??0)>0))throw new LiveEventPolicyError("ADMISSION_REUSE_REVIEW_REQUIRED");
    if(input.upgradeTicketId&&(input.kind!=="competitor"||input.actor.guestSession))throw new LiveEventPolicyError("ACCOUNT_REQUIRED",403);
    const upgrade=input.upgradeTicketId?await readLiveEventUpgrade(db,tx,{eventId:input.eventId,userId:input.actor.uid,ticketId:input.upgradeTicketId,personalAdmissionConfirmed:input.personalAdmissionConfirmed===true}):null;
    assertAvailableSpaces(event, input.kind, names.length);
    const admission = Number(options.ticketPrice ?? event.ticketPrice ?? event.price ?? 0), entry = input.kind === "competitor" ? Number(options.competitionEntryFee ?? 0) : 0;
    if (![admission, entry].every(value => Number.isFinite(value) && value >= 0 && Math.abs(Math.round(value * 100) - value * 100) < 0.000001)) throw new LiveEventPolicyError("PAYMENT_CONFIGURATION_INVALID");
    const admissionCents = upgrade?0:Math.round(admission * 100) * names.length, competitionEntryCents = Math.round(entry * 100), amountCents = admissionCents + competitionEntryCents;
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 100_000_000) throw new LiveEventPolicyError("PAYMENT_AMOUNT_INVALID", 422);
    const createdAt = new Date(now).toISOString(), expiresAt = new Date(window.expiresAt).toISOString();
    tx.create(ref, {
      id, eventId: input.eventId, userId: input.actor.uid, email: input.actor.email, guestSession: input.actor.guestSession === true,
      announcementEmailConsent: input.announcementEmailConsent === true,
      fingerprint, names, kind: input.kind, quantity: names.length, ticketIds: [], status: "payment_pending", capacityState: "reserved",
      amountCents, admissionCents, competitionEntryCents, currency: "usd", admissionRefundPolicy: options.admissionRefundPolicy ?? "standard",
      bookedEventStartsAt: event.startsAt, registrationClosesAt: options.registrationClosesAt ?? event.registrationClosesAt,
      reservationCreatedAt: createdAt, reservationExpiresAt: expiresAt, sessionExpiresAtSeconds: window.stripeExpiresAtSeconds,
      stripeCheckoutSessionId: null, createdAt, updatedAt: createdAt,
      ...(upgrade?{admissionSourceTicketId:upgrade.ticket.id,admissionSourceBookingId:upgrade.booking.id,personalAdmissionConfirmedAt:createdAt}:{}),
      ...(input.kind==="competitor"&&input.newAdmissionConfirmed?{newAdmissionConfirmedAt:createdAt}:{}),
    });
    const counter = input.kind === "audience" ? "audienceReserved" : "competitorReserved";
    tx.update(eventRef, { [counter]: Number(event[counter]) + names.length, updatedAt: createdAt });
    if(upgrade)tx.update(upgrade.ticket.ref,{status:"upgrade_pending",upgradeBookingId:id,upgradeStartedAt:createdAt,updatedAt:createdAt});
    wakeLiveEventJob(db,tx,input.eventId,createdAt);
    return { id, amountCents, currency: "usd", expiresAt, sessionExpiresAtSeconds: window.stripeExpiresAtSeconds, checkoutSessionId: null, repeated: false };
  });
}

/** Provider inspection must precede release. An uncertain request never releases a possibly paid slot. */
export async function releaseExpiredLiveEventReservation(db: Firestore, input: { bookingId: string; sessionId: string; providerState: "expired_unpaid" | "not_created";cancelConfirmed?:boolean; now?: number }) {
  const ref = db.collection("liveEventBookings").doc(input.bookingId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref), booking = snap.data();
    if (!booking || booking.status !== "payment_pending" || booking.capacityState !== "reserved") return { released: false };
    const now = input.now ?? Date.now();
    if (!input.cancelConfirmed&&Date.parse(String(booking.reservationExpiresAt)) > now) return { released: false };
    if (input.providerState === "expired_unpaid" ? booking.stripeCheckoutSessionId !== input.sessionId || !input.sessionId : Boolean(booking.stripeCheckoutSessionId) || Boolean(booking.checkoutCreationStartedAt)) throw new LiveEventPolicyError("PROVIDER_EXPIRATION_NOT_VERIFIED");
    const { event, ref: eventRef } = await readLiveEvent(db, tx, String(booking.eventId));
    const upgrade=await readRestorableUpgrade(db,tx,booking,input.bookingId);
    const field = booking.kind === "audience" ? "audienceReserved" : "competitorReserved", quantity = Number(booking.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || Number(event[field]) < quantity) throw new LiveEventPolicyError("CAPACITY_RECONCILIATION_REQUIRED");
    const updatedAt = new Date(now).toISOString();
    tx.update(ref, { status: input.cancelConfirmed?"cancelled":"expired", capacityState: "released", expiredAt: updatedAt, updatedAt });
    if(upgrade)restoreLiveEventAdmission(tx,upgrade,updatedAt);
    tx.update(eventRef, { [field]: Number(event[field]) - quantity, updatedAt });
    return { released: true };
  });
}
