import { getAdminDb } from "@/lib/firebase/admin";
import { deterministicId } from "@/lib/server/idempotency";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable, validationError } from "@/lib/server/responses";
import { PAYMENT_PURPOSES, normalizeVerifiedPaymentState, type PaymentPurpose } from "@/lib/payment-purposes";
import { getStripe } from "@/lib/stripe";

type CheckoutRecord = Record<string, unknown> & { id: string };

function paymentPurpose(metadata: Record<string, string>): PaymentPurpose | null {
  switch (metadata.paymentPurpose) {
    case "subscription_payment": return PAYMENT_PURPOSES.subscription;
    case "dorocoin_purchase": return PAYMENT_PURPOSES.dorocoin;
    case "challenge_credit_purchase": return PAYMENT_PURPOSES.challengeCredits;
    case "challenge_entry_fee":
    case "challenge_entry": return PAYMENT_PURPOSES.challengeEntry;
    case "paid_vote": return PAYMENT_PURPOSES.votes;
    case "prize_pool_funding": return PAYMENT_PURPOSES.prizePool;
    case "sponsor_funding": return PAYMENT_PURPOSES.sponsor;
    case "sponsor_wallet_funding": return PAYMENT_PURPOSES.sponsorWallet;
    default: return null;
  }
}

function verifiedSummary(purpose: PaymentPurpose, record: CheckoutRecord | null, providerStatus: string) {
  const webhookConfirmed = record?.webhookConfirmed === true
    || record?.providerConfirmed === true
    || record?.balanceCredited === true
    || record?.entitlementActive === true;
  const status = record?.internalStatus ?? record?.status ?? record?.planStatus ?? providerStatus;
  return {
    purpose,
    state: normalizeVerifiedPaymentState(status, webhookConfirmed),
    amountCents: Number.isFinite(Number(record?.amountCents)) ? Number(record?.amountCents) : null,
    currency: String(record?.currency ?? "USD").toUpperCase(),
    provider: "stripe" as const,
    providerReference: String(record?.providerSessionId ?? record?.stripeCheckoutSessionId ?? "") || null,
    resourceId: String(record?.id ?? record?.challengeId ?? "") || null,
    confirmedAt: String(record?.confirmedAt ?? record?.paidAt ?? record?.activatedAt ?? "") || null,
    webhookConfirmed
  };
}

async function ownedRecord(
  db: FirebaseFirestore.Firestore,
  collection: string,
  id: string,
  userId: string,
  ownerField = "userId"
): Promise<CheckoutRecord | null> {
  const snap = await db.collection(collection).doc(id).get();
  if (!snap.exists || snap.data()?.[ownerField] !== userId) return null;
  return { id: snap.id, ...snap.data() };
}

async function checkoutRecord(
  db: FirebaseFirestore.Firestore,
  purpose: PaymentPurpose,
  metadata: Record<string, string>,
  userId: string,
  sessionId: string
): Promise<CheckoutRecord | null> {
  switch (purpose) {
    case PAYMENT_PURPOSES.subscription:
      return ownedRecord(db, "users", userId, userId);
    case PAYMENT_PURPOSES.dorocoin:
      return ownedRecord(db, "doroCoinPurchases", deterministicId("dorocoin_purchase", sessionId), userId);
    case PAYMENT_PURPOSES.challengeCredits:
      return ownedRecord(db, "challengeCreditPurchases", deterministicId("challenge_credit_purchase", sessionId), userId);
    case PAYMENT_PURPOSES.challengeEntry:
      return metadata.entryPaymentId ? ownedRecord(db, "challengeEntryPayments", metadata.entryPaymentId, userId) : null;
    case PAYMENT_PURPOSES.votes:
      return metadata.votePurchaseId ? ownedRecord(db, "paidVotePurchases", metadata.votePurchaseId, userId) : null;
    case PAYMENT_PURPOSES.prizePool:
      return metadata.creatorPrizeFundingId ? ownedRecord(db, "creatorPrizeFundingPayments", metadata.creatorPrizeFundingId, userId) : null;
    case PAYMENT_PURPOSES.sponsor:
      return metadata.sponsorContributionId ? ownedRecord(db, "sponsorContributions", metadata.sponsorContributionId, userId, "sponsorId") : null;
    case PAYMENT_PURPOSES.sponsorWallet:
      return metadata.sponsorWalletFundingId ? ownedRecord(db, "sponsorWalletFunding", metadata.sponsorWalletFundingId, userId) : null;
  }
  return null;
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id")?.trim() ?? "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return validationError({ session_id: "A valid checkout session is required." });

  const stripe = getStripe();
  const db = getAdminDb();
  if (!stripe || !db) return serverUnavailable("Checkout verification");

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });
    const metadata = session.metadata ?? {};
    if (metadata.userId !== user.uid) return fail("This checkout is not available for the current account.", 404, undefined, "CHECKOUT_NOT_FOUND");
    const purpose = paymentPurpose(metadata);
    if (!purpose) return fail("This checkout type is not supported.", 422, undefined, "CHECKOUT_PURPOSE_UNSUPPORTED");
    const requestedPurpose = url.searchParams.get("purpose");
    if (requestedPurpose && requestedPurpose !== purpose) return validationError({ purpose: "Checkout purpose does not match the return request." });
    const record = await checkoutRecord(db, purpose, metadata, user.uid, session.id);
    const providerStatus = session.status === "expired" ? "expired" : session.payment_status === "paid" ? "pending" : session.status ?? "pending";
    const lineItems = session.line_items?.data.map((item) => ({ description: item.description ?? null, quantity: item.quantity ?? 0, amountCents: item.amount_total ?? 0, currency: item.currency?.toUpperCase() ?? null })) ?? [];
    return ok({ ...verifiedSummary(purpose, record, providerStatus), lineItems }, record ? "Verified checkout status loaded." : "Payment confirmation is still processing.");
  } catch (error) {
    console.error("[verify-checkout] verification failed", { sessionId, errorType: error instanceof Error ? error.name : "CheckoutVerificationError" });
    return fail("Checkout verification is temporarily unavailable. Please try again shortly.", 502, undefined, "CHECKOUT_VERIFICATION_UNAVAILABLE");
  }
}
