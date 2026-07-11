import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
import { adminPrizePayload, normalizeRewardPrize } from "@/lib/server/rewards";
import { ok, readJson, serverUnavailable } from "@/lib/server/responses";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { const { response } = await requireAdminUser(request); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Admin rewards"); const snap = await db.collection("rewardPrizes").limit(500).get(); return ok({ prizes: snap.docs.map((doc) => normalizeRewardPrize(doc.id, doc.data())) }, "Reward prizes loaded."); }
export async function POST(request: Request) { const { user, response } = await requireAdminUser(request); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Admin rewards"); const parsed = await readJson(request); if (parsed.response) return parsed.response; const ref = db.collection("rewardPrizes").doc(); const now = new Date().toISOString(); const payload = { id: ref.id, ...adminPrizePayload(parsed.body ?? {}, user.uid), createdAt: now, createdByAdminId: user.uid, winCount: 0 }; await ref.set(payload); await db.collection("rewardAuditLogs").add({ action: "admin_reward_prize_created", prizeId: ref.id, adminId: user.uid, createdAt: now }); return ok({ prize: payload }, "Prize created."); }

