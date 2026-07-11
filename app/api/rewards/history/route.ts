import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, serverUnavailable } from "@/lib/server/responses";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { const { user, response } = await requireRequestUser(request); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Rewards"); const [spins, claims] = await Promise.all([db.collection("spinResults").where("userId", "==", user.uid).limit(100).get(), db.collection("rewardClaims").where("userId", "==", user.uid).limit(100).get()]); return ok({ history: spins.docs.map((doc) => ({ id: doc.id, ...doc.data() })), claims: claims.docs.map((doc) => ({ id: doc.id, ...doc.data() })) }, "Reward history loaded."); }
