import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { writeAuditLog } from "@/lib/server/audit";

export const dynamic = "force-dynamic";

const decisionSchema = z.object({
  id: z.string().trim().min(1).max(180),
  action: z.enum(["approve_placement", "reject_placement"]),
  reason: z.string().trim().min(8).max(1200)
});

export async function GET(request: Request) {
  const { response } = await requireAdminPermission(request, "sponsorCampaigns.review");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sponsor campaign reviews");
  try {
    const snapshot = await db.collection("sponsorships").where("status", "==", "pending_admin_review").limit(100).get();
    const campaigns = snapshot.docs.filter((doc) => Boolean(doc.data().agreementId)).map((doc) => ({ id: doc.id, ...doc.data() }));
    return ok({ campaigns }, "Funded Sponsor placements awaiting review.");
  } catch (error) {
    console.error("[admin-sponsor-campaign-reviews:get]", error);
    return serverUnavailable("Sponsor campaign reviews");
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireAdminPermission(request, "sponsorCampaigns.review");
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const input = decisionSchema.safeParse(parsed.body ?? {});
  if (!input.success) return validationError(Object.fromEntries(input.error.issues.map((issue) => [String(issue.path[0] ?? "review"), issue.message])));
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sponsor campaign reviews");
  const now = new Date().toISOString();
  const sponsorshipRef = db.collection("sponsorships").doc(input.data.id);
  try {
    const result = await db.runTransaction(async (transaction) => {
      const sponsorshipSnap = await transaction.get(sponsorshipRef);
      if (!sponsorshipSnap.exists) throw new Error("SPONSORSHIP_NOT_FOUND");
      const sponsorship = sponsorshipSnap.data() ?? {};
      if (input.data.action === "approve_placement" && sponsorship.status === "approved" && sponsorship.placementStatus === "approved") {
        return { agreementId: String(sponsorship.agreementId ?? ""), sponsorshipId: sponsorshipRef.id, status: "approved", placementStatus: "approved", financialMutation: false, duplicate: true };
      }
      if (input.data.action === "reject_placement" && sponsorship.status === "placement_rejected_pending_refund" && sponsorship.placementStatus === "rejected_pending_refund_review") {
        return { agreementId: String(sponsorship.agreementId ?? ""), sponsorshipId: sponsorshipRef.id, status: "placement_rejected_pending_refund", placementStatus: "rejected_pending_refund_review", financialMutation: false, duplicate: true };
      }
      const agreementId = String(sponsorship.agreementId ?? "");
      if (!agreementId || String(sponsorship.status) !== "pending_admin_review") throw new Error("SPONSORSHIP_NOT_REVIEWABLE");
      const agreementRef = db.collection("sponsorChallengeAgreements").doc(agreementId);
      const contributionId = String(sponsorship.sponsorContributionId ?? "");
      if (!contributionId) throw new Error("FUNDING_SOURCE_MISSING");
      const contributionRef = db.collection("sponsorContributions").doc(contributionId);
      const [agreementSnap, contributionSnap, challengeSnap] = await Promise.all([
        transaction.get(agreementRef),
        transaction.get(contributionRef),
        transaction.get(db.collection("challenges").doc(String(sponsorship.challengeId ?? "")))
      ]);
      if (!agreementSnap.exists || !contributionSnap.exists || !challengeSnap.exists) throw new Error("LINKED_RECORD_MISSING");
      const agreement = agreementSnap.data() ?? {};
      const contribution = contributionSnap.data() ?? {};
      const challenge = challengeSnap.data() ?? {};
      const amountCents = Number(sponsorship.amountCents ?? 0);
      if (String(agreement.status) !== "funded_pending_review" || agreement.fundingStatus !== "confirmed"
        || agreement.creatorAcceptedVersion !== agreement.termsVersion || agreement.sponsorAcceptedVersion !== agreement.termsVersion
        || String(contribution.status) !== "confirmed" || String(contribution.agreementId) !== agreementId
        || String(contribution.challengeId) !== String(sponsorship.challengeId)
        || String(contribution.sponsorId) !== String(sponsorship.sponsorOrganizationId)
        || Number(contribution.amountCents) !== amountCents || Number(agreement.terms?.amountCents) !== amountCents
        || String(agreement.sponsorOrganizationId) !== String(sponsorship.sponsorOrganizationId)
        || String(agreement.challengeId) !== String(sponsorship.challengeId)
        || String(agreement.creatorId) !== String(challenge.creatorId ?? challenge.hostId ?? "")) throw new Error("SPONSORSHIP_LINKAGE_MISMATCH");

      const approved = input.data.action === "approve_placement";
      const status = approved ? "approved" : "placement_rejected_pending_refund";
      const placementStatus = approved ? "approved" : "rejected_pending_refund_review";
      transaction.set(sponsorshipRef, { status, placementStatus, adminDecision: input.data.action, adminDecisionReason: input.data.reason, adminReviewedBy: user!.uid, adminReviewedAt: now, ...(approved ? { activationAt: now } : {}), updatedAt: now }, { merge: true });
      transaction.set(agreementRef, { status: approved ? "active" : "placement_rejected_pending_refund", placementStatus, adminDecision: input.data.action, adminDecisionReason: input.data.reason, adminReviewedBy: user!.uid, adminReviewedAt: now, ...(approved ? { activatedAt: now } : {}), updatedAt: now }, { merge: true });
      return { agreementId, sponsorshipId: sponsorshipRef.id, status, placementStatus, financialMutation: false, duplicate: false };
    });
    if (!result.duplicate) await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: `sponsor_campaign.${input.data.action}`, targetType: "sponsorship", targetId: input.data.id, reason: input.data.reason, metadata: { ...result, fundingStatus: "confirmed", noPayoutExecuted: true } }, db);
    return ok(result, result.duplicate ? "This placement decision is already recorded." : input.data.action === "approve_placement" ? "Funded Sponsor placement approved and activated." : "Placement rejected and marked for refund review. Confirmed prize funding was not changed.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "SPONSORSHIP_NOT_FOUND") return fail("Sponsor campaign was not found.", 404, undefined, "NOT_FOUND");
    if (code === "SPONSORSHIP_NOT_REVIEWABLE") return fail("This campaign is not awaiting placement review.", 409, undefined, "INVALID_TRANSITION");
    if (["FUNDING_SOURCE_MISSING", "LINKED_RECORD_MISSING", "SPONSORSHIP_LINKAGE_MISMATCH"].includes(code)) return fail("Campaign funding, agreement, and challenge records do not match; no placement change was made.", 409, undefined, "FINANCIAL_LINKAGE_MISMATCH");
    console.error("[admin-sponsor-campaign-reviews:patch]", { code, message: error instanceof Error ? error.message : String(error) });
    return serverUnavailable("Sponsor campaign decision");
  }
}
