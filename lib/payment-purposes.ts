export const PAYMENT_PURPOSES = {
  subscription: "subscription_payment",
  dorocoin: "dorocoin_purchase",
  challengeEntry: "challenge_entry_payment",
  prizePool: "prize_pool_funding",
  sponsor: "sponsor_contribution",
  votes: "vote_purchase",
  boost: "challenge_boost_purchase",
  platformPrize: "platform_prize_funding"
} as const;

export type PaymentPurpose = typeof PAYMENT_PURPOSES[keyof typeof PAYMENT_PURPOSES];

export type VerifiedPaymentState = "processing" | "confirmed" | "failed" | "requires_action" | "refunded" | "reversed";

export type VerifiedPaymentSummary = {
  purpose: PaymentPurpose;
  state: VerifiedPaymentState;
  amountCents: number | null;
  currency: string;
  provider: "stripe";
  providerReference: string | null;
  resourceId: string | null;
  confirmedAt: string | null;
  webhookConfirmed: boolean;
};

export function normalizeVerifiedPaymentState(status: unknown, webhookConfirmed: unknown): VerifiedPaymentState {
  const value = String(status ?? "").toLowerCase();
  if (["paid", "confirmed", "active"].includes(value) && webhookConfirmed === true) return "confirmed";
  if (["failed", "canceled", "cancelled", "expired"].includes(value)) return "failed";
  if (value === "refunded") return "refunded";
  if (["reversed", "chargeback", "disputed"].includes(value)) return "reversed";
  if (["requires_action", "requires_payment_method"].includes(value)) return "requires_action";
  return "processing";
}
