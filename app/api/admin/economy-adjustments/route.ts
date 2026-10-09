import { getAdminDb } from "@/lib/firebase/admin";
import { requireRecentAdminAuthentication } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { applyGrowthWalletTransaction } from "@/lib/server/creator-growth-wallet";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

export async function POST(request: Request) {
  const { user, response } = await requireRecentAdminAuthentication(request, "wallet.adjust");
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body ?? {};
  const walletType = String(body.walletType ?? "challenge_credits");
  const action = String(body.action ?? "adjustment");
  const userId = String(body.userId ?? "").trim();
  const amount = Number(body.amount ?? 0);
  const reason = String(body.reason ?? "").trim();
  const idempotencyKey = String(body.idempotencyKey ?? "").trim();
  if (!userId || !Number.isInteger(amount) || amount === 0 || reason.length < 8 || !idempotencyKey) return validationError({ adjustment: "User, non-zero whole amount, idempotency key, and a meaningful reason are required." });
  if (walletType === "challenge_credits") return fail("Challenge Credit balances are retired and read-only. No new adjustments can be created.", 410, undefined, "CHALLENGE_CREDITS_RETIRED");
  if (walletType !== "growth_wallet") return validationError({ walletType: "Select a supported wallet." });
  const db = getAdminDb();
  if (!db) return serverUnavailable("Economy adjustment");
  try {
    const transaction = await applyGrowthWalletTransaction(db, { userId, amountCents: amount, sourceType: amount > 0 ? "admin_credit" : "admin_debit", reason, createdBy: user.uid, idempotencyKey });
    await writeAuditLog({ actorId: user.uid, actorType: "admin", action: `economy.${walletType}_${action}`, targetType: "account", targetId: userId, reason, after: { amount, transactionId: transaction.id, refundReason: body.refundReason ?? null, providerRefundExecuted: false } }, db);
    return ok({ transaction, providerRefundExecuted: false }, "Economy ledger adjustment recorded. No external refund or payout was executed.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Economy adjustment could not be recorded.", 409, undefined, "ECONOMY_ADJUSTMENT_REJECTED");
  }
}
