import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, serverUnavailable } from "@/lib/server/responses";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Paid vote status");
  const { id: challengeId } = await params;
  const [purchasesSnap, creditsSnap] = await Promise.all([
    db.collection("paidVotePurchases").where("userId", "==", user.uid).where("challengeId", "==", challengeId).limit(25).get(),
    db.collection("paidVoteCredits").where("userId", "==", user.uid).where("challengeId", "==", challengeId).limit(25).get()
  ]);
  const purchases = purchasesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }));
  const credits = creditsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }));
  return ok({
    purchases,
    credits,
    availableCredits: credits.reduce((sum, item) => sum + Math.max(0, Number(item.votesRemaining ?? 0)), 0),
    webhookConfirmationRequired: true,
    checkoutSuccessGrantsVotes: false,
    creditConsumptionActive: false
  }, "Paid vote status loaded.");
}
