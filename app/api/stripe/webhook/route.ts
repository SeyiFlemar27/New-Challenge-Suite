import type Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe";
import { applyDoroCoinTransaction } from "@/lib/server/dorocoin";
import { deterministicId } from "@/lib/server/idempotency";
import { awardDoroCoinPurchaseRewards } from "@/lib/server/rewards";
import {
  applySponsorAgreementRefundState,
  confirmChallengeEntryPayment,
  confirmPaidVotePurchase,
  confirmSponsorContribution,
  confirmSponsorWalletFunding,
  expireChallengeEntryPayment,
  expirePaidVotePurchase,
  expireSponsorContribution,
  expireSponsorWalletFunding
} from "@/lib/server/monetization-payments";
import {
  invoicePaymentIntentId,
  invoiceSubscriptionId,
  persistStripeSubscriptionLifecycle,
  subscriptionMetadataFromCheckout
} from "@/lib/server/stripe-subscriptions";
import { confirmPredictionPayment, expirePredictionPayment, PREDICTION_PAYMENT_PURPOSE } from "@/lib/server/predictions";
import { confirmCreatorPrizeFunding, CREATOR_PRIZE_PAYMENT_PURPOSE, expireCreatorPrizeFunding } from "@/lib/server/prize-funding";
import { claimEnterpriseRefundLock, finalizeEnterprisePaidVoteRefund, finalizeEnterprisePrizeFundingRefund, releaseEnterpriseRefundLock } from "@/lib/server/enterprise-prize-exposure";
import { fail, ok, serverError, serverUnavailable } from "@/lib/server/responses";

const handledEventTypes = new Set<Stripe.Event.Type>([
  "checkout.session.completed",
  "checkout.session.expired",
  "refund.updated",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted"
]);

function objectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return null;
}

function assertPaidPaymentSession(session: Stripe.Checkout.Session) {
  if (session.mode !== "payment") throw new Error("Stripe DoroCoin checkout session was not a payment session.");
  if (session.payment_status !== "paid") throw new Error("Stripe DoroCoin checkout session is not paid.");
  if (!session.metadata?.userId || !session.metadata.coins) throw new Error("Stripe DoroCoin checkout session is missing required metadata.");
}

function assertSubscriptionSession(session: Stripe.Checkout.Session) {
  if (session.mode !== "subscription") throw new Error("Stripe subscription checkout session was not a subscription session.");
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") throw new Error("Stripe subscription checkout session is not payment-confirmed.");
  if (!session.metadata?.planId || !session.metadata.userId) throw new Error("Stripe subscription checkout session is missing required metadata.");
  if (!objectId(session.subscription)) throw new Error("Stripe subscription checkout session is missing its subscription.");
}

async function beginEvent(db: FirebaseFirestore.Firestore, event: Stripe.Event) {
  const eventRef = db.collection("stripeWebhookEvents").doc(event.id);
  const now = new Date().toISOString();
  try {
    await eventRef.create({
      id: event.id,
      type: event.type,
      stripeObjectId: objectId(event.data.object),
      status: "processing",
      stripeCreatedAt: new Date(event.created * 1000).toISOString(),
      createdAt: now,
      updatedAt: now
    });
    return { eventRef, duplicate: false };
  } catch {
    const existing = await eventRef.get();
    const status = existing.exists ? String(existing.data()?.status ?? "") : "";
    if (status !== "failed") return { eventRef, duplicate: true };
    await eventRef.set({ status: "processing", retryStartedAt: now, updatedAt: now }, { merge: true });
    return { eventRef, duplicate: false };
  }
}

async function retrieveSubscription(stripe: Stripe, subscriptionId: string) {
  return stripe.subscriptions.retrieve(subscriptionId);
}

async function processSubscriptionCheckout(
  stripe: Stripe,
  db: FirebaseFirestore.Firestore,
  event: Stripe.Event,
  session: Stripe.Checkout.Session
) {
  assertSubscriptionSession(session);
  const subscriptionId = objectId(session.subscription)!;
  const subscription = await retrieveSubscription(stripe, subscriptionId);
  const subscriptionWithMetadata = {
    ...subscription,
    metadata: { ...subscription.metadata, ...subscriptionMetadataFromCheckout(session) }
  } as Stripe.Subscription;
  return persistStripeSubscriptionLifecycle(db, subscriptionWithMetadata, {
    eventId: event.id,
    eventType: event.type,
    eventCreated: event.created,
    trustedMetadataPlan: true,
    latestInvoiceId: objectId(session.invoice),
    latestPaymentIntentId: objectId(session.payment_intent)
  });
}

