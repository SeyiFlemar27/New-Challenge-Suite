import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission } from "@/lib/server/auth";
import { ok, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireAdminPermission(request, "rewards.investigate");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Reward reconciliation");
  const accounts = await db.collection("rewardAccounts").limit(250).get();
  const issues: Array<{ userId: string; accountBalance: number; ledgerBalance: number; difference: number }> = [];
  for (const account of accounts.docs) {
    const ledger = await db.collection("rewardLedgerEntries").where("userId", "==", account.id).limit(1000).get();
    const ledgerBalance = ledger.docs.reduce((total, item) => total + (item.data().direction === "debit" ? -1 : 1) * Math.max(0, Math.trunc(Number(item.data().amount) || 0)), 0);
    const accountBalance = Math.max(0, Math.trunc(Number(account.data().availablePoints) || 0));
    if (ledgerBalance !== accountBalance) issues.push({ userId: account.id, accountBalance, ledgerBalance, difference: accountBalance - ledgerBalance });
  }
  return ok({ checkedAccounts: accounts.size, issues, repairPerformed: false, externalPayoutExecutionEnabled: false }, "Reward reconciliation completed without changing balances.");
}
