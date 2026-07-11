import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ claimId: string }> }) { const { user, response } = await requireRequestUser(request); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Rewards"); const snap = await db.collection("rewardClaims").doc((await params).claimId).get(); if (!snap.exists) return fail("Reward claim was not found.", 404, undefined, "CLAIM_NOT_FOUND"); const data = snap.data() ?? {}; if (data.userId !== user.uid) return fail("You can only view your own reward claim.", 403, undefined, "CLAIM_FORBIDDEN"); return ok({ claim: { id: snap.id, ...data } }, "Reward claim loaded."); }