async function processInvoiceEvent(
  stripe: Stripe,
  db: FirebaseFirestore.Firestore,
  event: Stripe.Event,
  invoice: Stripe.Invoice,
  paymentFailed: boolean
) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    return { handled: false, reason: "invoice_not_linked_to_subscription", invoiceId: invoice.id };
  }
  const subscription = await retrieveSubscription(stripe, subscriptionId);
  return persistStripeSubscriptionLifecycle(db, subscription, {
    eventId: event.id,
    eventType: event.type,
    eventCreated: event.created,
    internalStatus: paymentFailed ? "past_due" : undefined,
    paymentFailed,
    paymentSucceeded: !paymentFailed,
    latestInvoiceId: invoice.id,
    latestPaymentIntentId: invoicePaymentIntentId(invoice)
  });
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return fail("Stripe webhook is not configured.", 503, { missing: !stripe ? "STRIPE_SECRET_KEY" : "STRIPE_WEBHOOK_SECRET" }, "PAYMENT_CONFIGURATION_ERROR");
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return fail("Missing Stripe signature.", 400, { fieldErrors: { "stripe-signature": "Stripe signature header is required." } }, "VALIDATION_ERROR");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return fail("Invalid Stripe webhook signature.", 400, { fieldErrors: { "stripe-signature": "Stripe signature could not be verified." } }, "VALIDATION_ERROR");
  }

  if (!handledEventTypes.has(event.type)) {
    return ok({ received: true, handled: false }, "Stripe webhook received.");
  }

  const db = getAdminDb();
  if (!db) return serverUnavailable("Stripe webhook persistence");
  const eventState = await beginEvent(db, event);
  if (eventState.duplicate) {
    return ok({ received: true, duplicate: true }, "Stripe webhook already processed or processing.");
  }

  try {
    let outcome: Record<string, unknown> = { handled: false };
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const paymentPurpose = session.metadata?.paymentPurpose;
        if (paymentPurpose === "challenge_entry_fee" || paymentPurpose === "challenge_entry") {
          outcome = await confirmChallengeEntryPayment(db, event, session);
        } else if (paymentPurpose === "paid_vote") {
          outcome = await confirmPaidVotePurchase(db, event, session);
        } else if (paymentPurpose === "sponsor_funding") {
          outcome = await confirmSponsorContribution(db, event, session);
        } else if (paymentPurpose === "sponsor_wallet_funding") {
          outcome = await confirmSponsorWalletFunding(db, event, session);
        } else if (paymentPurpose === PREDICTION_PAYMENT_PURPOSE) {
          outcome = await confirmPredictionPayment(db, event, session);
        } else if (paymentPurpose === CREATOR_PRIZE_PAYMENT_PURPOSE) {
          outcome = await confirmCreatorPrizeFunding(db, event, session);
        } else if (session.metadata?.type === "dorocoin_purchase") {
          assertPaidPaymentSession(session);
          const purchaseId = deterministicId("dorocoin_purchase", session.id);
          const purchaseRef = db.collection("doroCoinPurchases").doc(purchaseId);
          const purchaseSnap = await purchaseRef.get();
          const purchase = purchaseSnap.data();
          const coins = Number(session.metadata.coins);
          if (!purchaseSnap.exists || !purchase || purchase.providerSessionId !== session.id || purchase.userId !== session.metadata.userId
            || Number(purchase.coins) !== coins || !Number.isSafeInteger(coins) || coins <= 0
            || Number(purchase.amountCents) !== Number(session.amount_total) || String(purchase.currency ?? "").toLowerCase() !== String(session.currency ?? "").toLowerCase()
            || !["pending_payment", "confirmed"].includes(String(purchase.status ?? ""))) {
            throw new Error("DoroCoin purchase does not match a valid stored checkout record.");
          }
          const transaction = await applyDoroCoinTransaction(db, {
            userId: session.metadata.userId,
            amount: coins,
            type: "purchase",
            description: `Purchased ${session.metadata.coins} DoroCoins`,
            sourceId: session.id,
            transactionId: deterministicId("stripe_session", session.id, "dorocoin_purchase"),
            idempotencyKey: event.id,
            createdBy: "stripe",
            sourceType: "purchase",
            ruleVersion: session.metadata.ruleVersion
          });
          await purchaseRef.set({ status: "confirmed", balanceCredited: true, providerPaymentIntentId: objectId(session.payment_intent), confirmedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ledgerTransactionId: transaction.id }, { merge: true });
          const reward = await awardDoroCoinPurchaseRewards(db, { userId: session.metadata.userId, coins, sourceId: session.id, eventId: event.id });
          outcome = { handled: true, kind: "dorocoin_purchase", transactionId: transaction.id, rewardPointsAwarded: reward.pointsAwarded, rewardSpinCreditsAwarded: reward.spinCreditsAwarded };
        } else if (session.metadata?.type === "challenge_credit_purchase") {
          if (session.mode !== "payment" || session.payment_status !== "paid" || !session.metadata.userId || !session.metadata.credits) throw new Error("Stripe Challenge Credit purchase is not provider-confirmed.");
          const purchaseId = deterministicId("challenge_credit_purchase", session.id);
          const purchaseRef = db.collection("challengeCreditPurchases").doc(purchaseId);
          const purchaseSnap = await purchaseRef.get();
          const purchase = purchaseSnap.data();
          const credits = Number(session.metadata.credits);
          if (!purchaseSnap.exists || !purchase || purchase.providerSessionId !== session.id || purchase.userId !== session.metadata.userId
            || Number(purchase.credits) !== credits || !Number.isSafeInteger(credits) || credits <= 0
            || Number(purchase.amountCents) !== Number(session.amount_total) || String(purchase.currency ?? "").toLowerCase() !== String(session.currency ?? "").toLowerCase()
            || !["pending_payment", "confirmed"].includes(String(purchase.status ?? ""))) {
            throw new Error("Challenge Credit purchase does not match a valid stored checkout record.");
          }
          const now = new Date().toISOString();
          await purchaseRef.set({ status: "legacy_credit_purchase_review", balanceCredited: false, providerPaymentIntentId: objectId(session.payment_intent), confirmedAt: now, updatedAt: now, retiredAt: now, retirementReason: "challenge_credit_economy_retired", reviewRequired: true }, { merge: true });
          await db.collection("paymentReviewQueue").doc(purchaseId).set({ id: purchaseId, purchaseId, userId: session.metadata.userId, providerSessionId: session.id, amountCents: Number(session.amount_total), currency: session.currency, legacyProduct: "challenge_credits", status: "pending_manual_review", automaticCreditIssued: false, automaticRefundExecuted: false, createdAt: now, updatedAt: now }, { merge: true });
          outcome = { handled: true, kind: "retired_challenge_credit_purchase", purchaseId, walletMutation: false, reviewRequired: true };
        } else if (session.mode === "subscription") {
          outcome = await processSubscriptionCheckout(stripe, db, event, session);
        }
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object;
        const paymentPurpose = session.metadata?.paymentPurpose;
        if (paymentPurpose === "challenge_entry_fee" || paymentPurpose === "challenge_entry") outcome = await expireChallengeEntryPayment(db, session);
        else if (paymentPurpose === "paid_vote") outcome = await expirePaidVotePurchase(db, session);
          else if (paymentPurpose === "sponsor_funding") outcome = await expireSponsorContribution(db, session);
          else if (paymentPurpose === "sponsor_wallet_funding") outcome = await expireSponsorWalletFunding(db, session);
        else if (paymentPurpose === PREDICTION_PAYMENT_PURPOSE) outcome = await expirePredictionPayment(db, session);
        else if (paymentPurpose === CREATOR_PRIZE_PAYMENT_PURPOSE) outcome = await expireCreatorPrizeFunding(db, session);
        break;
      }
      case "refund.updated": {
        const refund = event.data.object as Stripe.Refund;
        const refundCaseId = String(refund.metadata?.refundCaseId ?? "");
        if (!refundCaseId) break;
        const refundRef = db.collection("refundCases").doc(refundCaseId);
        const refundCase = await refundRef.get();
        if (!refundCase.exists) throw new Error("Stripe refund event has no matching refund case.");
        const refundRecord = refundCase.data() ?? {};
        const status = refund.status === "succeeded" ? "succeeded" : refund.status === "failed" || refund.status === "canceled" ? "failed" : "processing";
        if (refundRecord.status === "succeeded" && status === "succeeded") {
          outcome = { handled: true, kind: "refund", refundCaseId, status: "succeeded", duplicate: true };
          break;
        }
        if (refundRecord.status === "succeeded" && status !== "succeeded") {
          outcome = { handled: true, kind: "refund", refundCaseId, status: "succeeded", staleProviderEventIgnored: true };
          break;
        }
        if (status === "succeeded" && refundRecord.paymentCollection === "paidVotePurchases") {
          const source = await db.collection("paidVotePurchases").doc(String(refundRecord.paymentId)).get();
          if (source.data()?.organizationOwnerId && source.data()?.challengeId) {
            await claimEnterpriseRefundLock(db, {
              refundCaseId,
              paymentCollection: "paidVotePurchases",
              paymentId: String(refundRecord.paymentId),
              now: new Date().toISOString(),
            });
            outcome = await finalizeEnterprisePaidVoteRefund(db, {
              refundCaseId,
              paymentId: String(refundRecord.paymentId),
              providerRefundId: refund.id,
              now: new Date().toISOString(),
            });
          } else {
            await refundRef.set({ status, providerRefundId: refund.id, providerStatus: refund.status, updatedAt: new Date().toISOString() }, { merge: true });
          }
        } else if (status === "succeeded" && (refundRecord.paymentCollection === "sponsorContributions" || refundRecord.paymentCollection === "creatorPrizeFundingPayments" || refundRecord.paymentCollection === "challengeEntryPayments")) {
          const source = await db.collection(refundRecord.paymentCollection).doc(String(refundRecord.paymentId)).get();
          if (source.data()?.organizationOwnerId && source.data()?.challengeId) {
            await claimEnterpriseRefundLock(db, {
              refundCaseId,
              paymentCollection: refundRecord.paymentCollection as "creatorPrizeFundingPayments" | "sponsorContributions" | "challengeEntryPayments",
              paymentId: String(refundRecord.paymentId),
              now: new Date().toISOString(),
            });
            outcome = await finalizeEnterprisePrizeFundingRefund(db, {
              refundCaseId,
              paymentCollection: refundRecord.paymentCollection as "creatorPrizeFundingPayments" | "sponsorContributions" | "challengeEntryPayments",
              paymentId: String(refundRecord.paymentId),
              providerRefundId: refund.id,
              now: new Date().toISOString(),
            });
          } else {
            await refundRef.set({ status, providerRefundId: refund.id, providerStatus: refund.status, updatedAt: new Date().toISOString() }, { merge: true });
          }
        } else {
          const now = new Date().toISOString();
          const enterpriseFunding = refundRecord.paymentCollection === "sponsorContributions" || refundRecord.paymentCollection === "creatorPrizeFundingPayments" || refundRecord.paymentCollection === "challengeEntryPayments" || refundRecord.paymentCollection === "paidVotePurchases";
          if (status === "failed" && enterpriseFunding) {
            const source = await db.collection(refundRecord.paymentCollection).doc(String(refundRecord.paymentId)).get();
            const challengeId = String(source.data()?.challengeId ?? "");
            if (source.data()?.organizationOwnerId && challengeId) {
              await releaseEnterpriseRefundLock(db, { refundCaseId, challengeId, refundStatus: "failed", providerStatus: refund.status ?? undefined, now });
            } else {
              await db.runTransaction(async (transaction) => {
                const current = await transaction.get(refundRef);
                if (current.data()?.status === "succeeded") return;
                transaction.set(refundRef, { status, providerRefundId: refund.id, providerStatus: refund.status, updatedAt: now }, { merge: true });
              });
            }
          } else {
            await db.runTransaction(async (transaction) => {
              const current = await transaction.get(refundRef);
              if (current.data()?.status === "succeeded") return;
              transaction.set(refundRef, { status, providerRefundId: refund.id, providerStatus: refund.status, updatedAt: now }, { merge: true });
            });
          }
        }
        if (status === "succeeded" && refundRecord.paymentCollection === "sponsorContributions") {
          await applySponsorAgreementRefundState(db, { contributionId: String(refundRecord.paymentId), refundCaseId, amountCents: Number(refundRecord.amountCents ?? refundRecord.amount ?? 0), now: new Date().toISOString() });
        }
        outcome = { handled: true, kind: "refund", refundCaseId, status };
        break;
      }
      case "invoice.payment_succeeded":
        outcome = await processInvoiceEvent(stripe, db, event, event.data.object, false);
        break;
      case "invoice.payment_failed":
        outcome = await processInvoiceEvent(stripe, db, event, event.data.object, true);
        break;
      case "customer.subscription.updated":
        outcome = await persistStripeSubscriptionLifecycle(db, event.data.object, {
          eventId: event.id,
          eventType: event.type,
          eventCreated: event.created
        });
        break;
      case "customer.subscription.deleted":
        outcome = await persistStripeSubscriptionLifecycle(db, event.data.object, {
          eventId: event.id,
          eventType: event.type,
          eventCreated: event.created,
          internalStatus: "canceled"
        });
        break;
    }

    if (!outcome.handled) {
      console.warn("[stripe-webhook] verified event was not linked to an account", {
        eventId: event.id,
        eventType: event.type,
        reason: outcome.reason ?? "not_applicable"
      });
    }
    const completedAt = new Date().toISOString();
    await eventState.eventRef.set({
      status: "processed",
      outcome,
      processedAt: completedAt,
      updatedAt: completedAt
    }, { merge: true });
    return ok({ received: true, handled: Boolean(outcome.handled) }, "Stripe webhook received.");
  } catch (error) {
    const failedAt = new Date().toISOString();
    await eventState.eventRef.set({
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown webhook error",
      updatedAt: failedAt
    }, { merge: true });
    return serverError("Stripe webhook could not be processed.", error instanceof Error ? error.message : error);
  }
}

