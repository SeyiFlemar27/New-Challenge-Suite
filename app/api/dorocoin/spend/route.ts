import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { applyDoroCoinTransaction } from "@/lib/server/dorocoin";
import { getActiveEconomyRules } from "@/lib/server/economy-rules";
import { getRequestIdempotencyKey } from "@/lib/server/idempotency";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

const allowed = new Set(["free_community_challenge_entry", "challenge_visibility_boost", "raffle_entry", "cosmetic_profile_upgrade", "digital_badge", "virtual_gift", "seasonal_event", "educational_content", "promotional_item"]);

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const sourceType = String(parsed.body?.sourceType ?? "");
  const amount = Number(parsed.body?.amount ?? 0);
  const key = getRequestIdempotencyKey(request, parsed.body);
  if (!allowed.has(sourceType) || !Number.isInteger(amount) || amount <= 0 || !key) return validationError({ spend: "Select an eligible non-cash DoroCoin use, positive amount, and idempotency key." });
  const db = getAdminDb();
  if (!db) return serverUnavailable("DoroCoin spend");
  try {
    const rules = await getActiveEconomyRules(db);
    const transaction = await applyDoroCoinTransaction(db, { userId: user.uid, amount: -amount, type: "spend", sourceType, description: String(parsed.body?.reason ?? `DoroCoin spend: ${sourceType}`), createdBy: user.uid, idempotencyKey: key, relatedChallengeId: parsed.body?.challengeId ? String(parsed.body.challengeId) : undefined, ruleVersion: rules.version });
    return ok({ transaction }, "DoroCoin spend recorded. DoroCoins are not cash and cannot be withdrawn.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "DoroCoins could not be spent.", 409, undefined, "DOROCOIN_SPEND_REJECTED");
  }
}
