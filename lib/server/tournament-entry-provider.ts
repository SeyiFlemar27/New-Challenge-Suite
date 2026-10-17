import type Stripe from "stripe";
export type ProviderEvidence = { paymentIntent: Stripe.PaymentIntent; charge: Stripe.Charge };
export function assertPaidEntryProviderEvidence(session: Stripe.Checkout.Session, evidence: ProviderEvidence) {
  if (session.mode !== "payment" || session.payment_status !== "paid" || session.metadata?.paymentPurpose !== "tournament_entry") throw new Error("Tournament Checkout Session is not a paid one-time entry payment.");
  if (evidence.paymentIntent.status !== "succeeded" || !["automatic", "automatic_async"].includes(String(evidence.paymentIntent.capture_method))) throw new Error("Tournament entry PaymentIntent is not a successfully captured automatic card payment.");
  if (!evidence.charge.paid || !evidence.charge.captured || evidence.charge.status !== "succeeded" || evidence.charge.payment_method_details?.type !== "card") throw new Error("Tournament entry Charge is not a captured card payment.");
  if (!session.payment_method_types?.length || session.payment_method_types.some((method) => method !== "card")) throw new Error("Tournament Checkout Session used an unsupported payment method.");
  if (typeof session.amount_total !== "number" || evidence.paymentIntent.amount_received !== session.amount_total || evidence.charge.amount_captured !== session.amount_total) throw new Error("Tournament provider amount evidence is inconsistent.");
  if (String(session.currency).toLowerCase() !== String(evidence.paymentIntent.currency).toLowerCase() || String(session.currency).toLowerCase() !== String(evidence.charge.currency).toLowerCase()) throw new Error("Tournament provider currency evidence is inconsistent.");
  const chargeIntent = typeof evidence.charge.payment_intent === "string" ? evidence.charge.payment_intent : evidence.charge.payment_intent?.id;
  const latestCharge = typeof evidence.paymentIntent.latest_charge === "string" ? evidence.paymentIntent.latest_charge : evidence.paymentIntent.latest_charge?.id;
  if (chargeIntent !== evidence.paymentIntent.id || latestCharge !== evidence.charge.id) throw new Error("Tournament Charge and PaymentIntent references do not match.");
  if (String(evidence.paymentIntent.id) !== String(typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id)) throw new Error("Tournament Checkout Session and PaymentIntent references do not match.");
}
