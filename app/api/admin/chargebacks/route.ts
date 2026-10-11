import { z } from "zod";
import { createHash } from "node:crypto";
import { FieldPath } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe";
import { createAuditLogRecord, writeAuditLog } from "@/lib/server/audit";
import { requireAdminPermission, requireRecentAdminAuthentication } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

const schema = z.object({ disputeId: z.string().min(1), chargebackCaseId: z.string().min(1), reason: z.string().trim().min(8).max(1000), evidence: z.object({ customerName: z.string().trim().min(2).max(120), customerEmail: z.string().trim().email(), productDescription: z.string().trim().min(10).max(500), customerCommunication: z.string().trim().min(1).max(10000).optional() }) });
const reconciliationSchema = z.object({ caseId: z.string().trim().min(1).max(180), action: z.enum(["release_won", "acknowledge_loss"]), reason: z.string().trim().min(10).max(1200), confirmed: z.literal(true) });
export async function GET(request: Request) {
  const { response } = await requireAdminPermission(request, "chargebacks.review");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Chargebacks");
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor")?.trim() ?? "";
  const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100 || cursor.length > 180) {
    return validationError({ request: "Use a valid chargeback cursor and a page size between 1 and 100." });
  }
  try {
    let query = db.collection("chargebackCases")
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    if (cursor) {
      const cursorSnap = await db.collection("chargebackCases").doc(cursor).get();
      if (!cursorSnap.exists || cursorSnap.data()?.createdAt == null) {
        return validationError({ cursor: "The chargeback page cursor is invalid or expired." });
      }
      query = query.startAfter(cursorSnap);
    }
    const snap = await query.limit(requestedLimit + 1).get();
    const hasMore = snap.docs.length > requestedLimit;
    const docs = snap.docs.slice(0, requestedLimit);
    return ok({
      chargebacks: docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      hasMore,
      nextCursor: hasMore ? docs.at(-1)?.id ?? null : null
    });
  } catch (error) {
    return serverError("Chargebacks could not be loaded.", error instanceof Error ? error.message : error);
  }
}
export async function POST(request: Request) { const { user, response } = await requireRecentAdminAuthentication(request, "chargebacks.submitProvider"); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Chargebacks"); const body = await readJson(request); if (body.response) return body.response; const parsed = schema.safeParse(body.body); if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Complete the required dispute evidence." }); const stripe = getStripe(); if (!stripe) return fail("Stripe dispute provider is not connected.", 503, undefined, "PROVIDER_NOT_CONFIGURED"); try { const ref = db.collection("chargebackCases").doc(parsed.data.chargebackCaseId); const snap = await ref.get(); if (!snap.exists) return fail("Chargeback case not found.", 404); if (snap.data()?.providerSubmissionId) return ok({ id: ref.id, providerSubmissionId: snap.data()?.providerSubmissionId }, "Existing provider submission returned."); const result = await stripe.disputes.update(parsed.data.disputeId, { evidence: { customer_name: parsed.data.evidence.customerName, customer_email_address: parsed.data.evidence.customerEmail, product_description: parsed.data.evidence.productDescription, customer_communication: parsed.data.evidence.customerCommunication }, submit: true }, { idempotencyKey: `challenge-suite-dispute-${ref.id}` }); const now = new Date().toISOString(); await ref.set({ status: "provider_submitted", providerSubmissionId: result.id, providerStatus: result.status, submittedBy: user!.uid, submittedAt: now, reason: parsed.data.reason, exposedFundsFrozen: true, updatedAt: now }, { merge: true }); await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: "chargeback.provider_submitted", targetType: "dispute", targetId: ref.id, reason: parsed.data.reason, metadata: { providerDisputeId: result.id } }, db); return ok({ id: ref.id, providerSubmissionId: result.id, status: result.status }, "Chargeback evidence submitted to provider."); } catch (error) { return serverError("Chargeback evidence could not be submitted.", error instanceof Error ? error.message : error); } }

