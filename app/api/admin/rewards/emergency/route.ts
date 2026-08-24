import { getAdminDb } from "@/lib/firebase/admin";
import { requireRecentAdminAuthentication } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { writeAuditLog } from "@/lib/server/audit";

const allowedActions = new Set(["pause_all", "resume_all", "pause_earning", "resume_earning", "pause_fulfillment", "resume_fulfillment"]);

export async function POST(request: Request) {
  const { user, response } = await requireRecentAdminAuthentication(request, "rewards.emergencyControl");
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const action = String(parsed.body?.action ?? "");
  const reason = String(parsed.body?.reason ?? "").trim();
  if (!allowedActions.has(action) || reason.length < 8) return fail("Choose a valid emergency action and provide a clear reason.", 400, undefined, "VALIDATION_ERROR");
  const db = getAdminDb();
  if (!db) return serverUnavailable("Reward emergency controls");
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updatedAt: now, updatedByAdminId: user.uid, emergencyReason: reason.slice(0, 500) };
  if (action === "pause_all") Object.assign(update, { maintenanceMode: true, rewardEarningPaused: true, rewardFulfillmentPaused: true });
  if (action === "resume_all") Object.assign(update, { maintenanceMode: false, rewardEarningPaused: false, rewardFulfillmentPaused: false });
  if (action === "pause_earning") update.rewardEarningPaused = true;
  if (action === "resume_earning") update.rewardEarningPaused = false;
  if (action === "pause_fulfillment") update.rewardFulfillmentPaused = true;
  if (action === "resume_fulfillment") update.rewardFulfillmentPaused = false;
  await db.collection("rewardSettings").doc("default").set(update, { merge: true });
  await writeAuditLog({ actorId: user.uid, actorType: "admin", action: `rewards.emergency.${action}`, targetType: "reward_settings", targetId: "default", reason, metadata: { externalPayoutExecutionEnabled: false } }, db);
  return ok({ action, settings: update }, "Reward emergency control updated.");
}
