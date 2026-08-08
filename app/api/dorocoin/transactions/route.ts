import { getAdminDb } from "@/lib/firebase/admin";
import { requireRecentAdminAuthentication, requireRequestUser } from "@/lib/server/auth";
import { applyDoroCoinTransaction } from "@/lib/server/dorocoin";
import { fail, ok, serverError, serverUnavailable, readJson, validationError } from "@/lib/server/responses";
import { writeAuditLog } from "@/lib/server/audit";
import { ECONOMY_V1_RULE_VERSION } from "@/lib/server/economy-rules";

type TransactionQueryError = Error & {
  queryName?: "transactions";
  code?: unknown;
  details?: unknown;
};

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

function createdAtMs(value: unknown) {
  const iso = toIso(value);
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function isFirestoreIndexError(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  const text = `${String(candidate?.code ?? "")} ${String(candidate?.message ?? "")} ${String(candidate?.details ?? "")}`.toLowerCase();
  return text.includes("failed_precondition") || text.includes("requires an index") || text.includes("index");
}

function transactionErrorDetails(error: unknown) {
  const candidate = error as TransactionQueryError;
  const firestoreMessage = typeof candidate?.message === "string" ? candidate.message : "DoroCoin transaction query failed.";

  if (isFirestoreIndexError(error)) {
    return {
      reason: "firestore_index_required",
      queryName: "transactions",
      query: "doroCoinTransactions where userId == uid, sorted by createdAt desc in API",
      firestoreCode: candidate?.code ?? null,
      firestoreMessage,
      requiredIndex: null
    };
  }

  return {
    reason: "dorocoin_transactions_query_failed",
    queryName: "transactions",
    query: "doroCoinTransactions where userId == uid, sorted by createdAt desc in API",
    firestoreCode: candidate?.code ?? null,
    firestoreMessage
  };
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("DoroCoin transaction history");

  try {
    const snap = await db.collection("doroCoinTransactions").where("userId", "==", user.uid).limit(100).get();
    return ok({
      transactions: snap.docs.map((doc) => {
        const data = doc.data();
        return { ...data, id: doc.id, createdAt: toIso(data.createdAt) };
      }).sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt)).slice(0, 50)
    }, "DoroCoin transaction history loaded.");
  } catch (error) {
    const details = transactionErrorDetails(error);
    console.error("[dorocoin-transactions] load failed", details);
    return serverError("DoroCoin transaction history could not be loaded.", details);
  }
}

export async function POST(request: Request) {
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const type = body.type === "reversal" ? "reversal" : "adjustment";
  const authResult = await requireRecentAdminAuthentication(request, "wallet.adjust");
  if (authResult.response) return authResult.response;

  const user = authResult.user!;
  const db = getAdminDb();
  if (!db) return serverUnavailable("DoroCoin wallet writes");

  const fieldErrors: Record<string, string> = {};
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount === 0) fieldErrors.amount = "Amount must be a non-zero number.";
  const reason = String(body.reason ?? body.description ?? "").trim();
  if (!body.userId) fieldErrors.userId = "Target user ID is required for an admin adjustment.";
  if (reason.length < 8) fieldErrors.reason = "A meaningful adjustment reason of at least 8 characters is required.";
  if (Object.keys(fieldErrors).length) return validationError(fieldErrors);

  const targetUserId = String(body.userId);
  try {
    const record = await applyDoroCoinTransaction(db, {
      userId: targetUserId,
      amount,
      type,
      description: reason,
      sourceId: body.sourceId,
      createdBy: user.uid,
      sourceType: type === "reversal" ? "admin_reversal" : amount > 0 ? "admin_credit" : "admin_debit",
      relatedUserId: targetUserId,
      ruleVersion: ECONOMY_V1_RULE_VERSION,
      idempotencyKey: String(body.idempotencyKey ?? `admin_dorocoin_${user.uid}_${targetUserId}_${Date.now()}`),
      auditMetadata: { relatedAdminId: user.uid, reason }
    });
    await writeAuditLog({ actorId: user.uid, actorType: "admin", action: "economy.dorocoin_adjusted", targetType: "account", targetId: targetUserId, reason, after: { amount, transactionId: record.id, ruleVersion: ECONOMY_V1_RULE_VERSION } }, db);
    return ok({ transaction: record }, "DoroCoin transaction recorded.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "DoroCoin transaction could not be recorded.", 409, undefined, "WALLET_TRANSACTION_REJECTED");
  }
}
