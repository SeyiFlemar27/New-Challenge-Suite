import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { applyGrowthWalletTransaction, type GrowthWalletSourceType } from "@/lib/server/creator-growth-wallet";
import { getRequestIdempotencyKey } from "@/lib/server/idempotency";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

const uses = new Set<GrowthWalletSourceType>(["spend_boost", "spend_ads", "spend_featured_placement", "spend_creator_collaboration", "spend_community_campaign", "spend_live_event_marketing", "spend_audience_development"]);

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const sourceType = String(parsed.body?.sourceType ?? "") as GrowthWalletSourceType;
  const amountCents = Number(parsed.body?.amountCents ?? 0);
  const key = getRequestIdempotencyKey(request, parsed.body);
  if (!uses.has(sourceType) || !Number.isInteger(amountCents) || amountCents <= 0 || !key) return validationError({ spend: "Eligible growth tool, positive whole-cent amount, and idempotency key are required." });
  const db = getAdminDb();
  if (!db) return serverUnavailable("Creator Growth Wallet spend");
  try {
    const transaction = await applyGrowthWalletTransaction(db, { userId: user.uid, amountCents: -amountCents, sourceType, reason: String(parsed.body?.reason ?? sourceType.replaceAll("_", " ")), createdBy: user.uid, idempotencyKey: key, relatedChallengeId: parsed.body?.challengeId ? String(parsed.body.challengeId) : undefined });
    return ok({ transaction }, "Creator Growth Wallet spend recorded. These funds cannot be withdrawn as cash.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Growth Wallet funds could not be spent.", 409, undefined, "GROWTH_WALLET_SPEND_REJECTED");
  }
}
