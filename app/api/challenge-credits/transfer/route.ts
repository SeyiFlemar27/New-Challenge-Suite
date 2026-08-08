import { getAdminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/server/audit";
import { requireRequestUser } from "@/lib/server/auth";
import { transferChallengeCredits } from "@/lib/server/challenge-credits";
import { getActiveEconomyRules } from "@/lib/server/economy-rules";
import { getRequestIdempotencyKey } from "@/lib/server/idempotency";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const receiverId = String(parsed.body?.receiverId ?? "").trim();
  const amount = Number(parsed.body?.amount ?? 0);
  const key = getRequestIdempotencyKey(request, parsed.body);
  if (!receiverId || !Number.isInteger(amount) || amount <= 0 || !key) return validationError({ transfer: "Receiver, positive whole amount, and idempotency key are required." });
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge Credit transfer");
  try {
    const rules = await getActiveEconomyRules(db);
    const limits = rules.challengeCredits.transfer;
    if (amount < limits.minimum || amount > limits.maximum) return validationError({ amount: `Challenge Credit transfer must be between ${limits.minimum} and ${limits.maximum}.` });
    const reason = String(parsed.body?.reason ?? "User confirmed Challenge Credit transfer").slice(0, 300);
    const transfer = await transferChallengeCredits(db, { senderId: user.uid, receiverId, amount, idempotencyKey: key, reason, dailyMaximum: limits.dailyMaximum, ruleVersion: rules.version });
    await writeAuditLog({ actorId: user.uid, actorType: "user", action: "economy.challenge_credits_transferred", targetType: "account", targetId: receiverId, reason, metadata: { transferId: transfer.id, amount, ruleVersion: rules.version } }, db).catch(() => undefined);
    return ok({ transfer }, "Challenge Credits transferred. Challenge Credits are not cash and cannot be withdrawn.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Challenge Credits could not be transferred.", 409, undefined, "CREDIT_TRANSFER_REJECTED");
  }
}
