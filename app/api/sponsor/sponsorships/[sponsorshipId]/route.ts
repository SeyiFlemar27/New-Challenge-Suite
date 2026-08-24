import { fail, ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { requireSponsorContext, requireSponsorPermission } from "@/lib/server/sponsor";
import { normalizeSponsorCapacityTerms, releaseSponsorCapacity } from "@/lib/server/sponsor-capacity";
import { cleanText, isoNow } from "@/lib/sponsor-collaboration";

export const dynamic = "force-dynamic";
const issueCategories = new Set(["missing_deliverable", "placement_issue", "analytics_reporting", "funding_finance", "sponsorship_terms", "other"]);

export async function GET(request: Request, { params }: { params: Promise<{ sponsorshipId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const permission = requireSponsorPermission(context, "sponsorship.view");
  if (permission) return permission;
  const { sponsorshipId } = await params;
  const snap = await context.db.collection("sponsorships").doc(sponsorshipId).get();
  if (!snap.exists || snap.data()?.sponsorId !== context.sponsorId) return fail("Sponsorship not found.", 404, undefined, "NOT_FOUND");
  return ok({ sponsorship: { id: snap.id, ...snap.data() } }, "Sponsorship loaded.");
}

export async function PATCH(request: Request, { params }: { params: Promise<{ sponsorshipId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const permission = requireSponsorPermission(context, "sponsorship.manage");
  if (permission) return permission;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const action = cleanText(body.action).toLowerCase();
  if (!["request_cancellation", "report_issue", "confirm_completion"].includes(action)) return validationError({ action: "Choose an available sponsorship action." });
  const { sponsorshipId } = await params;
  try {
    let updated: Record<string, unknown> | null = null;
    await context.db.runTransaction(async (transaction) => {
      const ref = context.db.collection("sponsorships").doc(sponsorshipId);
      const snap = await transaction.get(ref);
      const sponsorship = snap.data() ?? {};
      if (!snap.exists || sponsorship.sponsorId !== context.sponsorId) throw new Error("NOT_FOUND");
      const expectedVersion = Number(body.expectedVersion ?? sponsorship.version ?? 1);
      if (Number(sponsorship.version ?? 1) !== expectedVersion) throw new Error("VERSION_CONFLICT");
      const now = isoNow();
      const next: Record<string, unknown> = { updatedAt: now, updatedBy: context.user.uid, version: expectedVersion + 1 };
      if (action === "report_issue") {
        const category = cleanText(body.category).toLowerCase();
        const explanation = cleanText(body.explanation).slice(0, 2000);
        if (!issueCategories.has(category) || explanation.length < 10) throw new Error("ISSUE_DETAILS_REQUIRED");
        const reviewDeadline = Date.parse(String(sponsorship.completionReviewEndsAt ?? ""));
        if (Number.isFinite(reviewDeadline) && Date.now() > reviewDeadline) throw new Error("DISPUTE_WINDOW_CLOSED");
        const disputeRef = context.db.collection("sponsorDisputes").doc(`${sponsorshipId}_${expectedVersion + 1}`);
        transaction.create(disputeRef, { id: disputeRef.id, sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, sponsorshipId, category, explanation, status: "open", adminReviewRequired: true, externalRefundExecuted: false, externalPayoutExecuted: false, createdAt: now, createdBy: context.user.uid });
        Object.assign(next, { status: "disputed", disputeId: disputeRef.id, completionPausedAt: now });
      } else if (action === "confirm_completion") {
        if (String(sponsorship.status) !== "completion_review") throw new Error("ACTION_NOT_ALLOWED");
        Object.assign(next, { status: "completed", completedAt: now, completionConfirmedBy: context.user.uid });
      } else {
        if (["completed", "cancelled", "disputed"].includes(String(sponsorship.status))) throw new Error("ACTION_NOT_ALLOWED");
        const activated = Boolean(sponsorship.activatedAt) || ["active", "live", "completion_review"].includes(String(sponsorship.status));
        if (activated) {
          const requestRef = context.db.collection("sponsorCancellationRequests").doc(`${sponsorshipId}_${expectedVersion + 1}`);
          const reason = cleanText(body.reason).slice(0, 1600);
          if (reason.length < 10) throw new Error("CANCELLATION_REASON_REQUIRED");
          transaction.create(requestRef, { id: requestRef.id, sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, sponsorshipId, reason, status: "pending_admin_review", refundStatus: "pending_review", createdAt: now, createdBy: context.user.uid });
          Object.assign(next, { status: "cancellation_requested", cancellationRequestId: requestRef.id, refundStatus: "pending_review", automaticRefundExecuted: false });
        } else {
          const amountCents = Number(sponsorship.amountCents ?? 0);
          const walletRef = context.db.collection("sponsorWallets").doc(context.sponsorId);
          const walletSnap = await transaction.get(walletRef);
          const wallet = walletSnap.data() ?? {};
          if (Number(wallet.reservedFundsCents ?? 0) < amountCents) throw new Error("REFUND_REVIEW_REQUIRED");
          const challengeId = cleanText(sponsorship.linkedChallengeId).slice(0, 120);
          const occupancyRef = challengeId ? context.db.collection("sponsorChallengeOccupancy").doc(challengeId) : null;
          const occupancySnap = occupancyRef ? await transaction.get(occupancyRef) : null;
          transaction.set(walletRef, { availableBalanceCents: Number(wallet.availableBalanceCents ?? 0) + amountCents, reservedFundsCents: Number(wallet.reservedFundsCents ?? 0) - amountCents, refundedFundsCents: Number(wallet.refundedFundsCents ?? 0) + amountCents, updatedAt: now }, { merge: true });
          transaction.create(context.db.collection("sponsorWalletTransactions").doc(`${sponsorshipId}_cancel_refund`), { id: `${sponsorshipId}_cancel_refund`, sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, relatedSponsorshipId: sponsorshipId, type: "sponsorship_cancellation_refund", direction: "release", amountCents, currency: sponsorship.currency ?? "USD", status: "refunded_to_sponsor_wallet", externalRefundExecuted: false, createdAt: now, createdBy: context.user.uid });
          if (occupancyRef) {
            transaction.set(occupancyRef, { ...releaseSponsorCapacity({ sponsorId: context.sponsorId, occupancy: occupancySnap?.data(), terms: normalizeSponsorCapacityTerms({ sponsorRole: sponsorship.sponsorRole, sponsorCategory: sponsorship.sponsorCategory, categoryExclusive: sponsorship.categoryExclusive, requestedPlacements: (sponsorship.visibility as Record<string, unknown> | undefined)?.requestedPlacements }) }), updatedAt: now }, { merge: true });
          }
          Object.assign(next, { status: "cancelled", cancelledAt: now, refundStatus: "refunded_to_sponsor_wallet", refundedAmountCents: amountCents, externalRefundExecuted: false });
        }
      }
      transaction.update(ref, next);
      transaction.create(context.db.collection("sponsorFinancialAuditLogs").doc(`${sponsorshipId}_${action}_${expectedVersion + 1}`), { id: `${sponsorshipId}_${action}_${expectedVersion + 1}`, sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, relatedSponsorshipId: sponsorshipId, action: `sponsorship_${action}`, status: next.status ?? sponsorship.status, externalRefundExecuted: false, externalPayoutExecuted: false, createdAt: now, createdBy: context.user.uid });
      updated = { id: sponsorshipId, ...sponsorship, ...next };
    });
    return ok({ sponsorship: updated }, action === "request_cancellation" ? "Cancellation status updated." : action === "report_issue" ? "Issue reported for review." : "Sponsorship completion confirmed.");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Sponsorship not found.", 404, undefined, "NOT_FOUND");
    if (error instanceof Error && error.message === "VERSION_CONFLICT") return fail("This sponsorship changed. Refresh before continuing.", 409, undefined, "SPONSORSHIP_VERSION_CONFLICT");
    if (error instanceof Error && error.message === "ISSUE_DETAILS_REQUIRED") return validationError({ issue: "Choose an issue category and add at least 10 characters of detail." });
    if (error instanceof Error && error.message === "CANCELLATION_REASON_REQUIRED") return validationError({ reason: "Explain the cancellation request in at least 10 characters." });
    if (error instanceof Error && error.message === "DISPUTE_WINDOW_CLOSED") return fail("The ordinary completion issue window has closed. Contact Support for a financial concern.", 422, undefined, "DISPUTE_WINDOW_CLOSED");
    if (error instanceof Error && error.message === "REFUND_REVIEW_REQUIRED") return fail("This cancellation needs finance review before reserved funds can change.", 409, undefined, "REFUND_REVIEW_REQUIRED");
    if (error instanceof Error && error.message === "ACTION_NOT_ALLOWED") return fail("This action is not available in the current sponsorship state.", 422, undefined, "SPONSORSHIP_ACTION_NOT_ALLOWED");
    console.error("[sponsor-sponsorship:patch]", { userId: context.user.uid, sponsorshipId, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsorship could not be updated.");
  }
}
