import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { buildRewardSummary } from "@/lib/server/rewards";
import { ok, serverUnavailable } from "@/lib/server/responses";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { const { user, response } = await requireRequestUser(request); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Rewards"); return ok(await buildRewardSummary(db, user.uid), "Rewards summary loaded."); }
