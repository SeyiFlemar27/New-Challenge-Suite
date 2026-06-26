import { getStripe } from "@/lib/stripe";
import { requireRequestUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/firebase/admin";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { isStripeDevMockEnabled, stripeDevMockCheckout } from "@/lib/server/stripe-dev";
function resolveDoroCoinStripePriceId(pack: Record<string, unknown>, packageId: string, coins: number) {
  const envCandidates = [
    typeof pack.stripePriceEnv === "string" ? pack.stripePriceEnv : null,
    packageId ? `STRIPE_${packageId.toUpperCase()}_PRICE_ID` : null,
    coins === 50 ? "STRIPE_DOROCOIN_SMALL_PRICE_ID" : null,
    coins === 100 ? "STRIPE_DOROCOIN_MEDIUM_PRICE_ID" : null,
    coins === 500 ? "STRIPE_DOROCOIN_LARGE_PRICE_ID" : null,
    coins ? `STRIPE_PRICE_DOROCOIN_${coins}` : null
  ].filter(Boolean) as string[];
  const configuredEnv = envCandidates.find((name) => Boolean(process.env[name]));
  return typeof pack.stripePriceId === "string" && pack.stripePriceId ? pack.stripePriceId : configuredEnv ? process.env[configuredEnv] ?? null : null;
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const packageId = String(parsed.body?.packageId ?? "");
  const customCoins = Number(parsed.body?.customCoins ?? 0);
  if (!packageId && !customCoins) return validationError({ packageId: "Select a valid DoroCoin package or enter a custom amount." });
  if (customCoins && (!Number.isInteger(customCoins) || customCoins < 50 || customCoins > 10000)) return validationError({ customCoins: "Custom DoroCoin purchase must be a whole number between 50 and 10,000." });
  const db = getAdminDb();
  if (!db) return serverUnavailable("DoroCoin checkout");
  const packageSnap = packageId ? await db.collection("doroCoinPackages").doc(packageId).get() : null;
  if (packageId && !packageSnap?.exists) return validationError({ packageId: "Select a valid DoroCoin package." });
  const pack = packageSnap?.data() ?? {};
  if (packageId && pack.status !== "active") return validationError({ packageId: "This DoroCoin package is not available." });
  const coins = customCoins || Number(pack.coins);
  if (!Number.isFinite(coins) || coins <= 0) return validationError({ packageId: "DoroCoin package is missing a valid coin amount." });
  const amountUsd = customCoins ? Number((coins * 0.02).toFixed(2)) : Number(pack.price ?? 0);
  const stripe = getStripe();
  const stripePriceId = !customCoins ? resolveDoroCoinStripePriceId(pack, packageId, coins) : null;
  if (!stripe || (!customCoins && !stripePriceId)) {
    if (isStripeDevMockEnabled()) {
      const payload = stripeDevMockCheckout({ kind: "dorocoin", targetUrl: `/wallet?checkout=mock-success&coins=${encodeURIComponent(String(coins))}`, label: `${coins} DoroCoins` });
      return ok({ ...payload, packageId: packageId || null, coins, amountUsd, missing: !stripe ? "STRIPE_SECRET_KEY" : "DOROCOIN_STRIPE_PRICE_ID" }, payload.message);
    }
    return fail("Stripe DoroCoin checkout is not configured.", 503, { missing: !stripe ? "STRIPE_SECRET_KEY" : "DOROCOIN_STRIPE_PRICE_ID" }, "PAYMENT_CONFIGURATION_ERROR");
  }
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: customCoins
      ? [{ price_data: { currency: "usd", unit_amount: Math.round(amountUsd * 100), product_data: { name: `${coins} DoroCoins` } }, quantity: 1 }]
      : [{ price: stripePriceId!, quantity: 1 }],
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout/cancel`,
    metadata: { type: "dorocoin_purchase", packageId, customCoins: customCoins ? "true" : "false", userId: user.uid, coins: String(coins) }
  });
  return ok({ url: session.url }, "Stripe DoroCoin checkout session created.");
}
