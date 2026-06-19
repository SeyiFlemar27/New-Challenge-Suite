import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser, requireRequestUser } from "@/lib/server/auth";
import { applyDoroCoinTransaction } from "@/lib/server/dorocoin";
import { fail, ok, serverUnavailable, readJson, validationError } from "@/lib/server/responses";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("DoroCoin transaction history");
  const snap = await db.collection("doroCoinTransactions").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(50).get();
  return ok({ transactions: snap.docs.map((doc) => doc.data()) }, "DoroCoin transaction history loaded.");
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
