import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRequestUser(request);
  if (auth.response) return auth.response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Creator sponsorship proposals");
  try {
    const snap = await db.collection("sponsorProposals").where("linkedCreatorId", "==", auth.user.uid).limit(100).get();
    const proposals: Array<Record<string, unknown> & { id: string }> = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const visible = proposals.filter((proposal) => proposal.status !== "draft").sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
    return ok({ proposals: visible }, "Creator sponsorship proposals loaded.");
  } catch (error) {
    console.error("[creator-sponsorship-proposals:get]", { userId: auth.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsorship proposals could not be loaded.");
  }
}
