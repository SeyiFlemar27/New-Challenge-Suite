import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission } from "@/lib/server/auth";
import { ok, serverUnavailable } from "@/lib/server/responses";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { const { response } = await requireAdminPermission(request, "rewards.investigate"); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Admin reward spins"); const snap = await db.collection("spinResults").limit(300).get(); return ok({ spins: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) }, "Reward spins loaded."); }
