import type Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";
import { LiveEventPolicyError } from "@/lib/live-event-policy";
import type { EventActor } from "@/lib/server/live-event-admission";
import { reserveLiveEventCheckout, releaseExpiredLiveEventReservation } from "@/lib/server/live-event-reservations";

export async function createLiveEventCheckout(db: Firestore, stripe: Stripe, input: { eventId: string; actor: EventActor; names: string[]; kind: "audience" | "competitor"; requestKey: string; origin: string; announcementEmailConsent?: boolean;upgradeTicketId?:string;personalAdmissionConfirmed?:boolean;newAdmissionConfirmed?:boolean }) {
  const reservation = await reserveLiveEventCheckout(db, input);
  const ref = db.collection("liveEventBookings").doc(reservation.id);
  if (reservation.checkoutSessionId) {
    const existing = await stripe.checkout.sessions.retrieve(reservation.checkoutSessionId);
    if (existing.metadata?.bookingId !== reservation.id || existing.metadata?.eventId !== input.eventId || existing.mode !== "payment") throw new LiveEventPolicyError("PROVIDER_REFERENCE_MISMATCH");
    if (existing.status !== "open" || !existing.url) throw new LiveEventPolicyError("CHECKOUT_NOT_OPEN");
    return { bookingId: reservation.id, checkoutUrl: existing.url, expiresAt: reservation.expiresAt };
  }
  const providerExpiresAt = await db.runTransaction(async tx => {
    const latest = await tx.get(ref), value = latest.data() ?? {};
    if (value.status !== "payment_pending" || Date.parse(String(value.reservationExpiresAt)) <= Date.now()) throw new LiveEventPolicyError("RESERVATION_EXPIRED");
    const expiresAt = Number(value.providerRequestedExpiresAt ?? Math.ceil(Date.now() / 1000) + 1800);
    tx.update(ref, { checkoutCreationStartedAt: value.checkoutCreationStartedAt ?? new Date().toISOString(), providerRequestedExpiresAt: expiresAt });
    return expiresAt;
  });
  // The provider's minimum duration starts at this API call. It does not move the persisted internal deadline.
  const session = await stripe.checkout.sessions.create({
    mode: "payment", payment_method_types: ["card"], customer_email: input.actor.email,
    expires_at: providerExpiresAt,
    line_items: [{ price_data: { currency: "usd", unit_amount: reservation.amountCents, product_data: { name: input.upgradeTicketId?"Live Event competition entry upgrade — original admission reused":input.kind === "competitor" ? "Live Event Participant Pass — admission and competition entry" : "Live Event admission tickets" } }, quantity: 1 }],
    payment_intent_data: { capture_method: "automatic", metadata: { paymentPurpose: "live_event_booking", bookingId: reservation.id, eventId: input.eventId } },
    metadata: { paymentPurpose: "live_event_booking", bookingId: reservation.id, eventId: input.eventId },
    success_url: `${input.origin}/live-events/${encodeURIComponent(input.eventId)}?booking=${reservation.id}`,
    cancel_url: `${input.origin}/live-events/${encodeURIComponent(input.eventId)}?booking=${reservation.id}&checkout=cancelled`,
  }, { idempotencyKey: `live-event-booking-${reservation.id}` });
  if (!session.url || session.metadata?.bookingId !== reservation.id || session.amount_total !== reservation.amountCents || session.currency !== "usd") throw new LiveEventPolicyError("PROVIDER_REFERENCE_MISMATCH");
  await db.runTransaction(async tx => {
    const latest = await tx.get(ref), value = latest.data() ?? {};
    if (value.stripeCheckoutSessionId && value.stripeCheckoutSessionId !== session.id) throw new LiveEventPolicyError("PROVIDER_REFERENCE_MISMATCH");
    tx.update(ref, { stripeCheckoutSessionId: session.id, updatedAt: new Date().toISOString() });
  });
  if (Date.parse(reservation.expiresAt) <= Date.now()) {
    await expireLiveEventCheckout(db, stripe, reservation.id);
    throw new LiveEventPolicyError("RESERVATION_EXPIRED");
  }
  return { bookingId: reservation.id, checkoutUrl: session.url, expiresAt: reservation.expiresAt };
}

/** Opportunistic expiration plus fresh provider retrieval; an expire response alone is not payment evidence. */
export async function expireLiveEventCheckout(db: Firestore, stripe: Stripe, bookingId: string,cancelConfirmed=false) {
  const snap = await db.collection("liveEventBookings").doc(bookingId).get(), booking = snap.data();
  if (!booking || booking.status !== "payment_pending" || !cancelConfirmed&&Date.parse(String(booking.reservationExpiresAt)) > Date.now()) return { released: false };
  const sessionId = String(booking.stripeCheckoutSessionId ?? "");
  const review=async()=>{await db.runTransaction(async tx=>{const latest=await tx.get(snap.ref);if(latest.data()?.status!=="payment_pending")return;const now=new Date().toISOString();tx.update(snap.ref,{expirationReconciliationRequired:true,updatedAt:now});tx.set(db.collection("adminActionTasks").doc(`live_checkout_expiry_${bookingId}`),{type:"live_event_checkout_reconciliation",eventId:booking.eventId,bookingId,status:"open",reason:"Provider expiry or payment outcome is uncertain. Preserve original admission and reserved capacity until verified reconciliation.",updatedAt:now},{merge:true});});return {released:false,reviewRequired:true};};
  if(!sessionId&&booking.checkoutCreationStartedAt)return review();
  if (!sessionId) return releaseExpiredLiveEventReservation(db, { bookingId, sessionId: "", providerState: "not_created",cancelConfirmed });
  let session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.bookingId !== bookingId || session.metadata?.eventId !== booking.eventId) throw new LiveEventPolicyError("PROVIDER_REFERENCE_MISMATCH");
  if (session.status === "open") {
    try { await stripe.checkout.sessions.expire(sessionId); } catch { /* Completion can race expiry; re-read before making any capacity decision. */ }
    session = await stripe.checkout.sessions.retrieve(sessionId);
  }
  if (session.status === "expired" && session.payment_status === "unpaid" && !session.payment_intent) return releaseExpiredLiveEventReservation(db, { bookingId, sessionId, providerState: "expired_unpaid",cancelConfirmed });
  // A PaymentIntent can exist on an unpaid expired Session. Inspect its current state before releasing.
  if (session.status === "expired" && session.payment_status === "unpaid" && session.payment_intent) {
    const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id;
    const intent = await stripe.paymentIntents.retrieve(intentId);
    if (intent.status === "canceled") return releaseExpiredLiveEventReservation(db, { bookingId, sessionId, providerState: "expired_unpaid",cancelConfirmed });
  }
  return review();
}
