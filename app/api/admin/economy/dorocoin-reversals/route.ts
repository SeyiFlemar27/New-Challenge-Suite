import { getAdminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/server/audit";
import { requireRecentAdminAuthentication } from "@/lib/server/auth";
import { reverseDoroCoinRewardForAction, type DoroCoinRewardSource } from "@/lib/server/economy-dorocoin";
import { ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

const reversibleSources = new Set<DoroCoinRewardSource>(["referral_signup", "create_free_challenge", "join_free_challenge", "win_free_challenge", "top_10_finish", "profile_verification", "sponsored_ad_watch", "like_challenge", "comment_challenge", "share_challenge", "watch_challenge_video"]);

export async function POST(request: Request) {
  const { user, response } = await requireRecentAdminAuthentication(request, "wallet.adjust");
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const userId = String(parsed.body?.userId ?? "");
  const sourceType = String(parsed.body?.sourceType ?? "") as DoroCoinRewardSource;
  const actionId = String(parsed.body?.actionId ?? "");
  const reason = String(parsed.body?.reason ?? "").trim();
  if (!userId || !actionId || !reversibleSources.has(sourceType) || reason.length < 8) return validationError({ reversal: "User, reward source, action, and a meaningful reversal reason are required." });
  const db = getAdminDb();
  if (!db) return serverUnavailable("DoroCoin reward reversal");
  const result = await reverseDoroCoinRewardForAction(db, { userId, sourceType, actionId, reversedBy: user.uid, reason });
  await writeAuditLog({ actorId: user.uid, actorType: "admin", action: "dorocoin.reward_reversed", targetType: "wallet", targetId: actionId, reason, metadata: { userId, sourceType, reversed: result.reversed } }, db);
  return ok({ result }, result.reversed ? "DoroCoin reward reversed." : "No active reward remained to reverse.");
}
