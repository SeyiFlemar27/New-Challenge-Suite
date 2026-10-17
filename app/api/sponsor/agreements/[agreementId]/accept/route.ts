import { requireSponsorContext, requireSponsorPermission } from "@/lib/server/sponsor";
import { normalizeSponsorReviewStatus, sponsorIsApproved } from "@/lib/sponsor-access";
import { fail, ok, serverError } from "@/lib/server/responses";
import { sponsorTermsFingerprint, tournamentSponsorFundingWindow } from "@/lib/server/sponsor-subject";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ agreementId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const denied = requireSponsorPermission(context, "sponsorship.manage");
  if (denied) return denied;
  const reviewStatus = normalizeSponsorReviewStatus(context.sponsorProfile.sponsorVerificationStatus ?? context.sponsorProfile.businessVerificationStatus);
  if (!sponsorIsApproved(reviewStatus)) return fail("Sponsor approval is required before accepting sponsorship agreements.", 403, { reviewStatus }, "SPONSOR_APPROVAL_REQUIRED");
  const { agreementId } = await params;
  const ref = context.db.collection("sponsorChallengeAgreements").doc(agreementId);
  try {
    const result = await context.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new Error("AGREEMENT_NOT_FOUND");
      const agreement = snap.data() ?? {};
      if (agreement.sponsorOrganizationId !== context.organizationId) throw new Error("AGREEMENT_FORBIDDEN");
      let termsFingerprint: string | undefined;
      if (agreement.subjectType === "tournament") {
        const tournament = await transaction.get(context.db.collection("tournaments").doc(String(agreement.tournamentId ?? "")));
        if (!tournament.exists || !tournamentSponsorFundingWindow(tournament.data() ?? {}).allowed) throw new Error("TOURNAMENT_SPONSOR_WINDOW_CLOSED");
        termsFingerprint = sponsorTermsFingerprint(agreement.terms ?? {});
        if (agreement.termsFingerprint !== termsFingerprint || agreement.creatorAcceptedFingerprint !== termsFingerprint) throw new Error("CREATOR_ACCEPTANCE_REQUIRED");
      }
      if (agreement.status === "accepted" || agreement.status === "funding_pending" || agreement.status === "funded_pending_review" || agreement.status === "active") return { agreement: { id: snap.id, ...agreement }, duplicate: true };
      if (agreement.status !== "awaiting_sponsor_acceptance" || agreement.creatorAcceptedVersion !== agreement.termsVersion) throw new Error("CREATOR_ACCEPTANCE_REQUIRED");
      const now = new Date().toISOString();
      const update = { status: "accepted", sponsorAcceptedVersion: agreement.termsVersion, sponsorAcceptedAt: now, sponsorAcceptedBy: context.user.uid, agreementAcceptedAt: now, updatedAt: now, ...(termsFingerprint ? { sponsorAcceptedFingerprint: termsFingerprint } : {}) };
      transaction.set(ref, update, { merge: true });
      if (termsFingerprint) transaction.create(context.db.collection("tournamentAuditEvents").doc(`${ref.id}_sponsor_accept`), { tournamentId: agreement.tournamentId, agreementId: ref.id, actorId: context.user.uid, sponsorOrganizationId: context.organizationId, action: "sponsor_accepted_versioned_terms", before: { status: agreement.status, termsVersion: agreement.termsVersion }, after: update, termsFingerprint, createdAt: now });
      return { agreement: { id: snap.id, ...agreement, ...update }, duplicate: false };
    });
    return ok(result, result.duplicate ? "These terms are already accepted." : "Both parties accepted the same sponsorship terms.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "AGREEMENT_NOT_FOUND") return fail("Sponsorship agreement was not found.", 404, undefined, "NOT_FOUND");
    if (code === "AGREEMENT_FORBIDDEN") return fail("This agreement belongs to another Sponsor organization.", 403, undefined, "PERMISSION_DENIED");
    if (code === "CREATOR_ACCEPTANCE_REQUIRED") return fail("The challenge owner has not accepted these exact terms.", 409, undefined, "CREATOR_ACCEPTANCE_REQUIRED");
    if (code === "TOURNAMENT_SPONSOR_WINDOW_CLOSED") return fail("Tournament sponsorship is closed or financially restricted.", 409, undefined, code);
    return serverError("Sponsorship terms could not be accepted.");
  }
}
