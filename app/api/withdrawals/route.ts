import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
import { ensureCashWalletFoundation, normalizeCashWallet } from "@/lib/server/cash-wallet";
import { MAX_DAILY_WITHDRAWAL_CENTS, MIN_WITHDRAWAL_CENTS } from "@/lib/server/withdrawals";
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
    withdrawalRequestCreationEnabled: false,
    payoutMethodCollectionEnabled: WITHDRAWAL_ARCHITECTURE_CONFIG.payoutMethodCollectionEnabled,
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
    supportedProviderFoundations: ["manual", "stripe_connect", "paystack_transfers", "flutterwave_transfers"]
  }, "Withdrawal review data loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Withdrawals");
  const accountSnap = await db.collection("users").doc(user.uid).get();
  const accountType = String(accountSnap.data()?.accountType ?? accountSnap.data()?.role ?? "user");
  if (accountType === "sponsor") return fail("Sponsor accounts do not use the standard earnings withdrawal flow.", 403, undefined, "WITHDRAWAL_NOT_AVAILABLE");
  const kyc = await loadKycMetadata(db, user.uid);
  return fail(WALLET_POLICY_COPY.withdrawalsSetupRequired, 403, {
    withdrawalRequestCreationEnabled: false,
    withdrawalsConfigured: WITHDRAWAL_ARCHITECTURE_CONFIG.withdrawalsEnabled,
    payoutProviderConfigured: WITHDRAWAL_ARCHITECTURE_CONFIG.payoutProviderConfigured,
    payoutMethodCollectionEnabled: WITHDRAWAL_ARCHITECTURE_CONFIG.payoutMethodCollectionEnabled,
    kycStatus: kyc.kycStatus,
    requiredBeforeRequest: ["kyc_verified", "payout_method_provider_configured", "admin_review_workflow", "available_cash_balance"]
  }, "WITHDRAWALS_SETUP_REQUIRED");
}
