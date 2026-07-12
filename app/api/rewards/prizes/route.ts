import { getAdminDb } from "@/lib/firebase/admin";
import { getActiveRewardCampaign, getRewardSettings, loadRewardPrizes, publicPrize, rewardPrizesNeedSetup } from "@/lib/server/rewards";
import { ok, serverUnavailable } from "@/lib/server/responses";
export const dynamic = "force-dynamic";
export async function GET() { const db = getAdminDb(); if (!db) return serverUnavailable("Rewards"); const settings = await getRewardSettings(db); const campaign = await getActiveRewardCampaign(db, settings); const loadedPrizes = await loadRewardPrizes(db); const prizeSetupRequired = rewardPrizesNeedSetup(loadedPrizes); const prizes = prizeSetupRequired ? [] : loadedPrizes.map(publicPrize); return ok({ campaign, prizes, prizeSetupRequired, safety: { serverSelectsPrize: true, cashOutEnabled: false } }, "Reward prizes loaded."); }
