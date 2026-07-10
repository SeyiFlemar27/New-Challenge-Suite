import { getAdminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

export async function PATCH(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Subscription management");
  const stripe = getStripe();
  if (!stripe) return fail("Stripe subscription management is not configured.", 503, undefined, "PAYMENT_CONFIGURATION_ERROR");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  if (parsed.body?.action !== "cancel") return validationError({ action: "Only subscription cancellation is supported in this phase." });

  const accountSnap = await db.collection("users").doc(user.uid).get();
  const subscriptionId = accountSnap.data()?.stripeSubscriptionId;
  if (typeof subscriptionId !== "string" || !subscriptionId.startsWith("sub_")) {
    return fail("No active Stripe subscription was found for this account.", 404, undefined, "NOT_FOUND");
  }
  try {
    await stripe.subscriptions.cancel(subscriptionId);
    return ok({ webhookPending: true }, "Cancellation confirmed. The verified Stripe webhook immediately returns the account to Free access.");
  } catch (error) {
    console.error("[stripe-subscription:cancel]", {
      userId: user.uid,
      errorType: error && typeof error === "object" && "type" in error ? error.type : "unknown",
      errorCode: error && typeof error === "object" && "code" in error ? error.code : "unknown"
    });
    return serverError("Subscription cancellation could not be requested.", "Stripe subscription update failed.");
  }
}
