import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { deterministicId } from "@/lib/server/idempotency";
import { getPaymentStatus } from "@/lib/server/monetization-payments";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
import { PAYMENT_PURPOSES, normalizeVerifiedPaymentState, type PaymentPurpose } from "@/lib/payment-purposes";

const allowedPurposes = new Set<PaymentPurpose>(Object.values(PAYMENT_PURPOSES));

function summary(purpose: PaymentPurpose, record: Record<string, unknown> | null) {
  const webhookConfirmed = record?.webhookConfirmed === true || record?.entitlementActive === true;
  const status = record?.internalStatus ?? record?.status ?? record?.planStatus;
  return {
    purpose,
    state: normalizeVerifiedPaymentState(status, webhookConfirmed),
    amountCents: Number.isFinite(Number(record?.amountCents)) ? Number(record?.amountCents) : null,
    currency: String(record?.currency ?? "USD").toUpperCase(),
    provider: "stripe" as const,
    providerReference: String(record?.providerSessionId ?? record?.stripeCheckoutSessionId ?? record?.stripeSubscriptionId ?? "") || null,
    resourceId: String(record?.id ?? record?.challengeId ?? "") || null,
    confirmedAt: String(record?.confirmedAt ?? record?.paidAt ?? record?.activatedAt ?? "") || null,
    webhookConfirmed,
    units: Number.isFinite(Number(record?.amount)) ? Number(record?.amount) : null,
    planId: String(record?.planId ?? "") || null,
    billingCycle: String(record?.billingCycle ?? "") || null,
    currentPeriodEnd: String(record?.currentPeriodEnd ?? "") || null
  };
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Payment status");

  const url = new URL(request.url);
  const purpose = url.searchParams.get("purpose") as PaymentPurpose | null;
  const reference = url.searchParams.get("reference") ?? "";
  if (!purpose || !allowedPurposes.has(purpose)) return fail("Payment purpose is not supported.", 400, undefined, "VALIDATION_ERROR");

  let record: Record<string, unknown> | null = null;
  if (purpose === PAYMENT_PURPOSES.subscription) {
    const account = await db.collection("users").doc(user.uid).get();
    record = account.exists ? { id: account.id, ...account.data() } : null;
  } else if (purpose === PAYMENT_PURPOSES.dorocoin && reference) {
    const id = deterministicId("stripe_session", reference, "dorocoin_purchase");
    const transaction = await db.collection("doroCoinTransactions").doc(id).get();
    record = transaction.exists && transaction.data()?.userId === user.uid
      ? { id: transaction.id, status: "confirmed", webhookConfirmed: true, providerSessionId: reference, confirmedAt: transaction.data()?.createdAt, ...transaction.data() }
      : null;
  } else if (purpose === PAYMENT_PURPOSES.challengeEntry && reference) {
    record = await getPaymentStatus(db, "challengeEntryPayments", reference, "userId", user.uid);
  } else if (purpose === PAYMENT_PURPOSES.votes && reference) {
    record = await getPaymentStatus(db, "paidVotePurchases", reference, "userId", user.uid);
  } else if (purpose === PAYMENT_PURPOSES.sponsor && reference) {
    record = await getPaymentStatus(db, "sponsorContributions", reference, "sponsorId", user.uid);
  } else {
    return ok(summary(purpose, null), "Payment is awaiting a supported provider record.");
  }

  return ok(summary(purpose, record), record ? "Verified payment status loaded." : "Payment confirmation is still processing.");
}
