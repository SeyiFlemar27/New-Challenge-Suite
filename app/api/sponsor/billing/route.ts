import { ok, serverError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const [settingsSnap, invoicesSnap] = await Promise.all([
      context.db.collection("sponsorBillingSettings").doc(context.user.uid).get(),
      context.db.collection("sponsorInvoices").where("sponsorId", "==", context.user.uid).limit(12).get()
    ]);
    const billing = settingsSnap.exists ? { id: settingsSnap.id, ...settingsSnap.data() } : { id: context.user.uid, sponsorId: context.user.uid, currentPlan: "Sponsor plan foundation", subscriptionStatus: "not_configured", billingCycle: "managed_in_stripe", nextRenewalDate: null, paymentMethodStatus: "foundation_only", subscriptionChangesRequireServerFlow: true };
    const invoices = invoicesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return ok({ billing, invoices, explanation: "Sponsor subscriptions unlock platform tools. Campaign sponsorship budgets are funded separately per campaign." }, "Sponsor billing foundation loaded.");
  } catch (error) {
    console.error("[sponsor-billing:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor billing could not be loaded.");
  }
}
