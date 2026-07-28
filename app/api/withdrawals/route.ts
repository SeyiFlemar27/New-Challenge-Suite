import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { ensureCashWalletFoundation, normalizeCashWallet } from "@/lib/server/cash-wallet";
import { createWithdrawalRequest, maskAccount, MAX_DAILY_WITHDRAWAL_CENTS, MIN_WITHDRAWAL_CENTS } from "@/lib/server/withdrawals";
import { loadKycMetadata } from "@/lib/server/kyc";
import { WALLET_POLICY_COPY, WITHDRAWAL_ARCHITECTURE_CONFIG, getWithdrawalDisabledReasons, isEligibleEarningAccount } from "@/lib/server/wallet-architecture";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Withdrawals");
  const walletRef = await ensureCashWalletFoundation(db, user.uid);
  const [walletSnap, requestSnap, accountSnap] = await Promise.all([
    walletRef.get(),
    db.collection("withdrawalRequests").where("userId", "==", user.uid).limit(100).get(),
    db.collection("users").doc(user.uid).get()
  ]);
  const accountType = String(accountSnap.data()?.accountType ?? accountSnap.data()?.role ?? "user");
  const kyc = await loadKycMetadata(db, user.uid);
  const wallet = normalizeCashWallet(user.uid, walletSnap.data());
  const hasCashEarnings = wallet.availableBalanceCents > 0 || wallet.pendingBalanceCents > 0 || wallet.underReviewBalanceCents > 0 || wallet.lifetimeEarningsCents > 0;
  const disabledReasons = getWithdrawalDisabledReasons({
    accountType,
    availableBalanceCents: wallet.availableBalanceCents,
    kycStatus: String(kyc.kycStatus),
    payoutMethodConfigured: false,
    hasCashEarnings
  });
  const requests = requestSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data(), payoutProviderReference: null } as Record<string, unknown> & { id: string }))
    .sort((left, right) => Date.parse(String(right.createdAt ?? "")) - Date.parse(String(left.createdAt ?? "")));
  return ok({
    wallet,
    requests,
    minimumWithdrawalCents: MIN_WITHDRAWAL_CENTS,
    maximumDailyWithdrawalCents: MAX_DAILY_WITHDRAWAL_CENTS,
    withdrawalsConfigured: WITHDRAWAL_ARCHITECTURE_CONFIG.withdrawalsEnabled,
    withdrawalRequestCreationEnabled: true,
    payoutMethodCollectionEnabled: true,
    payoutProviderConfigured: WITHDRAWAL_ARCHITECTURE_CONFIG.payoutProviderConfigured,
    adminReviewRequired: WITHDRAWAL_ARCHITECTURE_CONFIG.adminReviewRequired,
    kycProcessingActive: kyc.providerConfigured,
    kycStatus: kyc.kycStatus,
    automaticPayoutsActive: false,
    accountType,
    eligibleForCashWithdrawals: isEligibleEarningAccount(accountType, hasCashEarnings),
    disabledReasons,
    policy: WALLET_POLICY_COPY,
    eligibilitySourceTypes: accountType === "host" ? ["prize_winnings", "host_earnings"] : accountType === "creator" ? ["prize_winnings", "creator_earnings"] : accountType === "sponsor" ? [] : ["prize_winnings"],
    supportedPayoutMethods: ["bank_transfer", "paypal"]
  }, "Withdrawal review data loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Withdrawals");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body ?? {};
  const method = String((body as any).method ?? "").toLowerCase();
  const amountCents = Math.round(Number((body as any).amountCents ?? 0));
  const minimumWithdrawalCents = MIN_WITHDRAWAL_CENTS ?? 1000;
  const accountSnap = await db.collection("users").doc(user.uid).get();
  const accountType = String(accountSnap.data()?.accountType ?? accountSnap.data()?.role ?? "user");
  if (accountType === "sponsor") return fail("Sponsor accounts do not use standard earnings withdrawals.", 403, undefined, "WITHDRAWAL_NOT_AVAILABLE");
  if (!["bank_transfer", "paypal"].includes(method)) return fail("Choose Bank Transfer or PayPal.", 400, undefined, "UNSUPPORTED_WITHDRAWAL_METHOD");
  if (!Number.isInteger(amountCents) || amountCents < minimumWithdrawalCents) return fail(`Minimum withdrawal is ${(minimumWithdrawalCents / 100).toFixed(2)}.`, 400, undefined, "INVALID_WITHDRAWAL_AMOUNT");
  const kyc = await loadKycMetadata(db, user.uid);
  if (String(kyc.kycStatus) !== "verified") return fail("KYC verification is required before withdrawals.", 403, { kycStatus: kyc.kycStatus }, "KYC_REQUIRED");
  const now = new Date().toISOString();
  const details = ((body as any).methodDetails ?? {}) as Record<string, unknown>;
  const accountHolderName = String(details.accountHolderName ?? details.name ?? "").trim();
  const bankName = method === "bank_transfer" ? String(details.bankName ?? "").trim() : "PayPal";
  const accountNumber = String(details.accountNumber ?? details.email ?? "").trim();
  if (!accountHolderName || !accountNumber || (method === "bank_transfer" && !bankName)) return fail("Add payout method details.", 400, undefined, "PAYOUT_METHOD_REQUIRED");
  const paypalDomain = accountNumber.includes("@") ? accountNumber.slice(accountNumber.lastIndexOf("@")) : "";
  const payoutMethodLabel = method === "paypal" ? `PayPal - ***${paypalDomain}` : `${bankName} ${maskAccount(accountNumber)}`;
  const payoutMethodLast4 = method === "paypal" ? "paypal" : accountNumber.replace(/\D/g, "").slice(-4);
  try {
    const result = await db.runTransaction((transaction) => createWithdrawalRequest(db, transaction, {
      userId: user.uid,
      amountCents,
      currency: "usd",
      sourceType: "cash_balance",
      sourceIds: [],
      payoutMethodType: method,
      payoutMethodLabel,
      payoutMethodLast4,
      accountHolderName,
      bankName,
      country: String(details.country ?? "US"),
      kycStatusAtRequest: String(kyc.kycStatus),
      idempotencyKey: String((body as any).idempotencyKey ?? `${user.uid}-${amountCents}-${method}-${now.slice(0, 10)}`),
      now
    }));
    return ok({ request: result.request, created: result.created, payoutExecuted: false }, "Withdrawal request submitted for review.");
  } catch (error) {
    const message = error instanceof Error && error.message === "INSUFFICIENT_AVAILABLE_BALANCE" ? "Withdrawal amount exceeds your available cash balance." : "Withdrawal request could not be created.";
    return fail(message, 400, undefined, "WITHDRAWAL_REQUEST_REJECTED");
  }
}


