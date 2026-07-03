import type Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";
import { getSubscriptionPlan, resolveStripePriceEnv, subscriptionPlans } from "@/lib/server/subscriptions";
import type { ProductPlanId } from "@/lib/types";

export type InternalSubscriptionStatus =
  | "active"
  | "payment_warning_1"
  | "payment_warning_2"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "paused";

type LifecycleOverrides = {
  eventId: string;
  eventType: string;
  eventCreated: number;
  trustedMetadataPlan?: boolean;
  internalStatus?: InternalSubscriptionStatus;
  latestInvoiceId?: string | null;
  latestPaymentIntentId?: string | null;
  paymentFailed?: boolean;
  paymentSucceeded?: boolean;
};

function objectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return null;
}

function unixToIso(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

function validMetadataPlanId(value: unknown): ProductPlanId | null {
  if (typeof value !== "string") return null;
  const plan = getSubscriptionPlan(value);
  return plan?.id && plan.id !== "free" ? plan.id as ProductPlanId : null;
}

export function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): InternalSubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "paused":
      return "paused";
    case "incomplete":
    default:
      return "incomplete";
  }
}

export function getPlanByStripePriceId(priceId: string | null) {
  if (!priceId) return null;
  return subscriptionPlans.find((plan) => resolveStripePriceEnv(plan).priceId === priceId) ?? null;
}

function subscriptionItem(subscription: Stripe.Subscription) {
  return subscription.items.data[0] ?? null;
}

function subscriptionPriceDetails(subscription: Stripe.Subscription) {
  const item = subscriptionItem(subscription);
  return {
    stripePriceId: item?.price?.id ?? null,
    stripeProductId: objectId(item?.price?.product),
    currentPeriodStart: unixToIso(item?.current_period_start),
    currentPeriodEnd: unixToIso(item?.current_period_end)
  };
}

async function findOwner(
  db: Firestore,
  subscription: Stripe.Subscription,
  metadata: Stripe.Metadata
) {
  const directUserId = typeof metadata.userId === "string" && metadata.userId ? metadata.userId : null;
  const subscriptionRef = db.collection("stripeSubscriptions").doc(subscription.id);
  const subscriptionSnap = await subscriptionRef.get();
  const existing = subscriptionSnap.exists ? subscriptionSnap.data() ?? {} : {};
  if (directUserId) return { userId: directUserId, existing, subscriptionRef };
  if (typeof existing.userId === "string" && existing.userId) {
    return { userId: existing.userId, existing, subscriptionRef };
  }

  const customerId = objectId(subscription.customer);
  if (customerId) {
    const subscriptionMatch = await db.collection("stripeSubscriptions").where("stripeCustomerId", "==", customerId).limit(1).get();
    const stored = subscriptionMatch.docs[0]?.data();
    if (typeof stored?.userId === "string" && stored.userId) {
      return { userId: stored.userId, existing: { ...stored, ...existing }, subscriptionRef };
    }
    const userMatch = await db.collection("users").where("stripeCustomerId", "==", customerId).limit(1).get();
    if (userMatch.docs[0]) {
      return { userId: userMatch.docs[0].id, existing, subscriptionRef };
    }
  }
  return { userId: null, existing, subscriptionRef };
}

