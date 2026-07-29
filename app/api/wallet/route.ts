import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ensureCashWalletFoundation, normalizeCashWallet } from "@/lib/server/cash-wallet";
import { ensureWallet } from "@/lib/server/dorocoin";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { getUserPlanAccess } from "@/lib/plan-access";
import { PLATFORM_FEE_CONFIG, WALLET_POLICY_COPY, WITHDRAWAL_ARCHITECTURE_CONFIG } from "@/lib/server/wallet-architecture";

export const dynamic = "force-dynamic";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;

  const db = getAdminDb();
  if (!db) return serverUnavailable("Wallet");

  try {
    const walletRef = await ensureWallet(db, user.uid);
    const [walletSnap, profileSnap, userSnap, transactionSnap] = await Promise.all([
      walletRef.get(),
      db.collection("profiles").doc(user.uid).get(),
      db.collection("users").doc(user.uid).get(),
      db.collection("doroCoinTransactions").where("userId", "==", user.uid).limit(100).get()
    ]);
    const optionalResults = await Promise.allSettled([
      ensureCashWalletFoundation(db, user.uid).then((ref) => ref.get()),
      db.collection("cashTransactions").where("userId", "==", user.uid).limit(100).get(),
      db.collection("cashLedger").where("userId", "==", user.uid).limit(100).get(),
      db.collection("sponsorships").where("userId", "==", user.uid).limit(100).get(),
      db.collection("winnerClaims").where("userId", "==", user.uid).limit(100).get()
    ]);
    const cashWalletSnap = optionalResults[0].status === "fulfilled" ? optionalResults[0].value : null;
    const cashTransactionsSnap = optionalResults[1].status === "fulfilled" ? optionalResults[1].value : null;
    const cashLedgerSnap = optionalResults[2].status === "fulfilled" ? optionalResults[2].value : null;
    const sponsorshipsSnap = optionalResults[3].status === "fulfilled" ? optionalResults[3].value : null;
    const winnerClaimsSnap = optionalResults[4].status === "fulfilled" ? optionalResults[4].value : null;
    const warnings = optionalResults
      .map((result, index) => result.status === "rejected" ? ["cash wallet review", "cash transactions", "cash earnings ledger", "sponsorship review", "winner claims"][index] : null)
      .filter(Boolean);

    const wallet = walletSnap.data() ?? {};
    const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
    const account = userSnap.exists ? userSnap.data() ?? {} : {};
    const plan = getUserPlanAccess({ ...profile, ...account });
    const cashTransactions = cashTransactionsSnap?.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>)) ?? [];
    const cashEarnings = (cashLedgerSnap?.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>)) ?? [])
      .filter((item) => item.direction === "credit")
      .sort((left, right) => Date.parse(String(right.createdAt ?? "")) - Date.parse(String(left.createdAt ?? "")));
    const sponsorshipSpendCents = sponsorshipsSnap?.docs.reduce((sum, doc) => sum + Number(doc.data().amountCents ?? 0), 0) ?? 0;

    return ok({
      user: {
        uid: user.uid,
        email: user.email ?? profile.email ?? account.email ?? "",
        displayName: profile.displayName ?? account.displayName ?? "",
        planId: plan.normalizedPlanId,
        accountType: plan.accountType,
        role: account.role ?? profile.role ?? null,
        isAdmin: Boolean(account.isAdmin)
      },
      wallet: {
        userId: user.uid,
        balance: Number(wallet.balance ?? 0),
        lockedBalance: Number(wallet.lockedBalance ?? 0),
        creditType: "dorocoin",
        withdrawable: false,
        cashConvertible: false,
        updatedAt: toIso(wallet.updatedAt)
      },
      cashWallet: normalizeCashWallet(user.uid, cashWalletSnap?.data()),
      walletPolicy: WALLET_POLICY_COPY,
      withdrawalArchitecture: WITHDRAWAL_ARCHITECTURE_CONFIG,
      platformFeeConfig: PLATFORM_FEE_CONFIG,
      warnings,
      financialSummary: {
        status: "review_only",
        pendingEarningsCents: cashEarnings.filter((item) => item.status === "pending_review" || item.status === "pending_hold").reduce((sum, item) => sum + Number(item.netAmountCents ?? item.amountCents ?? 0), 0),
        sponsorEarningsCents: cashEarnings.filter((item) => item.sourceType === "sponsor_prize").reduce((sum, item) => sum + Number(item.netAmountCents ?? item.amountCents ?? 0), 0),
        prizeWinningsCents: cashEarnings.filter((item) => item.sourceType === "challenge_winner_prize").reduce((sum, item) => sum + Number(item.netAmountCents ?? item.amountCents ?? 0), 0)
          || (winnerClaimsSnap?.docs.reduce((sum, doc) => sum + Number(doc.data().prizeAmountCents ?? 0), 0) ?? 0),
        campaignBudgetCents: 0,
        sponsorshipSpendCents,
        prizePoolContributionsCents: sponsorshipsSnap?.docs.reduce((sum, doc) => sum + Number(doc.data().prizePoolContributionCents ?? 0), 0) ?? 0,
        payoutStatus: "review_only",
        withdrawalsEnabled: false,
        moneyMovementEnabled: false
      },
      cashEarnings: cashEarnings.map((item) => ({
        id: item.id,
        challengeId: item.challengeId ?? null,
        settlementId: item.settlementId ?? null,
        sourceType: item.sourceType ?? "cash_earning",
        grossAmountCents: Number(item.grossAmountCents ?? item.amountCents ?? 0),
        feeRate: Number(item.feeRate ?? 0),
        feeAmountCents: Number(item.feeAmountCents ?? 0),
        netAmountCents: Number(item.netAmountCents ?? item.amountCents ?? 0),
        currency: item.currency ?? "USD",
        status: item.status ?? "pending_review",
        holdUntil: toIso(item.holdUntil),
        createdAt: toIso(item.createdAt),
        payoutProviderCalled: false,
        externalPayoutExecuted: false
      })),
      cashTransactions: cashTransactions.map((item) => ({
        id: item.id,
        type: item.type ?? "placeholder",
        status: item.status ?? "pending_review",
        amountCents: Number(item.amountCents ?? 0),
        description: item.description ?? "",
        balanceImpact: "none",
        withdrawableImpact: "none",
        createdAt: toIso(item.createdAt)
      })),
      transactions: transactionSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: toIso(data.createdAt)
        };
      }).sort((left, right) => Date.parse(String(right.createdAt ?? "")) - Date.parse(String(left.createdAt ?? ""))).slice(0, 50)
    }, "Wallet loaded.");
  } catch (error) {
    return serverError("Wallet could not be loaded.", error instanceof Error ? error.message : error);
  }
}



