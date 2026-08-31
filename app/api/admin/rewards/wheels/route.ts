import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission, requireRecentAdminAuthentication } from "@/lib/server/auth";
import { loadAdminRewardWheelConfiguration, publishRewardWheelVersion, saveRewardWheelDraft, type RewardSpinTier } from "@/lib/server/rewards";
import { fail, ok, readJson, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  WHEEL_POINT_COST_INVALID: "Enter a whole-number Spin cost greater than zero.",
  WHEEL_ENTRIES_REQUIRED: "Add at least one active prize with a positive weight.",
  WHEEL_DUPLICATE_PRIZE: "Each prize can appear only once in a wheel version.",
  WHEEL_PRIZE_UNAVAILABLE: "Every wheel entry must reference an active prize in the selected tier.",
  WHEEL_VERSION_IMMUTABLE: "Published wheel versions cannot be edited. Create a new draft instead.",
  WHEEL_VERSION_NOT_FOUND: "This wheel version is no longer available.",
  WHEEL_PUBLISH_CONFIRMATION_REQUIRED: "Enter the publish confirmation exactly as shown.",
  WHEEL_PUBLISH_REASON_REQUIRED: "Enter a clear publish reason of at least eight characters.",
  WHEEL_REWARD_POINT_RETURN_BLOCKED: "Publishing is blocked because expected Reward Point return reaches or exceeds the Spin cost.",
};

export async function GET(request: Request) {
  const { response } = await requireAdminPermission(request, "rewards.view");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin reward wheels");
  return ok(await loadAdminRewardWheelConfiguration(db), "Reward wheel configuration loaded.");
}

export async function POST(request: Request) {
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body ?? {};
  const action = body.action === "publish" ? "publish" : "save_draft";
  const auth = action === "publish" ? await requireRecentAdminAuthentication(request, "rewards.publish") : await requireAdminPermission(request, "rewards.configure");
  if (auth.response) return auth.response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin reward wheels");
  try {
    if (action === "publish") {
      const result = await publishRewardWheelVersion(db, { adminId: auth.user.uid, versionId: String(body.versionId ?? ""), reason: String(body.reason ?? ""), confirmation: String(body.confirmation ?? "") });
      return ok(result, result.idempotent ? "This wheel version is already active." : "Wheel version published.");
    }
    const selectedTier = String(body.tier ?? "") as RewardSpinTier;
    if (!["basic", "standard", "premium"].includes(selectedTier)) return fail("Select a valid Spin tier.", 400, undefined, "WHEEL_TIER_INVALID");
    const result = await saveRewardWheelDraft(db, { adminId: auth.user.uid, versionId: typeof body.versionId === "string" && body.versionId ? body.versionId : null, tier: selectedTier, pointCost: Number(body.pointCost), entries: Array.isArray(body.entries) ? body.entries : [], reason: String(body.reason ?? "") });
    return ok(result, "Wheel draft saved.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "REWARD_WHEEL_UPDATE_FAILED";
    if (messages[code]) return fail(messages[code], 422, undefined, code);
    return serverError("Reward wheel configuration could not be updated.", code);
  }
}
