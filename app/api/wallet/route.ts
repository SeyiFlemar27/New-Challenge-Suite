import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ensureCashWalletFoundation, normalizeCashWallet } from "@/lib/server/cash-wallet";
import { ensureWallet } from "@/lib/server/dorocoin";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { getUserPlanAccess } from "@/lib/plan-access";

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
    const [walletRef, cashWalletRef] = await Promise.all([ensureWallet(db, user.uid), ensureCashWalletFoundation(db, user.uid)]);
    const [walletSnap, cashWalletSnap, profileSnap, userSnap, transactionSnap, cashTransactionsSnap, sponsorshipsSnap, winnerClaimsSnap] = await Promise.all([
      walletRef.get(),
      cashWalletRef.get(),
      db.collection("profiles").doc(user.uid).get(),
      db.collection("users").doc(user.uid).get(),
      db.collection("doroCoinTransactions").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(50).get(),
      db.collection("cashTransactions").where("userId", "==", user.uid).limit(100).get(),
      db.collection("sponsorships").where("userId", "==", user.uid).limit(100).get(),
      db.collection("winnerClaims").where("userId", "==", user.uid).limit(100).get()
    ]);

    const wallet = walletSnap.data() ?? {};
    const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
    const account = userSnap.exists ? userSnap.data() ?? {} : {};
    const plan = getUserPlanAccess({ ...profile, ...account });
    const cashTransactions = cashTransactionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>));
    const sumByType = (types: string[]) => cashTransactions
      .filter((item) => types.includes(String(item.type ?? "")) && item.status !== "voided")
      .reduce((sum, item) => sum + Number(item.amountCents ?? 0), 0);
    const sponsorshipSpendCents = sponsorshipsSnap.docs.reduce((sum, doc) => sum + Number(doc.data().amountCents ?? 0), 0);

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
      cashWallet: normalizeCashWallet(user.uid, cashWalletSnap.data()),
      financialSummary: {
        status: "review_only",
        pendingEarningsCents: sumByType(["prize_placeholder_created", "payout_review_created"]),
        sponsorEarningsCents: sumByType(["sponsor_contribution_requested"]),
        prizeWinningsCents: winnerClaimsSnap.docs.reduce((sum, doc) => sum + Number(doc.data().prizeAmountCents ?? 0), 0),
        campaignBudgetCents: 0,
        sponsorshipSpendCents,
        prizePoolContributionsCents: sponsorshipsSnap.docs.reduce((sum, doc) => sum + Number(doc.data().prizePoolContributionCents ?? 0), 0),
        payoutStatus: "review_only",
        withdrawalsEnabled: false,
        moneyMovementEnabled: false
      },
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
      })
    }, "Wallet loaded.");
  } catch (error) {
    return serverError("Wallet could not be loaded.", error instanceof Error ? error.message : error);
  }
}



