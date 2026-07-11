import { getAdminDb } from "@/lib/firebase/admin";
import { getRewardSettings } from "@/lib/server/rewards";
import { ok, serverUnavailable } from "@/lib/server/responses";
export const dynamic = "force-dynamic";
export async function GET() { const db = getAdminDb(); if (!db) return serverUnavailable("Rewards"); return ok({ settings: await getRewardSettings(db) }, "Reward settings loaded."); }
