import { getStripe } from "@/lib/stripe";
import { getAdminDb, getFirebaseAdminConfigStatus } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, forbidden, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { getSubscriptionPlan, resolveStripePriceEnv } from "@/lib/server/subscriptions";
import { isStripeDevMockEnabled, stripeDevMockCheckout } from "@/lib/server/stripe-dev";
import { normalizeAccountType } from "@/lib/plan-access";

type StripeErrorDetails = {
  type: string | null;
  code: string | null;
  message: string;
  requestId: string | null;
};

function maskStripeIdentifier(value: string | undefined) {
  if (!value) return null;
  if (value.length <= 12) return `${value.slice(0, 6)}...`;
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}

function safeStripeMessage(message: string) {
  return message.replace(/\b(?:price|prctbl|prod|sk|whsec)_[A-Za-z0-9_]+\b/g, (value) => maskStripeIdentifier(value) ?? "stripe_...");
}

function stripeErrorDetails(error: unknown): StripeErrorDetails {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const raw = value.raw && typeof value.raw === "object" ? value.raw as Record<string, unknown> : {};
  return {
    type: typeof value.type === "string" ? value.type : typeof raw.type === "string" ? raw.type : null,
    code: typeof value.code === "string" ? value.code : typeof raw.code === "string" ? raw.code : null,
    message: safeStripeMessage(error instanceof Error ? error.message : "Unknown Stripe error"),
    requestId: typeof value.requestId === "string" ? value.requestId : typeof raw.requestId === "string" ? raw.requestId : null
  };
}

