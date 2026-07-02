import { getStripe } from "@/lib/stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, forbidden, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { getSubscriptionPlan, resolveStripePriceEnv } from "@/lib/server/subscriptions";
import { isStripeDevMockEnabled, stripeDevMockCheckout } from "@/lib/server/stripe-dev";
import { normalizeAccountType } from "@/lib/plan-access";

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const planId = parsed.body?.planId;
  const plan = getSubscriptionPlan(planId);
  if (!plan || plan.id === "free") return validationError({ planId: "Select a valid paid subscription plan." });
  const db = getAdminDb();
  if (!db) return serverUnavailable("Stripe subscription checkout");
  const [userSnap, profileSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get()
  ]);
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
  if (!stripe || !priceId) {
    if (isStripeDevMockEnabled()) {
      const payload = stripeDevMockCheckout({ kind: "subscription", targetUrl: `/subscriptions?checkout=mock-success&plan=${encodeURIComponent(String(plan.id))}`, label: `subscription plan ${plan.id}` });
      return ok({ ...payload, missing: !stripe ? "STRIPE_SECRET_KEY" : envName, acceptedPriceEnvs: candidates }, payload.message);
    }
    return fail("Stripe subscription checkout is not configured.", 503, { missing: !stripe ? "STRIPE_SECRET_KEY" : envName, acceptedPriceEnvs: candidates }, "PAYMENT_CONFIGURATION_ERROR");
  }
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
      metadata: {
        userId: user.uid,
        planId: plan.id,
        planAudience: plan.audience,
        accountType,
        billingCycle: "monthly"
      }
    });
    if (!session.url) return fail("Stripe checkout did not return a redirect URL.", 502, undefined, "PAYMENT_PROVIDER_ERROR");
    return ok({ url: session.url }, "Stripe checkout session created.");
  } catch (error) {
    console.error("[stripe-subscription-checkout] session creation failed", {
      userId: user.uid,
      planId: plan.id,
      accountType,
      error: error instanceof Error ? error.message : "Unknown Stripe error"
    });
    return serverError("Stripe checkout could not be started.", "Stripe session creation failed.");
  }
}
