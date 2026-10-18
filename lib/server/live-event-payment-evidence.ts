import type Stripe from "stripe";
import { liveEventPaymentTiming } from "@/lib/live-event-policy";

const objectId = (value: unknown): string | null => typeof value === "string" ? value : value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : null;
type Booking = Record<string, unknown>;

/** Only invoked after webhook signature verification and fresh provider retrieval.
 * Stripe's event creation time is a bound on the paid snapshot, not an exact capture timestamp.
 */
export function verifyLiveEventPaymentEvidence(booking: Booking, event: Stripe.Event, session: Stripe.Checkout.Session, intent: Stripe.PaymentIntent) {
  const charge = intent.latest_charge && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  const snapshot = event.data.object as Stripe.Checkout.Session;
  const expected = Number(booking.amountCents), currency = String(booking.currency).toLowerCase();
  const sessionMatches = (value: Stripe.Checkout.Session) => value.object === "checkout.session" && value.id === booking.stripeCheckoutSessionId && value.mode === "payment" && value.status === "complete" && value.payment_status === "paid" && value.metadata?.paymentPurpose === "live_event_booking" && value.metadata.bookingId === booking.id && value.metadata.eventId === booking.eventId && value.amount_total === expected && value.currency === currency && value.payment_method_types?.length === 1 && value.payment_method_types[0] === "card" && objectId(value.payment_intent) === intent.id;
  const relationshipsVerified = sessionMatches(session) && sessionMatches(snapshot) && Boolean(charge) && objectId(charge?.payment_intent) === intent.id && objectId(intent.latest_charge) === charge?.id;
  const captured = relationshipsVerified && intent.status === "succeeded" && intent.capture_method === "automatic" && intent.amount_received === expected && intent.currency === currency && charge?.status === "succeeded" && charge.paid === true && charge.captured === true && charge.amount === expected && charge.amount_captured === expected && charge.currency === currency && charge.payment_method_details?.type === "card";
  const restricted = Boolean(charge && (charge.disputed || charge.refunded || charge.amount_refunded > 0 || charge.review || charge.outcome?.type === "blocked" || charge.fraud_details?.user_report === "fraudulent"));
  const timing = liveEventPaymentTiming({ reservationCreatedAt: booking.reservationCreatedAt, reservationExpiresAt: booking.reservationExpiresAt, registrationClosesAt: booking.registrationClosesAt, verifiedCompletionUpperBoundSeconds: captured && !restricted && event.type === "checkout.session.completed" ? event.created : null });
  return {
    eligible: Boolean(captured && !restricted && timing.eligible), captured: Boolean(captured), restricted,
    reason: !relationshipsVerified ? "provider_references_inconsistent" : !captured ? "captured_card_payment_unverified" : restricted ? "provider_financial_restriction" : timing.reason,
    paymentIntentId: intent.id, chargeId: charge?.id ?? null,
    providerEventId: event.id, providerSnapshotAt: Number.isSafeInteger(event.created) && event.created > 0 ? new Date(event.created * 1000).toISOString() : null,
    evidenceType: "captured_card_paid_snapshot_upper_bound" as const,
  };
}
