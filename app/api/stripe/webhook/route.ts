import { headers } from "next/headers";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe";
import { applyDoroCoinTransaction } from "@/lib/server/dorocoin";
import { deterministicId } from "@/lib/server/idempotency";
import { fail, ok, serverError, serverUnavailable } from "@/lib/server/responses";

function assertPaidPaymentSession(session: { mode?: string | null; payment_status?: string | null; metadata?: Record<string, string> | null }) {
  if (session.mode !== "payment") throw new Error("Stripe DoroCoin checkout session was not a payment session.");
  if (session.payment_status !== "paid") throw new Error("Stripe DoroCoin checkout session is not paid.");
  if (!session.metadata?.userId || !session.metadata.coins) throw new Error("Stripe DoroCoin checkout session is missing required metadata.");
}

function assertSubscriptionSession(session: { mode?: string | null; payment_status?: string | null; metadata?: Record<string, string> | null }) {
  if (session.mode !== "subscription") throw new Error("Stripe subscription checkout session was not a subscription session.");
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") throw new Error("Stripe subscription checkout session is not payment-confirmed.");
  if (!session.metadata?.planId || !session.metadata.userId) throw new Error("Stripe subscription checkout session is missing required metadata.");
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return fail("Stripe webhook is not configured.", 503, { missing: !stripe ? "STRIPE_SECRET_KEY" : "STRIPE_WEBHOOK_SECRET" }, "PAYMENT_CONFIGURATION_ERROR");
  const body = await request.text();
  const signature = (await headers()).get("stripe-signature");
  if (!signature) return fail("Missing Stripe signature.", 400, { fieldErrors: { "stripe-signature": "Stripe signature header is required." } }, "VALIDATION_ERROR");
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return fail("Invalid Stripe webhook signature.", 400, { fieldErrors: { "stripe-signature": "Stripe signature could not be verified." } }, "VALIDATION_ERROR");
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const isDoroCoinPurchase = session.metadata?.type === "dorocoin_purchase";
    const isSubscriptionCheckout = Boolean(session.metadata?.planId);
    const db = getAdminDb();
    if (!db && (isDoroCoinPurchase || isSubscriptionCheckout)) {
      return serverUnavailable("Stripe webhook persistence");
    }
    if (!db) return ok({ received: true }, "Stripe webhook received.");

    const eventRef = db.collection("stripeWebhookEvents").doc(event.id);
    const now = new Date().toISOString();
    try {
      await eventRef.create({ id: event.id, type: event.type, stripeSessionId: session.id, status: "processing", createdAt: now, updatedAt: now });
    } catch {
      const existing = await eventRef.get();
      const status = existing.exists ? String(existing.data()?.status ?? "") : "";
      if (status !== "failed") {
        return ok({ received: true, duplicate: true }, "Stripe webhook already processed or processing.");
      }
      await eventRef.set({ status: "processing", retryStartedAt: now, updatedAt: now }, { merge: true });
    }

    try {
      if (isDoroCoinPurchase) {
        assertPaidPaymentSession(session);
        await applyDoroCoinTransaction(db, {
          userId: session.metadata!.userId,
          amount: Number(session.metadata!.coins),
          type: "purchase",
          description: `Purchased ${session.metadata!.coins} DoroCoins`,
          sourceId: session.id,
          transactionId: deterministicId("stripe_session", session.id, "dorocoin_purchase"),
          idempotencyKey: event.id,
          createdBy: "stripe"
        });
      } else if (isSubscriptionCheckout) {
        assertSubscriptionSession(session);
        await db.collection("subscriptionEvents").doc(deterministicId("stripe_session", session.id, "subscription")).set({
          stripeSessionId: session.id,
          customerId: session.customer,
          planId: session.metadata!.planId,
          userId: session.metadata!.userId,
          paymentStatus: session.payment_status,
          createdAt: now,
          updatedAt: now
        }, { merge: true });
        await Promise.all([
          db.collection("users").doc(session.metadata!.userId).set({
            planId: session.metadata!.planId,
            subscriptionStatus: "active",
            stripeCustomerId: session.customer ?? null,
            updatedAt: now
          }, { merge: true }),
          db.collection("profiles").doc(session.metadata!.userId).set({
            planId: session.metadata!.planId,
            premium: true,
            subscriptionStatus: "active",
            updatedAt: now
          }, { merge: true })
        ]);
      }
      await eventRef.set({ status: "processed", processedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
    } catch (error) {
      await eventRef.set({ status: "failed", error: error instanceof Error ? error.message : "Unknown webhook error", updatedAt: new Date().toISOString() }, { merge: true });
      return serverError("Stripe webhook could not be processed.", error instanceof Error ? error.message : error);
    }
  }
  return ok({ received: true }, "Stripe webhook received.");
}
