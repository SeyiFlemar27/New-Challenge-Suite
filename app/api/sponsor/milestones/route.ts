import { ok, serverError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const snap = await context.db.collection("sponsorMilestones").where("sponsorId", "==", context.user.uid).limit(100).get();
    const milestones = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String((a as any).dueDate ?? "").localeCompare(String((b as any).dueDate ?? "")));
    return ok({ milestones }, "Sponsor milestones loaded.");
  } catch (error) {
    console.error("[sponsor-milestones:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor milestones could not be loaded.");
  }
}
