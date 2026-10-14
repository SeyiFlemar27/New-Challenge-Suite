/** No adapter is selected or activated until business/compliance approval and sandbox verification. */
export type VerifiedBankDestination = { providerDestinationId: string; userId: string; country: "US"; currency: "USD"; verificationStatus: "verified" };
export type VerifiedPayoutQuote = { providerQuoteId: string; requestedAmountCents: number; providerFeeCents: number; netDisbursementCents: number; currency: "USD"; expiresAt: string };
export type ProviderPayoutState = "submitted" | "processing" | "succeeded" | "failed" | "rejected" | "reversed";
export interface ApprovedPayoutProvider {
  readonly approvedProviderId: string;
  verifyKyc(userId: string): Promise<{ verified: boolean; providerVerificationId: string }>;
  verifyDestination(userId: string, destinationId: string): Promise<VerifiedBankDestination>;
  quote(amountCents: number, destination: VerifiedBankDestination): Promise<VerifiedPayoutQuote>;
  submit(input: { withdrawalId: string; idempotencyKey: string; destination: VerifiedBankDestination; quote: VerifiedPayoutQuote }): Promise<{ providerPayoutId: string; state: "submitted" | "processing" }>;
  retrieve(providerPayoutId: string): Promise<{ providerPayoutId: string; state: ProviderPayoutState; amountCents: number; currency: "USD"; settledAt: string | null }>;
  verifyCallback(request: Request): Promise<{ verified: boolean; providerEventId: string; providerPayoutId: string }>;
}
export function configuredPayoutProvider(): ApprovedPayoutProvider | null { return null; }
