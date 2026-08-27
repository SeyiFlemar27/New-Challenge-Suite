import { ok, serverError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { campaignFundingDisclaimer } from "@/lib/sponsor-finance";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request, { allowHistorical: true });
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const walletSnap = await context.db.collection("sponsorWallets").doc(context.sponsorId).get();
    const [transactionsSnap, fundingSnap] = await Promise.all([
      context.db.collection("sponsorWalletTransactions").where("sponsorId", "==", context.sponsorId).limit(25).get(),
      context.db.collection("sponsorCampaignFunding").where("sponsorId", "==", context.sponsorId).limit(25).get()
    ]);
    const wallet = walletSnap.exists ? { id: walletSnap.id, ...walletSnap.data() } : { id: context.sponsorId, sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, availableBalanceCents: 0, reservedFundsCents: 0, pendingTransactionsCents: 0, campaignCommitmentsCents: 0, releasedPaymentsCents: 0, refundsCents: 0, failedPaymentsCents: 0, totalSpendCents: 0, currency: "USD", providerStatus: "not_configured", fundingEnabled: false, paymentReleaseEnabled: false };
    const transactions = transactionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const commitments = fundingSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return ok({ wallet, transactions, commitments, disclaimer: campaignFundingDisclaimer }, "Sponsor wallet foundation loaded.");
  } catch (error) {
    console.error("[sponsor-wallet:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor wallet could not be loaded.");
  }
}
