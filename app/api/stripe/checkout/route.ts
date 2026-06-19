import { getStripe } from "@/lib/stripe";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, validationError } from "@/lib/server/responses";
import { getSubscriptionPlan } from "@/lib/server/subscriptions";

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const planId = parsed.body?.planId;
  const plan = getSubscriptionPlan(planId);
  if (!plan) return validationError({ planId: "Select a valid paid subscription plan." });
  const stripe = getStripe();
  const price = process.env[plan.stripePriceEnv];
  if (!stripe || !price) {
    return fail("Stripe subscription checkout is not configured.", 503, { missing: !stripe ? "STRIPE_SECRET_KEY" : plan.stripePriceEnv }, "PAYMENT_CONFIGURATION_ERROR");
  }
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout/cancel`,
    metadata: { planId, userId: user.uid }
  });
  return ok({ url: session.url }, "Stripe checkout session created.");
}
