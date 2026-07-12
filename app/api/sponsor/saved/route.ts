import { requireSponsorContext } from "@/lib/server/sponsor";
import { ok, serverError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const [creatorSnap, challengeSnap] = await Promise.all([
      context.db.collection("sponsorSavedCreators").where("sponsorId", "==", context.user.uid).limit(100).get(),
      context.db.collection("sponsorSavedChallenges").where("sponsorId", "==", context.user.uid).limit(100).get()
    ]);
    return ok({ savedCreators: creatorSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })), savedChallenges: challengeSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) }, "Saved sponsor items loaded.");
  } catch (error) {
    console.error("[sponsor-saved:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Saved items could not be loaded.");
  }
}

