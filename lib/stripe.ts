import Stripe from "stripe";

let testStripeClient: Stripe | null = null;

/** Installs a deterministic provider boundary for route-level tests. */
export function setStripeClientForTests(client: Stripe | null) {
  if (process.env.NODE_ENV === "production" && !process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Test Stripe clients are only available in non-production or emulator runs.");
  }
  testStripeClient = client;
}

export function getStripe() {
  if (testStripeClient) return testStripeClient;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}
