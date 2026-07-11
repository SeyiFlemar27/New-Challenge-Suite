import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
import { normalizeRewardCampaign } from "@/lib/server/rewards";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, { params }: { params: Promise<{ campaignId: string }> }) { const { user, response } = await requireAdminUser(request); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Admin reward campaigns"); const parsed = await readJson(request); if (parsed.response) return parsed.response; const ref = db.collection("rewardCampaigns").doc((await params).campaignId); const snap = await ref.get(); if (!snap.exists) return fail("Campaign not found.", 404, undefined, "CAMPAIGN_NOT_FOUND"); await ref.set({ ...(parsed.body ?? {}), updatedByAdminId: user.uid, updatedAt: new Date().toISOString() }, { merge: true }); const updated = await ref.get(); await db.collection("rewardAuditLogs").add({ action: "admin_reward_campaign_updated", campaignId: ref.id, adminId: user.uid, createdAt: new Date().toISOString() }); return ok({ campaign: normalizeRewardCampaign(updated.id, updated.data()) }, "Reward campaign updated."); }

