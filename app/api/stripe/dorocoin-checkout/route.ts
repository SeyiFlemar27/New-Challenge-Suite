import { getStripe } from "@/lib/stripe";
import { requireRequestUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/firebase/admin";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

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
  const stripePriceId = !customCoins && typeof pack.stripePriceId === "string" ? pack.stripePriceId : !customCoins && typeof pack.stripePriceEnv === "string" ? process.env[pack.stripePriceEnv] : null;
  if (!stripe || (!customCoins && !stripePriceId)) {
    const ref = db.collection("doroCoinPurchaseRequests").doc();
    const now = new Date().toISOString();
    const purchaseRequest = { id: ref.id, userId: user.uid, packageId: packageId || null, coins, amountUsd, status: "pending_payment_configuration", createdAt: now, updatedAt: now };
    await ref.set(purchaseRequest);
    return ok({ purchaseRequest, paymentPending: true }, "Payment is pending. Stripe checkout is not fully configured yet.");
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
