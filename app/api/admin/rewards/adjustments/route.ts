import { getAdminDb } from "@/lib/firebase/admin";
import { requireRecentAdminAuthentication } from "@/lib/server/auth";
import { adjustRewardPoints } from "@/lib/server/reward-economy";
import { fail, ok, readJson, serverError, serverUnavailable } from "@/lib/server/responses";

export async function POST(request: Request) {
  const { user, response } = await requireRecentAdminAuthentication(request, "rewards.adjustUser");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Reward adjustment");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body ?? {};
  const direction = body.direction === "debit" ? "debit" : body.direction === "credit" ? "credit" : null;
  if (!direction || typeof body.userId !== "string" || typeof body.idempotencyKey !== "string" || typeof body.reason !== "string") return fail("Enter a user, direction, amount, reason, and idempotency reference.", 400, undefined, "VALIDATION_ERROR");
  try {
    const result = await adjustRewardPoints(db, { userId: body.userId, adminId: user.uid, direction, amount: Number(body.amount), reason: body.reason, confirmation: String(body.confirmation ?? ""), idempotencyKey: body.idempotencyKey });
    return ok(result, result.idempotent ? "This adjustment was already recorded." : "Reward Points adjusted.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "REWARD_ADJUSTMENT_FAILED";
    if (code.startsWith("REWARD_")) return fail("The reward adjustment could not be completed. Check the balance, reason, and confirmation.", 409, undefined, code);
    return serverError("Reward adjustment could not be completed.", code);
  }
}
