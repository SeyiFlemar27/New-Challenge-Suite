import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRequestUser(request);
  if (auth.response) return auth.response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Creator sponsorship deliverables");
  try {
    const snap = await db.collection("sponsorDeliverables").where("relatedCreatorId", "==", auth.user.uid).limit(100).get();
    const deliverables = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string })).sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")));
    return ok({ deliverables }, "Creator sponsorship deliverables loaded.");
  } catch (error) {
    console.error("[creator-sponsorship-deliverables:get]", { userId: auth.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsorship deliverables could not be loaded.");
  }
}
