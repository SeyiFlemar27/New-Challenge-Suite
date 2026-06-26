import { headers } from "next/headers";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe";
import { applyDoroCoinTransaction } from "@/lib/server/dorocoin";
import { fail, ok, serverError, serverUnavailable } from "@/lib/server/responses";

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
    const db = getAdminDb();
    if (!db && (session.metadata?.type === "dorocoin_purchase" || session.metadata?.planId)) {
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
      if (session.metadata?.type === "dorocoin_purchase" && session.metadata.userId && session.metadata.coins) {
        await applyDoroCoinTransaction(db, {
          userId: session.metadata.userId,
          amount: Number(session.metadata.coins),
          type: "purchase",
          description: `Purchased ${session.metadata.coins} DoroCoins`,
          sourceId: session.id,
          createdBy: "stripe"
        });
      } else if (session.metadata?.planId) {
        await db.collection("subscriptionEvents").add({
          stripeSessionId: session.id,
          customerId: session.customer,
          planId: session.metadata.planId,
          userId: session.metadata.userId ?? null,
          createdAt: now
        });
        if (session.metadata.userId) {
          await Promise.all([
            db.collection("users").doc(session.metadata.userId).set({
              planId: session.metadata.planId,
              subscriptionStatus: "active",
              stripeCustomerId: session.customer ?? null,
              updatedAt: now
            }, { merge: true }),
            db.collection("profiles").doc(session.metadata.userId).set({
              planId: session.metadata.planId,
              premium: true,
              subscriptionStatus: "active",
              updatedAt: now
            }, { merge: true })
          ]);
        }
      }
      await eventRef.set({ status: "processed", processedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
    } catch (error) {
      await eventRef.set({ status: "failed", error: error instanceof Error ? error.message : "Unknown webhook error", updatedAt: new Date().toISOString() }, { merge: true });
      return serverError("Stripe webhook could not be processed.", error instanceof Error ? error.message : error);
    }
  }
  return ok({ received: true }, "Stripe webhook received.");
}

