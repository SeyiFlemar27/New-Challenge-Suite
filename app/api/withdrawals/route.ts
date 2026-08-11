import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { ensureCashWalletFoundation, normalizeCashWallet } from "@/lib/server/cash-wallet";
import { createWithdrawalRequest, maskAccount, MAX_DAILY_WITHDRAWAL_CENTS, MIN_WITHDRAWAL_CENTS } from "@/lib/server/withdrawals";
import { currentKycPolicyStatus } from "@/lib/server/kyc-policy";
import { WALLET_POLICY_COPY, WITHDRAWAL_ARCHITECTURE_CONFIG, getWithdrawalDisabledReasons, isEligibleEarningAccount } from "@/lib/server/wallet-architecture";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Withdrawals");
  const walletRef = await ensureCashWalletFoundation(db, user.uid);
  const [walletSnap, requestSnap, accountSnap, earningSnap, payoutMethodSnap] = await Promise.all([
    walletRef.get(),
    db.collection("withdrawalRequests").where("userId", "==", user.uid).limit(100).get(),
    db.collection("users").doc(user.uid).get(),
    db.collection("cashLedger").where("userId", "==", user.uid).limit(100).get(),
    db.collection("payoutMethods").where("userId", "==", user.uid).limit(20).get()
  ]);
  const accountType = String(accountSnap.data()?.accountType ?? accountSnap.data()?.role ?? "user");
  const wallet = normalizeCashWallet(user.uid, walletSnap.data());
  const hasCashEarnings = wallet.availableBalanceCents > 0 || wallet.pendingBalanceCents > 0 || wallet.underReviewBalanceCents > 0 || wallet.lifetimeEarningsCents > 0;
  const disabledReasons = getWithdrawalDisabledReasons({
    accountType,
    availableBalanceCents: wallet.availableBalanceCents,
    kycStatus: currentKycPolicyStatus(),
    payoutMethodConfigured: !payoutMethodSnap.empty,
    hasCashEarnings
  });
  const requests = requestSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data(), payoutProviderReference: null } as Record<string, unknown> & { id: string }))
    .sort((left, right) => Date.parse(String(right.createdAt ?? "")) - Date.parse(String(left.createdAt ?? "")));
  const payoutMethods = payoutMethodSnap.docs.map((doc) => ({ id: doc.id, type: doc.data().type, label: doc.data().maskedAccount, verificationStatus: doc.data().verificationStatus, providerConnected: false, transferEnabled: false }));
  const eligibleSourceTypes = new Set(["challenge_winner_prize", "sponsor_prize", "prediction_reward", "creator_challenge_earning"]);
  const eligibleSources = earningSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }))
    .filter((item) => item.direction === "credit" && item.status === "available" && eligibleSourceTypes.has(String(item.sourceType ?? "")))
    .map((item) => ({
      id: item.id,
      sourceType: item.sourceType,
      challengeId: item.challengeId ?? null,
      settlementId: item.settlementId ?? null,
      grossAmountCents: Number(item.grossAmountCents ?? item.amountCents ?? 0),
      feeAmountCents: Number(item.feeAmountCents ?? 0),
      netAmountCents: Number(item.netAmountCents ?? item.amountCents ?? 0),
      currency: item.currency ?? "USD",
      status: item.status
    }));
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
    kycProcessingActive: false,
    kycStatus: currentKycPolicyStatus(),
    automaticPayoutsActive: false,
    accountType,
    eligibleForCashWithdrawals: isEligibleEarningAccount(accountType, hasCashEarnings),
    disabledReasons,
    policy: WALLET_POLICY_COPY,
    eligibilitySourceTypes: accountType === "host" ? ["prize_winnings", "host_earnings"] : accountType === "creator" ? ["prize_winnings", "creator_earnings"] : accountType === "sponsor" ? [] : ["prize_winnings"],
    supportedPayoutMethods: ["bank_transfer", "paypal", "payoneer"],
    pendingClearanceDays: WITHDRAWAL_ARCHITECTURE_CONFIG.pendingClearanceDays,
    minimumProcessingHours: WITHDRAWAL_ARCHITECTURE_CONFIG.minimumProcessingHours,
    withdrawalFeeCents: WITHDRAWAL_ARCHITECTURE_CONFIG.withdrawalFeeCents,
    eligibleSources,
    payoutMethods
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
  const sourceId = String((body as any).sourceId ?? "").trim();
  const amountCents = Math.round(Number((body as any).amountCents ?? 0));
  const minimumWithdrawalCents = MIN_WITHDRAWAL_CENTS;
  const accountSnap = await db.collection("users").doc(user.uid).get();
  const accountType = String(accountSnap.data()?.accountType ?? accountSnap.data()?.role ?? "user");
  if (accountType === "sponsor") return fail("Sponsor accounts do not use standard earnings withdrawals.", 403, undefined, "WITHDRAWAL_NOT_AVAILABLE");
  if (!["bank_transfer", "paypal", "payoneer"].includes(method)) return fail("Choose Bank Transfer, PayPal, or Payoneer.", 400, undefined, "UNSUPPORTED_WITHDRAWAL_METHOD");
  if (!Number.isInteger(amountCents) || amountCents < minimumWithdrawalCents) return fail(`Minimum withdrawal is ${(minimumWithdrawalCents / 100).toFixed(2)}.`, 400, undefined, "INVALID_WITHDRAWAL_AMOUNT");
  if (!sourceId) return fail("Choose an eligible cash earning source.", 400, undefined, "WITHDRAWAL_SOURCE_REQUIRED");
  const sourceSnap = await db.collection("cashLedger").doc(sourceId).get();
  const source = sourceSnap.data() ?? {};
  const eligibleSourceTypes = new Set(["challenge_winner_prize", "sponsor_prize", "prediction_reward", "creator_challenge_earning"]);
  if (!sourceSnap.exists || source.userId !== user.uid || source.direction !== "credit" || source.status !== "available" || !eligibleSourceTypes.has(String(source.sourceType ?? ""))) {
    return fail("Choose an available cash earning that belongs to your wallet.", 403, undefined, "WITHDRAWAL_SOURCE_NOT_ELIGIBLE");
  }
  if (amountCents !== Number(source.netAmountCents ?? source.amountCents ?? 0)) {
    return fail("Request the full net amount available from the selected earning.", 400, undefined, "WITHDRAWAL_SOURCE_AMOUNT_MISMATCH");
  }
  const now = new Date().toISOString();
  const payoutMethodId = String((body as any).payoutMethodId ?? "").trim();
  const savedMethodSnap = payoutMethodId ? await db.collection("payoutMethods").doc(payoutMethodId).get() : null;
  const savedMethod = savedMethodSnap?.exists && savedMethodSnap.data()?.userId === user.uid ? savedMethodSnap.data() ?? {} : null;
  if (payoutMethodId && !savedMethod) return fail("Choose a payout method that belongs to your account.", 403, undefined, "PAYOUT_METHOD_NOT_OWNED");
  const details = ((body as any).methodDetails ?? {}) as Record<string, unknown>;
  const resolvedMethod = String(savedMethod?.type ?? method).toLowerCase();
  const accountHolderName = String(savedMethod?.accountHolderName ?? details.accountHolderName ?? details.name ?? "").trim();
  const bankName = String(savedMethod?.bankName ?? (resolvedMethod === "bank_transfer" ? details.bankName ?? "" : resolvedMethod === "payoneer" ? "Payoneer" : "PayPal")).trim();
  const accountNumber = String(savedMethod?.last4 ?? details.accountNumber ?? details.email ?? "").trim();
  if (!accountHolderName || !accountNumber || (resolvedMethod === "bank_transfer" && !bankName)) return fail("Add payout method details.", 400, undefined, "PAYOUT_METHOD_REQUIRED");
  const paypalDomain = accountNumber.includes("@") ? accountNumber.slice(accountNumber.lastIndexOf("@")) : "";
  const payoutMethodLabel = savedMethod ? String(savedMethod.maskedAccount ?? "Saved payout method") : resolvedMethod === "paypal"
    ? `PayPal - ***${paypalDomain}`
    : resolvedMethod === "payoneer"
      ? `Payoneer - ***${paypalDomain}`
      : `${bankName} ${maskAccount(accountNumber)}`;
  const payoutMethodLast4 = resolvedMethod === "bank_transfer" ? accountNumber.replace(/\D/g, "").slice(-4) : resolvedMethod;
  try {
    const result = await db.runTransaction((transaction) => createWithdrawalRequest(db, transaction, {
      userId: user.uid,
      amountCents,
      currency: "usd",
      sourceType: String(source.sourceType),
      sourceIds: [sourceId],
      payoutMethodType: resolvedMethod,
      payoutMethodLabel,
      payoutMethodLast4,
      accountHolderName,
      bankName,
      country: String(details.country ?? "US"),
      kycStatusAtRequest: currentKycPolicyStatus(),
      idempotencyKey: String((body as any).idempotencyKey ?? `${user.uid}-${sourceId}-${amountCents}-${resolvedMethod}`),
      now
    }));
    return ok({ request: result.request, created: result.created, payoutExecuted: false }, "Withdrawal request submitted for review.");
  } catch (error) {
    const message = error instanceof Error && error.message === "INSUFFICIENT_AVAILABLE_BALANCE" ? "Withdrawal amount exceeds your available cash balance." : "Withdrawal request could not be created.";
    return fail(message, 400, undefined, "WITHDRAWAL_REQUEST_REJECTED");
  }
}


