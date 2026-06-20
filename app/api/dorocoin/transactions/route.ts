import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser, requireRequestUser } from "@/lib/server/auth";
import { applyDoroCoinTransaction } from "@/lib/server/dorocoin";
import { fail, ok, serverError, serverUnavailable, readJson, validationError } from "@/lib/server/responses";

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
  const type = body.type ?? "adjustment";
  const validTypes = ["purchase", "admin_grant", "vote_spend", "boost_spend", "reward", "adjustment"];
  if (!validTypes.includes(type)) return validationError({ type: `Type must be one of: ${validTypes.join(", ")}.` });
  const isAdminGrant = type === "admin_grant";
  const authResult = isAdminGrant ? await requireAdminUser(request) : await requireRequestUser(request);
  if (authResult.response) return authResult.response;

  const user = authResult.user!;
  const db = getAdminDb();
  if (!db) return serverUnavailable("DoroCoin wallet writes");

  const fieldErrors: Record<string, string> = {};
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount === 0) fieldErrors.amount = "Amount must be a non-zero number.";
  if (isAdminGrant && !body.userId) fieldErrors.userId = "Target user ID is required for admin grants.";
  if (Object.keys(fieldErrors).length) return validationError(fieldErrors);

  const targetUserId = isAdminGrant ? body.userId : user.uid;
  try {
    const record = await applyDoroCoinTransaction(db, {
      userId: targetUserId,
      amount,
      type,
      description: body.description ?? "DoroCoin transaction",
      sourceId: body.sourceId,
      createdBy: user.uid
    });
    return ok({ transaction: record }, "DoroCoin transaction recorded.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "DoroCoin transaction could not be recorded.", 409, undefined, "WALLET_TRANSACTION_REJECTED");
  }
}