export async function persistStripeSubscriptionLifecycle(
  db: Firestore,
  subscription: Stripe.Subscription,
  overrides: LifecycleOverrides
) {
  const metadata = subscription.metadata ?? {};
  const owner = await findOwner(db, subscription, metadata);
  if (!owner.userId) {
    return { handled: false, reason: "subscription_owner_not_found", subscriptionId: subscription.id };
  }

  const price = subscriptionPriceDetails(subscription);
  const pricePlan = getPlanByStripePriceId(price.stripePriceId);
  const metadataPlanId = overrides.trustedMetadataPlan ? validMetadataPlanId(metadata.planId) : null;
  const storedPlanId = validMetadataPlanId(owner.existing.planId);
  const unchangedStoredPrice = Boolean(storedPlanId && price.stripePriceId && owner.existing.stripePriceId === price.stripePriceId);
  const plan = pricePlan ?? (metadataPlanId ? getSubscriptionPlan(metadataPlanId) : null) ?? (unchangedStoredPrice ? getSubscriptionPlan(storedPlanId) : null);
  const baseInternalStatus = overrides.internalStatus ?? mapStripeSubscriptionStatus(subscription.status);
  const previousFailureCount = Number(owner.existing.paymentFailureCount ?? 0);
  const paymentFailureCount = overrides.paymentSucceeded ? 0 : overrides.paymentFailed ? previousFailureCount + 1 : previousFailureCount;
  const immediateCancellation = subscription.cancel_at_period_end || baseInternalStatus === "canceled";
  const internalStatus: InternalSubscriptionStatus = immediateCancellation
    ? "canceled"
    : overrides.paymentFailed && paymentFailureCount <= 2
      ? paymentFailureCount === 1 ? "payment_warning_1" : "payment_warning_2"
      : baseInternalStatus === "past_due" && paymentFailureCount > 0 && paymentFailureCount <= 2
        ? paymentFailureCount === 1 ? "payment_warning_1" : "payment_warning_2"
      : baseInternalStatus;
  const metadataAccountType = metadata.accountType === "sponsor" ? "sponsor" : metadata.accountType === "user" ? "user" : null;
  const accountType = metadataAccountType ?? (plan?.audience ?? null);
  const planMatchesAccount = Boolean(plan && accountType && plan.audience === accountType);
  const entitled = ["active", "payment_warning_1", "payment_warning_2"].includes(internalStatus) && planMatchesAccount;
  const canonicalPlanId = plan?.id && plan.id !== "free" ? plan.id as ProductPlanId : storedPlanId;
  const now = new Date().toISOString();
  const customerId = objectId(subscription.customer);
  const latestInvoiceId = overrides.latestInvoiceId ?? objectId(subscription.latest_invoice);
  const billingCycle = subscriptionItem(subscription)?.price?.recurring?.interval ?? metadata.billingCycle ?? "monthly";

  const record = {
    id: subscription.id,
    userId: owner.userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: price.stripePriceId,
    stripeProductId: price.stripeProductId,
    stripeStatus: subscription.status,
    internalStatus,
    currentPeriodStart: price.currentPeriodStart,
    currentPeriodEnd: price.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: unixToIso(subscription.canceled_at),
    endedAt: unixToIso(subscription.ended_at),
    trialStart: unixToIso(subscription.trial_start),
    trialEnd: unixToIso(subscription.trial_end),
    latestInvoiceId,
    latestPaymentIntentId: overrides.latestPaymentIntentId ?? owner.existing.latestPaymentIntentId ?? null,
    billingCycle,
    planId: canonicalPlanId ?? null,
    planAudience: plan?.audience ?? owner.existing.planAudience ?? null,
    accountType,
    entitlementActive: entitled,
    paymentFailureCount,
    paymentWarningState: internalStatus.startsWith("payment_warning_") ? internalStatus : null,
    accessDowngradeReason: immediateCancellation ? "cancellation_requested" : paymentFailureCount > 2 ? "payment_failure_limit_reached" : null,
    planResolution: pricePlan ? "stripe_price" : metadataPlanId ? "trusted_metadata" : unchangedStoredPrice ? "existing_price_match" : "unresolved",
    lastStripeEventId: overrides.eventId,
    lastStripeEventType: overrides.eventType,
    lastStripeEventCreated: overrides.eventCreated,
    createdAt: owner.existing.createdAt ?? now,
    updatedAt: now
  };

  const userRef = db.collection("users").doc(owner.userId);
  const profileRef = db.collection("profiles").doc(owner.userId);
  const result = await db.runTransaction(async (transaction) => {
    const [latestSnap, userSnap] = await Promise.all([
      transaction.get(owner.subscriptionRef),
      transaction.get(userRef)
    ]);
    const latestEventCreated = Number(latestSnap.data()?.lastStripeEventCreated ?? 0);
    if (latestEventCreated > overrides.eventCreated) {
      return { handled: true, stale: true, userId: owner.userId, subscriptionId: subscription.id };
    }

    const currentSubscriptionId = typeof userSnap.data()?.stripeSubscriptionId === "string"
      ? userSnap.data()!.stripeSubscriptionId as string
      : null;
    const affectsCurrentAccess = !currentSubscriptionId
      || currentSubscriptionId === subscription.id
      || Boolean(overrides.trustedMetadataPlan);
    const accessPlanId = entitled && canonicalPlanId ? canonicalPlanId : "free";
    transaction.set(owner.subscriptionRef, record, { merge: true });
    if (!affectsCurrentAccess) {
      return {
        handled: true,
        stale: false,
        currentAccessUnchanged: true,
        userId: owner.userId,
        subscriptionId: subscription.id,
        internalStatus,
        entitled,
        planId: canonicalPlanId ?? null
      };
    }
    transaction.set(userRef, {
      planId: accessPlanId,
      subscriptionPlanId: canonicalPlanId ?? null,
      subscriptionStatus: internalStatus,
      planStatus: internalStatus,
      stripeStatus: subscription.status,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      subscriptionCurrentPeriodEnd: price.currentPeriodEnd,
      subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
      updatedAt: now
    }, { merge: true });
    transaction.set(profileRef, {
      planId: accessPlanId,
      subscriptionPlanId: canonicalPlanId ?? null,
      premium: entitled,
      subscriptionStatus: internalStatus,
      planStatus: internalStatus,
      stripeStatus: subscription.status,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      subscriptionCurrentPeriodEnd: price.currentPeriodEnd,
      subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
      updatedAt: now
    }, { merge: true });
    return { handled: true, stale: false, userId: owner.userId, subscriptionId: subscription.id, internalStatus, entitled, planId: canonicalPlanId ?? null };
  });
  return result;
}

export function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  return objectId(invoice.parent?.subscription_details?.subscription);
}

export function invoicePaymentIntentId(invoice: Stripe.Invoice) {
  const invoiceRecord = invoice as unknown as Record<string, unknown>;
  const legacyPaymentIntent = objectId(invoiceRecord.payment_intent);
  if (legacyPaymentIntent) return legacyPaymentIntent;
  const payments = invoiceRecord.payments as { data?: Array<{ payment?: { payment_intent?: unknown } }> } | undefined;
  return objectId(payments?.data?.[0]?.payment?.payment_intent);
}

export function subscriptionMetadataFromCheckout(session: Stripe.Checkout.Session): Stripe.Metadata {
  return {
    ...(session.metadata ?? {}),
    userId: session.metadata?.userId ?? "",
    planId: session.metadata?.planId ?? "",
    planAudience: session.metadata?.planAudience ?? "",
    accountType: session.metadata?.accountType ?? "",
    billingCycle: session.metadata?.billingCycle ?? "monthly"
  };
}