export async function PATCH(request: Request) {
  const { user, response } = await requireRecentAdminAuthentication(request, "disputes.decide");
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Chargeback reconciliation");
  const parsedBody = await readJson(request);
  if (parsedBody.response) return parsedBody.response;
  const parsed = reconciliationSchema.safeParse(parsedBody.body);
  if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Confirm the reconciliation and provide a reason." });
  const stripe = getStripe();
  if (!stripe) return fail("Stripe dispute provider is not connected.", 503, undefined, "PROVIDER_NOT_CONFIGURED");
  const { caseId, action, reason } = parsed.data;
  const caseRef = db.collection("chargebackCases").doc(caseId);
  try {
    const caseSnap = await caseRef.get();
    const chargeback = caseSnap.data() ?? {};
    if (!caseSnap.exists || chargeback.provider !== "stripe" || !chargeback.stripeDisputeId) return fail("Verified Stripe dispute case not found.", 404, undefined, "DISPUTE_CASE_NOT_FOUND");
    const providerDispute = await stripe.disputes.retrieve(String(chargeback.stripeDisputeId));
    const providerStatus = String(providerDispute.status ?? "");
    if (action === "release_won" && providerStatus !== "won") return fail("Funds can be released only after Stripe confirms the dispute was won.", 409, undefined, "DISPUTE_NOT_WON");
    if (action === "acknowledge_loss" && providerStatus !== "lost") return fail("A loss can be acknowledged only after Stripe confirms the dispute was lost.", 409, undefined, "DISPUTE_NOT_LOST");
    const disputeRef = db.collection("stripeSponsorDisputes").doc(String(chargeback.stripeDisputeId));
    const contributionRef = chargeback.contributionId ? db.collection("sponsorContributions").doc(String(chargeback.contributionId)) : null;
    if (!contributionRef || chargeback.linkStatus !== "verified") return fail("This dispute's funding relationship is unverified and remains restricted for manual investigation.", 409, undefined, "DISPUTE_LINK_UNVERIFIED");
    const requestIdempotencyKey = request.headers.get("idempotency-key")?.trim() || `${caseId}:${action}:${user!.uid}`;
    const auditId = `stripe_dispute_reconcile_${createHash("sha256").update(`${caseId}:${action}`).digest("hex")}`;
    const auditRef = db.collection("auditLogs").doc(auditId);
    const now = new Date().toISOString();
    let duplicate = false;
    let released = false;
    let restrictionRemains = true;
    await db.runTransaction(async (transaction) => {
      const [currentCaseSnap, currentDisputeSnap, contributionSnap, auditSnap] = await Promise.all([
        transaction.get(caseRef), transaction.get(disputeRef), transaction.get(contributionRef), transaction.get(auditRef)
      ]);
      if (!currentCaseSnap.exists || !currentDisputeSnap.exists || !contributionSnap?.exists) throw new Error("DISPUTE_RECORD_CHANGED");
      if (auditSnap.exists) { duplicate = true; return; }
      const currentCase = currentCaseSnap.data() ?? {};
      const currentDispute = currentDisputeSnap.data() ?? {};
      const contribution = contributionSnap.data() ?? {};
      const providerPaymentIntentId = typeof providerDispute.payment_intent === "string" ? providerDispute.payment_intent : providerDispute.payment_intent?.id ?? "";
      const providerChargeId = typeof providerDispute.charge === "string" ? providerDispute.charge : providerDispute.charge?.id ?? "";
      if (currentCase.stripeDisputeId !== providerDispute.id || currentCase.paymentIntentId !== chargeback.paymentIntentId
        || currentCase.chargeId !== providerChargeId || Number(currentCase.amountCents) !== Number(providerDispute.amount)
        || currentDispute.paymentIntentId !== providerPaymentIntentId || providerPaymentIntentId !== chargeback.paymentIntentId
        || currentCase.providerOutcome !== providerStatus && currentDispute.providerOutcome !== providerStatus) {
        throw new Error("DISPUTE_PROVIDER_STATE_MISMATCH");
      }
      const before = { caseStatus: currentCase.adminReconciliationStatus ?? "required", contributionRestricted: contribution.stripeDisputeRestricted === true, providerOutcome: currentDispute.providerOutcome ?? null };
      if (action === "acknowledge_loss") {
        transaction.set(caseRef, { adminReconciliationStatus: "loss_acknowledged_hold_remains", adminReason: reason, reconciledBy: user!.uid, reconciledAt: now, restrictionActive: true, updatedAt: now }, { merge: true });
        transaction.set(disputeRef, { adminReconciliationStatus: "loss_acknowledged_hold_remains", adminReason: reason, reconciledBy: user!.uid, reconciledAt: now, restrictionActive: true, updatedAt: now }, { merge: true });
      } else {
        const [otherCasesSnap, pendingRefundsSnap, settlementSnap] = await Promise.all([
          transaction.get(db.collection("chargebackCases").where("contributionId", "==", contributionSnap.id).limit(50)),
          transaction.get(db.collection("refundCases").where("paymentCollection", "==", "sponsorContributions").where("paymentId", "==", contributionSnap.id).limit(20)),
          transaction.get(db.collection("challengeSettlements").where("challengeId", "==", String(contribution.challengeId)).limit(5))
        ]);
        const refundBlocksRelease = pendingRefundsSnap.docs.some((doc) => ["pending_review", "processing", "requested", "approved", "provider_pending"].includes(String(doc.data().status)));
        const otherDisputeBlocksRelease = otherCasesSnap.docs.some((doc) => doc.id !== caseId && doc.data().restrictionActive === true);
        if (refundBlocksRelease || otherDisputeBlocksRelease || contribution.status !== "confirmed") throw new Error("OTHER_FINANCIAL_RESTRICTION");
        const settlements = settlementSnap.docs;
        const otherRestrictedContributionsSnap = await transaction.get(db.collection("sponsorContributions")
          .where("challengeId", "==", String(contribution.challengeId)).where("stripeDisputeRestricted", "==", true).limit(100));
        const remainingRestricted = otherRestrictedContributionsSnap.docs.some((doc) => doc.id !== contributionSnap.id);
        const ledgerSnaps = await Promise.all(settlements.map((settlement) => transaction.get(db.collection("cashLedger").where("settlementId", "==", settlement.id).limit(250))));
        transaction.set(contributionRef, { stripeDisputeRestricted: remainingRestricted, stripeDisputeReviewRequired: remainingRestricted, disputeReconciledAt: now, disputeReconciledBy: user!.uid, updatedAt: now }, { merge: true });
        transaction.set(caseRef, { adminReconciliationStatus: "released_after_verified_provider_win", adminReason: reason, reconciledBy: user!.uid, reconciledAt: now, restrictionActive: false, updatedAt: now }, { merge: true });
        transaction.set(disputeRef, { adminReconciliationStatus: "released_after_verified_provider_win", adminReason: reason, reconciledBy: user!.uid, reconciledAt: now, restrictionActive: false, updatedAt: now }, { merge: true });
        settlements.forEach((settlement, index) => {
          const data = settlement.data() ?? {};
          const ids = Array.isArray(data.disputedSponsorContributionIds) ? data.disputedSponsorContributionIds.filter((id: unknown) => id !== contributionSnap.id) : [];
          transaction.set(settlement.ref, { disputedSponsorContributionIds: ids, disputeRestricted: remainingRestricted, disputeReviewRequired: remainingRestricted, status: remainingRestricted ? data.status : data.status === "disputed_pending_admin_reconciliation" ? data.statusBeforeDispute ?? "created_pending_review" : data.status, updatedAt: now }, { merge: true });
          if (!remainingRestricted) for (const ledger of ledgerSnaps[index]?.docs ?? []) {
            const item = ledger.data();
            if (item.disputeId === providerDispute.id && item.paid !== true && item.status !== "paid_out" && item.externalPayoutExecuted !== true) transaction.set(ledger.ref, { disputeRestricted: false, disputeReviewRequired: false, disputeReconciledAt: now, updatedAt: now }, { merge: true });
          }
        });
        released = !remainingRestricted;
        restrictionRemains = remainingRestricted;
      }
      transaction.create(auditRef, createAuditLogRecord({ actorId: user!.uid, actorType: "admin", action: `stripe_sponsor_dispute.${action}`, targetType: "dispute", targetId: providerDispute.id, reason, before, after: { providerOutcome: providerStatus, released, restrictionRemains, completedPayoutsReversed: false, automaticDebitExecuted: false }, metadata: { caseId, contributionId: contributionSnap.id, challengeId: contribution.challengeId, amountCents: currentCase.amountCents, currency: currentCase.currency, chargeId: currentCase.chargeId, paymentIntentId: currentCase.paymentIntentId, requestIdempotencyKey } }, auditId, now));
    });
    return ok({ caseId, action, duplicate, released, restrictionRemains, completedPayoutsReversed: false, automaticDebitExecuted: false }, duplicate ? "This reconciliation was already recorded." : "Stripe dispute reconciliation recorded.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "OTHER_FINANCIAL_RESTRICTION") return fail("Other refund or dispute restrictions remain. This contribution is still held.", 409, undefined, code);
    if (code === "DISPUTE_PROVIDER_STATE_MISMATCH" || code === "DISPUTE_RECORD_CHANGED") return fail("Provider or internal dispute state changed. Refresh the case before reconciling.", 409, undefined, code);
    return serverError("Dispute reconciliation could not be recorded.", error instanceof Error ? error.message : error);
  }
}
