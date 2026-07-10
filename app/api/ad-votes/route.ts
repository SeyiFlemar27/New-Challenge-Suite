import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

function providerConfigured() {
  return Boolean(process.env.AD_REWARD_PROVIDER && process.env.AD_REWARD_PROVIDER !== "disabled");
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const configured = providerConfigured();
  return ok({
    userId: user.uid,
    available: configured,
    status: configured ? "available" : "not_available",
    providerConfigured: configured,
    dailyLimit: 0,
    grantsClientSide: false,
    providerVerificationRequired: true,
    fields: ["adProvider", "adSessionId", "adCompletedAt", "adRewardStatus", "adRewardToken", "adRewardExpiresAt"]
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
  const now = new Date().toISOString();
  const ref = db.collection("adVoteRewardLogs").doc();
  await ref.set({
    id: ref.id,
    userId: user.uid,
    challengeId: challengeId || null,
    adProvider: process.env.AD_REWARD_PROVIDER ?? "not_configured",
    adRewardStatus: "not_available",
    rewardType: "bonus_vote_foundation",
    voteGranted: false,
    providerVerificationRequired: true,
    clientGrantBlocked: true,
    createdAt: now,
    updatedAt: now
  });
  return fail("Ads for votes are not available yet. Bonus votes require a verified ad provider callback before any server-side credit can be granted.", 503, { logId: ref.id, voteGranted: false }, "AD_PROVIDER_NOT_CONFIGURED");
}
