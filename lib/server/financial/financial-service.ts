import { addMinorUnits, normalizeCurrency } from "@/lib/server/financial/money";
import { financialIdempotencyKey } from "@/lib/server/financial/idempotency";
import type { FinancialAccountFoundation, FinancialLedgerEntryFoundation, FinancialTransactionFoundation, LedgerBucket, ProviderEventFoundation } from "@/lib/server/financial/financial-types";

export function createFinancialAccount(input: { userId: string; currencies?: string[]; kycStatus?: string; now?: string }): FinancialAccountFoundation {
  const now = input.now ?? new Date().toISOString();
  return {
    id: `financialAccount_${input.userId}`,
    userId: input.userId,
    status: "active",
    currencies: (input.currencies?.length ? input.currencies : ["USD"]).map((currency) => normalizeCurrency(currency)),
    withdrawalEligibility: "blocked",
    kycStatus: input.kycStatus ?? "not_started",
    payoutStatus: "not_configured",
    createdAt: now,
    updatedAt: now
  };
}

export function createLedgerEntry(input: Omit<FinancialLedgerEntryFoundation, "immutable" | "createdAt" | "providerReference"> & { createdAt?: string; providerReference?: string | null }): FinancialLedgerEntryFoundation {
  return {
    ...input,
    amountMinor: Math.trunc(Number(input.amountMinor) || 0),
    currency: normalizeCurrency(input.currency),
    immutable: true,
    createdAt: input.createdAt ?? new Date().toISOString(),
    providerReference: input.providerReference ?? null
  };
}

export function createTransaction(input: { id: string; transactionType: FinancialTransactionFoundation["transactionType"]; entries: FinancialLedgerEntryFoundation[]; idempotencyKey?: string; now?: string }): FinancialTransactionFoundation {
  const now = input.now ?? new Date().toISOString();
  return { id: input.id, status: "pending", transactionType: input.transactionType, entries: input.entries, idempotencyKey: input.idempotencyKey ?? financialIdempotencyKey(input.transactionType, input.id), reversalOfTransactionId: null, createdAt: now, updatedAt: now };
}

export function postLedgerEntries(transaction: FinancialTransactionFoundation) {
  return { ...transaction, status: "posted" as const, entries: transaction.entries.map((entry) => ({ ...entry, status: entry.status === "pending_hold" ? "pending_hold" as const : "posted" as const })) };
}

export function reserveFunds(accountId: string, amountMinor: number, currency = "USD") {
  return createLedgerEntry({ id: financialIdempotencyKey("reserve", accountId, amountMinor, currency), accountId, userId: null, direction: "debit", amountMinor, currency: normalizeCurrency(currency), bucket: "reserved", status: "reserved", transactionId: "foundation_reserved", sourceType: "adjustment", sourceId: "reserve_foundation", idempotencyKey: financialIdempotencyKey("reserve", accountId, amountMinor, currency), holdUntil: null, createdBy: "financial_service_foundation", metadata: { directBalanceMutationAllowed: false } });
}

export function releaseReservedFunds(entry: FinancialLedgerEntryFoundation) {
  return { ...entry, bucket: "available" as LedgerBucket, status: "posted" as const, metadata: { ...entry.metadata, releasedFromReserve: true } };
}

export function movePendingToAvailable(entry: FinancialLedgerEntryFoundation, now = new Date()) {
  const holdTime = entry.holdUntil ? Date.parse(entry.holdUntil) : Number.POSITIVE_INFINITY;
  if (now.getTime() < holdTime) return { allowed: false, entry, reason: "active_hold" };
  return { allowed: true, entry: { ...entry, bucket: "available" as LedgerBucket, status: "posted" as const }, reason: "hold_cleared" };
}

export function reverseTransaction(transaction: FinancialTransactionFoundation, reason: string) {
  return createTransaction({ id: `${transaction.id}_reversal`, transactionType: "adjustment", idempotencyKey: financialIdempotencyKey("reverse", transaction.id), entries: transaction.entries.map((entry) => createLedgerEntry({ ...entry, id: `${entry.id}_reversal`, direction: entry.direction === "credit" ? "debit" : "credit", idempotencyKey: financialIdempotencyKey("reverse", entry.id), metadata: { ...entry.metadata, reversalReason: reason } })) });
}

export function calculateAccountBalance(entries: FinancialLedgerEntryFoundation[], currency = "USD") {
  const normalized = normalizeCurrency(currency);
  const byBucket: Record<LedgerBucket, number> = { available: 0, pending: 0, reserved: 0, paidOut: 0, negativeBalance: 0 };
  for (const entry of entries) {
    if (entry.currency !== normalized || entry.status === "reversed") continue;
    const signed = entry.direction === "credit" ? entry.amountMinor : -entry.amountMinor;
    byBucket[entry.bucket] = addMinorUnits(byBucket[entry.bucket], signed);
  }
  return { currency: normalized, ...byBucket, sourceOfTruth: "ledger_entries", mutableUserBalanceTrusted: false };
}

export function reconcileProviderEvent(event: ProviderEventFoundation, existingEventIds: string[] = []) {
  if (existingEventIds.includes(event.providerEventId)) return { ...event, status: "ignored_duplicate" as const, processedAt: new Date().toISOString() };
  return { ...event, status: "processed" as const, processedAt: new Date().toISOString() };
}

export function createAdjustment(input: { accountId: string; userId: string; amountMinor: number; currency?: string; reason: string }) {
  const entry = createLedgerEntry({ id: financialIdempotencyKey("adjustment", input.accountId, input.reason), accountId: input.accountId, userId: input.userId, direction: input.amountMinor >= 0 ? "credit" : "debit", amountMinor: Math.abs(input.amountMinor), currency: normalizeCurrency(input.currency), bucket: input.amountMinor >= 0 ? "pending" : "negativeBalance", status: "pending_hold", transactionId: "adjustment_foundation", sourceType: "adjustment", sourceId: input.reason, idempotencyKey: financialIdempotencyKey("adjustment", input.accountId, input.reason), holdUntil: null, createdBy: "admin_finance_foundation", metadata: { correctionRequiresAudit: true } });
  return createTransaction({ id: `${entry.id}_tx`, transactionType: "adjustment", entries: [entry] });
}

export function createPayout() {
  return { payoutProviderCalled: false, status: "provider_setup_required", message: "Payout provider integration is deferred." };
}

export function createRefund() {
  return { refundProviderCalled: false, status: "provider_setup_required", reversalEntryRequired: true };
}
