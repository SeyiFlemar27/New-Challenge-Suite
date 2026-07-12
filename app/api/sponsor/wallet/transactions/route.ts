import { ok, serverError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const snap = await context.db.collection("sponsorWalletTransactions").where("sponsorId", "==", context.user.uid).limit(100).get();
    const transactions = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String((b as any).createdAt ?? "").localeCompare(String((a as any).createdAt ?? "")));
    return ok({ transactions }, "Sponsor wallet transactions loaded.");
  } catch (error) {
    console.error("[sponsor-transactions:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor wallet transactions could not be loaded.");
  }
}
