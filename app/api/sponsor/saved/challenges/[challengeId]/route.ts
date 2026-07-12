import { requireSponsorContext } from "@/lib/server/sponsor";
import { ok, serverError } from "@/lib/server/responses";

export async function DELETE(request: Request, { params }: { params: Promise<{ challengeId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const { challengeId } = await params;
    await context.db.collection("sponsorSavedChallenges").doc(`${context.user.uid}_${challengeId}`).delete();
    return ok({ removed: true, challengeId }, "Saved challenge removed.");
  } catch (error) {
    console.error("[sponsor-save-challenge:delete]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Saved challenge could not be removed.");
  }
}
