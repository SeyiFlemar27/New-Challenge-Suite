import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { applyChallengeCreditTransaction } from "@/lib/server/challenge-credits";
import { getRequestIdempotencyKey } from "@/lib/server/idempotency";
import { fail, ok, readJson, validationError } from "@/lib/server/responses";

export async function POST(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return fail("Sponsor access could not be verified.", 403);
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const { campaignId } = await params;
  const owned = await assertSponsorOwnedDoc(context.db, "sponsorCampaignBriefs", campaignId, context.user.uid);
  if (owned.response) return owned.response;
  const campaign = owned.snap.data() ?? {};
  if (!["approved", "active", "live"].includes(String(campaign.status ?? "").toLowerCase())) return fail("Only approved or active sponsor campaigns can be promoted.", 409, undefined, "CAMPAIGN_NOT_APPROVED");
  const amount = Number(parsed.body?.credits ?? 0);
  const key = getRequestIdempotencyKey(request, parsed.body);
  if (!Number.isInteger(amount) || amount <= 0 || !key) return validationError({ promotion: "A positive Challenge Credit amount and idempotency key are required." });
  try {
    const transaction = await applyChallengeCreditTransaction(context.db, { userId: context.user.uid, amount: -amount, sourceType: "sponsor_campaign_promotion_spend", reason: `Sponsor campaign promotion: ${campaignId}`, createdBy: context.user.uid, idempotencyKey: key, relatedSponsorCampaignId: campaignId });
    await context.db.collection("sponsorCampaignActivity").doc(`credit_promotion_${transaction.id}`).set({ sponsorId: context.user.uid, campaignId, action: "challenge_credit_promotion_spend", credits: amount, transactionId: transaction.id, performanceClaimed: false, createdAt: new Date().toISOString() }, { merge: true });
    return ok({ transaction }, "Campaign promotion Credits recorded. No performance result was fabricated.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Campaign promotion could not be recorded.", 409, undefined, "SPONSOR_PROMOTION_REJECTED");
  }
}
