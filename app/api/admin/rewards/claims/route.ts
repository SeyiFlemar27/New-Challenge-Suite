import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
import { ok, serverUnavailable } from "@/lib/server/responses";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { const { response } = await requireAdminUser(request); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Admin reward claims"); const snap = await db.collection("rewardClaims").limit(300).get(); return ok({ claims: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) }, "Reward claims loaded."); }
