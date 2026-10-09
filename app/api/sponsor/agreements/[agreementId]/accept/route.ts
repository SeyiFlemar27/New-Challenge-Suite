import { requireSponsorContext, requireSponsorPermission } from "@/lib/server/sponsor";
import { fail, ok, serverError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ agreementId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const denied = requireSponsorPermission(context, "sponsorship.manage");
  if (denied) return denied;
  const { agreementId } = await params;
  const ref = context.db.collection("sponsorChallengeAgreements").doc(agreementId);
  try {
    const result = await context.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new Error("AGREEMENT_NOT_FOUND");
      const agreement = snap.data() ?? {};
      if (agreement.sponsorOrganizationId !== context.organizationId) throw new Error("AGREEMENT_FORBIDDEN");
      if (agreement.status === "accepted" || agreement.status === "funding_pending" || agreement.status === "funded_pending_review" || agreement.status === "active") return { agreement: { id: snap.id, ...agreement }, duplicate: true };
      if (agreement.status !== "awaiting_sponsor_acceptance" || agreement.creatorAcceptedVersion !== agreement.termsVersion) throw new Error("CREATOR_ACCEPTANCE_REQUIRED");
      const now = new Date().toISOString();
      const update = { status: "accepted", sponsorAcceptedVersion: agreement.termsVersion, sponsorAcceptedAt: now, sponsorAcceptedBy: context.user.uid, agreementAcceptedAt: now, updatedAt: now };
      transaction.set(ref, update, { merge: true });
      return { agreement: { id: snap.id, ...agreement, ...update }, duplicate: false };
    });
    return ok(result, result.duplicate ? "These terms are already accepted." : "Both parties accepted the same sponsorship terms.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "AGREEMENT_NOT_FOUND") return fail("Sponsorship agreement was not found.", 404, undefined, "NOT_FOUND");
    if (code === "AGREEMENT_FORBIDDEN") return fail("This agreement belongs to another Sponsor organization.", 403, undefined, "PERMISSION_DENIED");
    if (code === "CREATOR_ACCEPTANCE_REQUIRED") return fail("The challenge owner has not accepted these exact terms.", 409, undefined, "CREATOR_ACCEPTANCE_REQUIRED");
    return serverError("Sponsorship terms could not be accepted.");
  }
}
