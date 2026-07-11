import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
import { getRewardSettings, normalizeRewardSettings } from "@/lib/server/rewards";
import { ok, readJson, serverUnavailable } from "@/lib/server/responses";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { const { response } = await requireAdminUser(request); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Admin reward settings"); return ok({ settings: await getRewardSettings(db) }, "Reward settings loaded."); }
export async function PATCH(request: Request) { const { user, response } = await requireAdminUser(request); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Admin reward settings"); const parsed = await readJson(request); if (parsed.response) return parsed.response; const now = new Date().toISOString(); const settings = normalizeRewardSettings({ id: "default", ...(parsed.body ?? {}), updatedAt: now }); await db.collection("rewardSettings").doc("default").set({ ...settings, updatedByAdminId: user.uid, updatedAt: now }, { merge: true }); await db.collection("rewardAuditLogs").add({ action: "admin_reward_settings_updated", adminId: user.uid, createdAt: now }); return ok({ settings }, "Reward settings updated."); }
