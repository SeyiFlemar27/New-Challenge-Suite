import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { REWARDED_AD_COOLDOWN_MS, REWARDED_AD_CYCLE_LIMIT, REWARDED_AD_DOROCOINS } from "@/lib/server/rewarded-ads";

export const dynamic = "force-dynamic";

function providerConfigured() {
  return process.env.AD_REWARD_PROVIDER === "google_ad_manager" && Boolean(process.env.AD_REWARD_AD_UNIT_ID);
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const providerDetected = providerConfigured();
  const configured = false;
  return ok({
    userId: user.uid,
    available: configured,
    status: configured ? "available" : "not_available",
    adProvider: providerDetected ? "google_ad_manager" : "disabled",
    providerDetected,
    adRewardEnabled: configured,
    adUnitConfigured: configured,
    rewardAmount: REWARDED_AD_DOROCOINS,
    adConsecutiveLimit: REWARDED_AD_CYCLE_LIMIT,
    adCooldownMinutes: REWARDED_AD_COOLDOWN_MS / 60_000,
    grantsClientSide: false,
    providerVerificationRequired: true,
    providerCallbackRequired: true,
    fields: ["adProvider", "adSessionId", "adCompletedAt", "adRewardStatus", "adRewardToken", "adRewardExpiresAt", "consecutiveCount", "cooldownUntil"]
  }, providerDetected ? "Rewarded ads require verified callback activation." : "Rewarded ads are not available yet.");
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
    rewardType: "dorocoin_reward_provider_verified_foundation",
    voteGranted: false,
    providerVerificationRequired: true,
    providerCallbackRequired: true,
    clientGrantBlocked: true,
    rewardAmount: REWARDED_AD_DOROCOINS,
    adConsecutiveLimit: REWARDED_AD_CYCLE_LIMIT,
    adCooldownMinutes: REWARDED_AD_COOLDOWN_MS / 60_000,
    cooldownUntil: null,
    createdAt: now,
    updatedAt: now
  });
  return fail("Rewarded ads are unavailable until a verified provider callback is configured.", 503, { logId: ref.id, voteGranted: false, rewardAmount: REWARDED_AD_DOROCOINS, adConsecutiveLimit: REWARDED_AD_CYCLE_LIMIT, adCooldownMinutes: REWARDED_AD_COOLDOWN_MS / 60_000 }, "AD_PROVIDER_NOT_CONFIGURED");
}
