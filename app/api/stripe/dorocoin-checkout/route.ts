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
  if (!packageId) return validationError({ packageId: "Select a valid DoroCoin package." });
  const db = getAdminDb();
  if (!db) return serverUnavailable("DoroCoin checkout");
  const packageSnap = await db.collection("doroCoinPackages").doc(packageId).get();
  if (!packageSnap.exists) return validationError({ packageId: "Select a valid DoroCoin package." });
  const pack = packageSnap.data() ?? {};
  if (pack.status !== "active") return validationError({ packageId: "This DoroCoin package is not available." });
  const coins = Number(pack.coins);
  if (!Number.isFinite(coins) || coins <= 0) return validationError({ packageId: "DoroCoin package is missing a valid coin amount." });
  const stripe = getStripe();
  const stripePriceId = typeof pack.stripePriceId === "string" ? pack.stripePriceId : typeof pack.stripePriceEnv === "string" ? process.env[pack.stripePriceEnv] : null;
  if (!stripe || !stripePriceId) return fail("Stripe DoroCoin checkout is not configured.", 503, { missing: !stripe ? "STRIPE_SECRET_KEY" : "doroCoinPackages.stripePriceId" }, "PAYMENT_CONFIGURATION_ERROR");
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: stripePriceId, quantity: 1 }],
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout/cancel`,
    metadata: { type: "dorocoin_purchase", packageId, userId: user.uid, coins: String(coins) }
  });
  return ok({ url: session.url }, "Stripe DoroCoin checkout session created.");
}
