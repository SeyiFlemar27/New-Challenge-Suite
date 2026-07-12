import { requireSponsorContext } from "@/lib/server/sponsor";
import { ok, serverError } from "@/lib/server/responses";

export async function DELETE(request: Request, { params }: { params: Promise<{ creatorId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const { creatorId } = await params;
    await context.db.collection("sponsorSavedCreators").doc(`${context.user.uid}_${creatorId}`).delete();
    return ok({ removed: true, creatorId }, "Saved creator removed.");
  } catch (error) {
    console.error("[sponsor-save-creator:delete]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Saved creator could not be removed.");
  }
}
