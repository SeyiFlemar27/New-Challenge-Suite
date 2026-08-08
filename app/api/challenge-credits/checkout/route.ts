import { getAdminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe";
import { requireRequestUser } from "@/lib/server/auth";
import { getActiveEconomyRules } from "@/lib/server/economy-rules";
import { deterministicId } from "@/lib/server/idempotency";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const packageId = String(parsed.body?.packageId ?? "");
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge Credit checkout");
  const rules = await getActiveEconomyRules(db);
  const pack = rules.challengeCredits.packages.find((item) => item.id === packageId);
  if (!pack) return validationError({ packageId: "Select a valid Challenge Credit package." });
  const stripe = getStripe();
  if (!stripe) return fail("Stripe Challenge Credit checkout is not configured.", 503, undefined, "PAYMENT_CONFIGURATION_ERROR");
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({ mode: "payment", line_items: [{ price_data: { currency: "usd", unit_amount: pack.priceCents, product_data: { name: `${pack.credits.toLocaleString()} Challenge Credits` } }, quantity: 1 }], success_url: `${origin}/challenge-credits/success?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${origin}/checkout/cancel`, metadata: { type: "challenge_credit_purchase", paymentPurpose: "challenge_credit_purchase", userId: user.uid, packageId: pack.id, credits: String(pack.credits), ruleVersion: rules.version } });
  const purchaseId = deterministicId("challenge_credit_purchase", session.id);
  await db.collection("challengeCreditPurchases").doc(purchaseId).set({ id: purchaseId, userId: user.uid, packageId: pack.id, credits: pack.credits, amountCents: pack.priceCents, currency: "USD", provider: "stripe", providerSessionId: session.id, status: "pending_payment", ruleVersion: rules.version, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), balanceCredited: false });
  return ok({ url: session.url, purchaseId, status: "pending_payment" }, "Challenge Credit checkout created. Credits are added only after provider confirmation.");
}
