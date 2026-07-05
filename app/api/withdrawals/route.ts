import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { getRequestIdempotencyKey } from "@/lib/server/idempotency";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { ensureCashWalletFoundation, normalizeCashWallet } from "@/lib/server/cash-wallet";
import { createWithdrawalRequest, maskAccount, MAX_DAILY_WITHDRAWAL_CENTS, MIN_WITHDRAWAL_CENTS } from "@/lib/server/withdrawals";
import { writeAuditLog } from "@/lib/server/audit";

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
  const requests = requestSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data(), payoutProviderReference: null } as Record<string, unknown> & { id: string }))
    .sort((left, right) => Date.parse(String(right.createdAt ?? "")) - Date.parse(String(left.createdAt ?? "")));
  return ok({
    wallet: normalizeCashWallet(user.uid, walletSnap.data()),
    requests,
    minimumWithdrawalCents: MIN_WITHDRAWAL_CENTS,
    maximumDailyWithdrawalCents: MAX_DAILY_WITHDRAWAL_CENTS,
    kycProcessingActive: false,
    automaticPayoutsActive: false,
    accountType,
    eligibilitySourceTypes: accountType === "host" ? ["prize_winnings", "host_earnings"] : accountType === "creator" ? ["prize_winnings", "creator_earnings"] : accountType === "sponsor" ? [] : ["prize_winnings"],
    supportedProviderFoundations: ["manual", "stripe_connect", "paystack_transfers", "flutterwave_transfers"]
  }, "Withdrawal review data loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Withdrawals");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const accountSnap = await db.collection("users").doc(user.uid).get();
  const accountType = String(accountSnap.data()?.accountType ?? accountSnap.data()?.role ?? "user");
  if (accountType === "sponsor") return fail("Sponsor accounts do not use the standard earnings withdrawal flow.", 403, undefined, "WITHDRAWAL_NOT_AVAILABLE");
  const amountCents = Math.trunc(Number(parsed.body?.amountCents ?? 0));
  const requestedSourceType = String(parsed.body?.sourceType ?? "");
  const eligibleSources = accountType === "host" ? ["prize_winnings", "host_earnings"] : accountType === "creator" ? ["prize_winnings", "creator_earnings"] : ["prize_winnings"];
  const sourceType = eligibleSources.includes(requestedSourceType) ? requestedSourceType : eligibleSources[0];
  const payoutMethodType = String(parsed.body?.payoutMethodType ?? "bank");
  const accountNumber = String(parsed.body?.accountNumber ?? "");
  const bankName = String(parsed.body?.bankName ?? "").trim().slice(0, 80);
  const accountHolderName = String(parsed.body?.accountHolderName ?? "").trim().slice(0, 100);
  const idempotencyKey = getRequestIdempotencyKey(request, parsed.body);
  const fieldErrors: Record<string, string> = {};
  if (!Number.isInteger(amountCents) || amountCents < MIN_WITHDRAWAL_CENTS) fieldErrors.amount = `Minimum withdrawal is $${(MIN_WITHDRAWAL_CENTS / 100).toFixed(2)}.`;
  if (amountCents > MAX_DAILY_WITHDRAWAL_CENTS) fieldErrors.amount = "Amount exceeds the daily review limit.";
  if (!bankName) fieldErrors.bankName = "Bank or payout institution is required.";
  if (!accountHolderName) fieldErrors.accountHolderName = "Account holder name is required.";
  if (accountNumber.replace(/\D/g, "").length < 4) fieldErrors.accountNumber = "Enter a valid payout account number.";
  if (!idempotencyKey) fieldErrors.idempotencyKey = "A request idempotency key is required.";
  if (Object.keys(fieldErrors).length) return validationError(fieldErrors);

  const safeIdempotencyKey = idempotencyKey as string;
  try {
    const now = new Date().toISOString();
    const result = await db.runTransaction((transaction) => createWithdrawalRequest(db, transaction, {
      userId: user.uid,
      amountCents,
      currency: "USD",
      sourceType,
      sourceIds: Array.isArray(parsed.body?.sourceIds) ? parsed.body.sourceIds.map(String).slice(0, 20) : [],
      payoutMethodType,
      payoutMethodLabel: `${bankName} ${maskAccount(accountNumber)}`,
      payoutMethodLast4: accountNumber.replace(/\D/g, "").slice(-4),
      accountHolderName,
      bankName,
      country: String(parsed.body?.country ?? "NG").trim().slice(0, 2).toUpperCase(),
      idempotencyKey: safeIdempotencyKey,
      now
    }));
    if (result.created) {
      await writeAuditLog({
        actorId: user.uid,
        actorType: "user",
        action: "withdrawal.requested",
        targetType: "withdrawal",
        targetId: String(result.request?.id ?? ""),
        reason: "User requested review of eligible cash balance.",
        metadata: { amountCents, currency: "USD", transferEnabled: false, kycStatus: "not_started" }
      }, db);
    }
    return ok({ request: result.request, created: result.created }, result.created ? "Withdrawal request submitted for admin review." : "This withdrawal request was already received.");
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_AVAILABLE_BALANCE") {
      return fail("No withdrawable balance yet. Eligible prize winnings and approved earnings will appear here after review.", 409, undefined, "INSUFFICIENT_AVAILABLE_BALANCE");
    }
    return serverError("Withdrawal request could not be created.", error instanceof Error ? error.message : error);
  }
}
