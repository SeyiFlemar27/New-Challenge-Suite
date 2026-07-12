import { ok, serverError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const snap = await context.db.collection("sponsorInvoices").where("sponsorId", "==", context.user.uid).limit(100).get();
    const invoices = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String((b as any).issueDate ?? "").localeCompare(String((a as any).issueDate ?? "")));
    return ok({ invoices }, "Sponsor invoices loaded.");
  } catch (error) {
    console.error("[sponsor-invoices:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor invoices could not be loaded.");
  }
}