function checkoutFailure(details: StripeErrorDetails, envName: string) {
  const authenticationFailed = details.type === "StripeAuthenticationError";
  const priceRejected = details.code === "resource_missing" || /no such price|price/i.test(details.message);
  if (authenticationFailed) {
    return {
      code: "PAYMENT_PROVIDER_AUTHENTICATION_ERROR",
      message: "Stripe authentication failed. Verify the server test-mode secret key."
    };
  }
  if (priceRejected) {
    return {
      code: "PAYMENT_PRICE_REJECTED",
      message: `Stripe rejected the configured plan Price ID. Confirm ${envName} contains a recurring price_ ID from the same Stripe test or live mode as STRIPE_SECRET_KEY.`
    };
  }
  return {
    code: "PAYMENT_PROVIDER_ERROR",
    message: "Stripe rejected the checkout request. Verify the plan Price and Stripe account configuration."
  };
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const planId = parsed.body?.planId;
  const plan = getSubscriptionPlan(planId);
  if (!plan || plan.id === "free") return validationError({ planId: "Select a valid paid subscription plan." });
  let db: ReturnType<typeof getAdminDb>;
  try {
    db = getAdminDb();
  } catch (error) {
    const adminStatus = getFirebaseAdminConfigStatus();
    console.error("[stripe-subscription-checkout] Firebase Admin initialization failed", {
      planId: plan.id,
      planAudience: plan.audience,
      firebaseConfigured: adminStatus.configured,
      missingFirebaseEnv: adminStatus.missing,
      errorType: error instanceof Error ? error.name : "FirebaseAdminInitializationError"
    });
    return fail("Checkout account verification is temporarily unavailable.", 503, { stage: "firebase_admin" }, "SERVER_CONFIGURATION_ERROR");
  }
  if (!db) return serverUnavailable("Stripe subscription checkout");
  let userSnap;
  let profileSnap;
  try {
    [userSnap, profileSnap] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get()
    ]);
  } catch (error) {
    console.error("[stripe-subscription-checkout] account lookup failed", {
      planId: plan.id,
      planAudience: plan.audience,
      firebaseConfigured: getFirebaseAdminConfigStatus().configured,
      errorType: error instanceof Error ? error.name : "FirestoreAccountLookupError"
    });
    return fail("Checkout account verification is temporarily unavailable.", 503, { stage: "account_lookup" }, "SERVER_DATA_ACCESS_ERROR");
  }
  const account = userSnap.exists ? userSnap.data() ?? {} : {};
  const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
  const accountType = normalizeAccountType({ ...profile, ...account });
  if (plan.audience !== accountType) {
    return forbidden(accountType === "sponsor"
      ? "Sponsor accounts can only purchase sponsor plans."
      : "User and creator accounts can only purchase user plans.");
  }
  const stripe = getStripe();
  const { envName, priceId, candidates } = resolveStripePriceEnv(plan);
  const appUrlConfigured = Boolean(process.env.NEXT_PUBLIC_APP_URL);
  const configuration = {
    STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
    NEXT_PUBLIC_APP_URL: appUrlConfigured,
    planPrice: Boolean(priceId)
  };
  if (!stripe || !priceId) {
    if (isStripeDevMockEnabled()) {
      const payload = stripeDevMockCheckout({ kind: "subscription", targetUrl: `/subscriptions?checkout=mock-success&plan=${encodeURIComponent(String(plan.id))}`, label: `subscription plan ${plan.id}` });
      return ok({ ...payload, missing: !stripe ? "STRIPE_SECRET_KEY" : envName, acceptedPriceEnvs: candidates }, payload.message);
    }
    const missing = !stripe ? "STRIPE_SECRET_KEY" : envName;
    console.error("[stripe-subscription-checkout] configuration missing", {
      planId: plan.id,
      planAudience: plan.audience,
      accountType,
      configuration,
      missing
    });
    return fail(
      !stripe ? "Stripe is not configured for subscription checkout." : `The Stripe Price for the ${plan.name} plan is not configured.`,
      503,
      { missing, acceptedPriceEnvs: candidates },
      "PAYMENT_CONFIGURATION_ERROR"
    );
  }
  if (process.env.NODE_ENV === "production" && !appUrlConfigured) {
    console.error("[stripe-subscription-checkout] configuration missing", {
      planId: plan.id,
      planAudience: plan.audience,
      accountType,
      configuration,
      missing: "NEXT_PUBLIC_APP_URL"
    });
    return fail("Stripe checkout return URL is not configured.", 503, { missing: "NEXT_PUBLIC_APP_URL" }, "PAYMENT_CONFIGURATION_ERROR");
  }
  const priceHasExpectedPrefix = priceId.startsWith("price_");
  if (!priceHasExpectedPrefix) {
    console.error("[stripe-subscription-checkout] invalid plan price configuration", {
      planId: plan.id,
      planAudience: plan.audience,
      accountType,
      configuration,
      priceEnv: envName,
      priceId: maskStripeIdentifier(priceId),
      priceHasExpectedPrefix
    });
    return fail(
      `The configured Stripe Price for the ${plan.name} plan is invalid. ${envName} must contain a price_ ID, not a Product or Pricing Table ID.`,
      503,
      { priceEnv: envName, expectedPrefix: "price_" },
      "PAYMENT_PRICE_CONFIGURATION_ERROR"
    );
  }
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    const metadata = {
      userId: user.uid,
      planId: plan.id,
      planAudience: plan.audience,
      accountType,
      billingCycle: "monthly"
    };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&plan=${encodeURIComponent(plan.id)}`,
      cancel_url: `${origin}/checkout/cancel`,
      metadata,
      subscription_data: { metadata }
    });
    if (!session.url) return fail("Stripe checkout did not return a redirect URL.", 502, undefined, "PAYMENT_PROVIDER_ERROR");
    return ok({ url: session.url }, "Stripe checkout session created.");
  } catch (error) {
    const stripeError = stripeErrorDetails(error);
    const failure = checkoutFailure(stripeError, envName);
    console.error("[stripe-subscription-checkout] session creation failed", {
      planId: plan.id,
      planAudience: plan.audience,
      accountType,
      configuration,
      priceEnv: envName,
      priceId: maskStripeIdentifier(priceId),
      priceHasExpectedPrefix,
      stripeErrorType: stripeError.type,
      stripeErrorCode: stripeError.code,
      stripeErrorMessage: stripeError.message,
      stripeRequestId: stripeError.requestId
    });
    return fail(failure.message, 502, {
      planId: plan.id,
      priceEnv: envName,
      providerCode: stripeError.code,
      requestId: stripeError.requestId
    }, failure.code);
  }
}
