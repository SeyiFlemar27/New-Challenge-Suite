export function isStripeDevMockEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.STRIPE_ENABLE_DEV_MOCK_CHECKOUT !== "false";
}

export function stripeDevMockCheckout(input: { kind: "subscription" | "dorocoin"; targetUrl: string; label: string }) {
  return {
    mode: "mock" as const,
    url: input.targetUrl,
    checkoutUrl: input.targetUrl,
    message: `Stripe is not configured. Development checkout flow only for ${input.label}. No payment was processed.`,
    paymentProcessed: false,
    coinsCredited: false,
    subscriptionActivated: false,
    planActivated: false,
    fundsCaptured: false,
    payoutEnabled: false,
    developmentOnly: true
  };
}