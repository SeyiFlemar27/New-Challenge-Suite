import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ECONOMY_V1_RULES } from "@/lib/server/economy-rules";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";

function records(result: PromiseSettledResult<FirebaseFirestore.QuerySnapshot>) {
  return result.status === "fulfilled" ? result.value.docs.map((doc) => ({ id: doc.id, ...doc.data() })) : [];
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Economy wallet");
  try {
    const [cash, doro, credits, growth, doroTx, creditTx, growthTx, streak] = await Promise.all([
      db.collection("cashWallets").doc(user.uid).get(),
      db.collection("doroCoinWallets").doc(user.uid).get(),
      db.collection("challengeCreditWallets").doc(user.uid).get(),
      db.collection("creatorGrowthWallets").doc(user.uid).get(),
      db.collection("doroCoinTransactions").where("userId", "==", user.uid).limit(50).get(),
      db.collection("challengeCreditTransactions").where("userId", "==", user.uid).limit(50).get(),
      db.collection("creatorGrowthWalletTransactions").where("userId", "==", user.uid).limit(50).get(),
      db.collection("doroCoinStreaks").doc(user.uid).get()
    ]);
    const sort = (items: Array<Record<string, unknown>>) => items.sort((a, b) => Date.parse(String(b.createdAt ?? "")) - Date.parse(String(a.createdAt ?? "")));
    return ok({
      ruleVersion: ECONOMY_V1_RULES.version,
      balances: {
        cash: { availableCents: Number(cash.data()?.availableBalanceCents ?? 0), withdrawable: true, subjectToKyc: true },
        doroCoins: { balance: Number(doro.data()?.balance ?? 0), withdrawable: false, cashConvertible: false },
        challengeCredits: { balance: Number(credits.data()?.balance ?? 0), withdrawable: false, cashConvertible: false },
        creatorGrowthWallet: { balanceCents: Number(growth.data()?.balanceCents ?? 0), withdrawable: false, restrictedUseOnly: true, allocationPercent: Number(growth.data()?.allocationPercent ?? 0) }
      },
      histories: { doroCoins: sort(doroTx.docs.map((doc) => ({ id: doc.id, ...doc.data() }))), challengeCredits: sort(creditTx.docs.map((doc) => ({ id: doc.id, ...doc.data() }))), creatorGrowthWallet: sort(growthTx.docs.map((doc) => ({ id: doc.id, ...doc.data() }))) },
      streak: streak.exists ? { current: Number(streak.data()?.currentStreak ?? 0), lastRewardDay: streak.data()?.lastRewardDay ?? null, awardedMilestones: streak.data()?.awardedMilestones ?? [] } : { current: 0, lastRewardDay: null, awardedMilestones: [] },
      policy: { cash: "Only Cash Wallet can be withdrawn, subject to KYC and withdrawal rules.", doroCoins: "DoroCoins are a virtual platform currency. They are not cash, are not legal tender, and cannot currently be withdrawn or converted to cash.", challengeCredits: "Challenge Credits are premium platform credits used for eligible Challenge Suite features. They are not cash, are not legal tender, and cannot be withdrawn.", creatorGrowthWallet: "Creator Growth Wallet funds are restricted for approved growth tools and cannot be withdrawn as cash." }
    }, "Economy wallet loaded from real ledger records.");
  } catch (error) {
    return serverError("Economy wallet could not be loaded.", error instanceof Error ? error.message : error);
  }
}
