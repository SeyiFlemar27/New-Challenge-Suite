import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

function providerConfigured() {
  return process.env.AD_REWARD_PROVIDER === "google_ad_manager" && Boolean(process.env.AD_REWARD_AD_UNIT_ID);
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const configured = providerConfigured();
  return ok({
    userId: user.uid,
    available: configured,
    status: configured ? "available" : "not_available",
    adProvider: configured ? "google_ad_manager" : "disabled",
    adRewardEnabled: configured,
    adUnitConfigured: configured,
    adConsecutiveLimit: 3,
    adCooldownMinutes: 60,
    grantsClientSide: false,
    providerVerificationRequired: true,
    providerCallbackRequired: true,
    fields: ["adProvider", "adSessionId", "adCompletedAt", "adRewardStatus", "adRewardToken", "adRewardExpiresAt", "consecutiveCount", "cooldownUntil"]
  }, configured ? "Ad vote provider is configured." : "Ads for votes are not available yet.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Ad vote rewards");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const challengeId = String(parsed.body?.challengeId ?? "");
  const submissionId = String(parsed.body?.submissionId ?? parsed.body?.participantId ?? "");
  const now = new Date().toISOString();
  const ref = db.collection("adVoteRewardLogs").doc();
  await ref.set({
    id: ref.id,
    userId: user.uid,
    challengeId: challengeId || null,
    submissionId: submissionId || null,
    adProvider: process.env.AD_REWARD_PROVIDER ?? "disabled",
    adRewardStatus: "not_available",
    rewardType: "bonus_vote_provider_verified_foundation",
    voteGranted: false,
    providerVerificationRequired: true,
    providerCallbackRequired: true,
    clientGrantBlocked: true,
    adConsecutiveLimit: 3,
    adCooldownMinutes: 60,
    cooldownUntil: null,
    createdAt: now,
    updatedAt: now
  });
  return fail("Ads for votes are not available yet. Bonus votes require a verified Google Ad Manager rewarded-ad callback before any server-side vote credit can be granted.", 503, { logId: ref.id, voteGranted: false, adConsecutiveLimit: 3, adCooldownMinutes: 60 }, "AD_PROVIDER_NOT_CONFIGURED");
}
