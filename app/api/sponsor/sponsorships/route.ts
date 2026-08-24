import { ok, serverError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const snapshot = await context.db.collection("sponsorships").where("sponsorId", "==", context.sponsorId).limit(100).get();
    const sponsorships = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }))
      .sort((left, right) => String(right.updatedAt ?? right.createdAt ?? "").localeCompare(String(left.updatedAt ?? left.createdAt ?? "")));
    return ok({ sponsorships }, "Sponsorships loaded.");
  } catch (error) {
    console.error("[sponsor-sponsorships:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsorships could not be loaded.");
  }
}
