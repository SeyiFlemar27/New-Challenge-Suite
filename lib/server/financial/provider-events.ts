import { financialIdempotencyKey } from "@/lib/server/financial/idempotency";
import type { ProviderEventFoundation } from "@/lib/server/financial/financial-types";

export function providerEventFoundation(input: { provider: ProviderEventFoundation["provider"]; providerEventId: string; paymentPurpose?: string | null; now?: string }): ProviderEventFoundation {
  const now = input.now ?? new Date().toISOString();
  return {
    id: financialIdempotencyKey("provider_event", input.provider, input.providerEventId),
    provider: input.provider,
    providerEventId: input.providerEventId,
    paymentPurpose: input.paymentPurpose ?? null,
    status: "received",
    idempotencyKey: financialIdempotencyKey(input.provider, input.providerEventId),
    payloadStoredSafely: true,
    rawSecretStored: false,
    createdAt: now,
    processedAt: null
  };
}
