import { getAdminDb } from "@/lib/firebase/admin";
import { getActiveRewardCampaign, getRewardSettings, loadRewardPrizes, publicPrize } from "@/lib/server/rewards";
import { ok, serverUnavailable } from "@/lib/server/responses";
export const dynamic = "force-dynamic";
export async function GET() { const db = getAdminDb(); if (!db) return serverUnavailable("Rewards"); const settings = await getRewardSettings(db); const campaign = await getActiveRewardCampaign(db, settings); const prizes = (await loadRewardPrizes(db)).map(publicPrize); return ok({ campaign, prizes, safety: { serverSelectsPrize: true, cashOutEnabled: false } }, "Reward prizes loaded."); }
