import { getAdminDb } from "@/lib/firebase/admin";
import { requireRecentAdminAuthentication } from "@/lib/server/auth";
import { createManualRewardGrant } from "@/lib/server/reward-manual-grants";
import { fail, ok, readJson, serverError, serverUnavailable } from "@/lib/server/responses";

async function resolveUserId(db: FirebaseFirestore.Firestore, target: string) {
  const direct = await db.collection("users").doc(target).get();
  if (direct.exists) return direct.id;
  const email = target.trim().toLowerCase();
  if (!email.includes("@")) return null;
  const [users, profiles] = await Promise.all([
    db.collection("users").where("email", "==", email).limit(1).get(),
    db.collection("profiles").where("email", "==", email).limit(1).get(),
  ]);
  return users.docs[0]?.id ?? profiles.docs[0]?.id ?? null;
}

export async function POST(request: Request) {
  const { user, response } = await requireRecentAdminAuthentication(request, "rewards.manualGrant");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Manual reward grant");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body ?? {};
  const target = String(body.user ?? body.userId ?? body.email ?? "").trim();
  const prizeId = String(body.prizeId ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const idempotencyKey = String(body.idempotencyKey ?? "").trim();
  if (!target || !prizeId || !idempotencyKey || reason.length < 8 || body.confirmation !== "CONFIRM REWARD GRANT") return fail("Select a user and reward, enter an operational reason, and confirm the grant.", 400, undefined, "MANUAL_GRANT_VALIDATION_ERROR");
  try {
    const userId = await resolveUserId(db, target);
    if (!userId) return fail("User not found.", 404, undefined, "MANUAL_GRANT_USER_NOT_FOUND");
    const result = await createManualRewardGrant(db, { userId, prizeId, adminId: user.uid, reason, idempotencyKey });
    return ok(result, result.idempotent ? "This reward grant was already recorded." : "Reward granted through its standard fulfillment path.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "MANUAL_GRANT_FAILED";
    const messages: Record<string, string> = {
      MANUAL_GRANT_USER_NOT_FOUND: "User not found.",
      MANUAL_GRANT_PRIZE_NOT_FOUND: "Reward not found.",
      MANUAL_GRANT_PRIZE_UNSUPPORTED: "This reward type is not supported for manual grants.",
      MANUAL_GRANT_PRIZE_UNAVAILABLE: "Select an active, available reward.",
      MANUAL_GRANT_PRIZE_VALUE_INVALID: "The reward value is invalid.",
      MANUAL_GRANT_DISCOUNT_CAP_REQUIRED: "Percentage discounts require a maximum discount cap.",
      MANUAL_GRANT_PRIZE_OUT_OF_STOCK: "This reward is out of stock.",
      MANUAL_GRANT_CASH_BUDGET_INVALID: "This cash reward does not have enough confirmed budget.",
      MANUAL_GRANT_REASON_REQUIRED: "Enter an operational reason of at least 8 characters.",
    };
    if (messages[code]) return fail(messages[code], 409, undefined, code);
    return serverError("Reward grant could not be completed.", code);
  }
}
