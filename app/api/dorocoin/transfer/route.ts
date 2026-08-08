import { getAdminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/server/audit";
import { requireRequestUser } from "@/lib/server/auth";
import { transferDoroCoins } from "@/lib/server/economy-dorocoin";
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
  if (!receiverId || !Number.isInteger(amount) || !key) return validationError({ transfer: "Receiver, whole amount, and idempotency key are required." });
  const db = getAdminDb();
  if (!db) return serverUnavailable("DoroCoin transfer");
  try {
    const transfer = await transferDoroCoins(db, { senderId: user.uid, receiverId, amount, idempotencyKey: key, note: String(parsed.body?.note ?? "").slice(0, 300) });
    await writeAuditLog({ actorId: user.uid, actorType: "user", action: "economy.dorocoins_transferred", targetType: "account", targetId: receiverId, reason: String(parsed.body?.note ?? "User confirmed DoroCoin transfer").slice(0, 300), metadata: { transferId: transfer.id, amount, ruleVersion: "ruleVersion" in transfer ? transfer.ruleVersion : null } }, db).catch(() => undefined);
    return ok({ transfer }, "DoroCoins transferred. DoroCoins remain non-cash and non-withdrawable.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "DoroCoins could not be transferred.", 409, undefined, "DOROCOIN_TRANSFER_REJECTED");
  }
}
