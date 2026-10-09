import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe";
import { writeAuditLog } from "@/lib/server/audit";
import { requireAdminPermission, requireRecentAdminAuthentication } from "@/lib/server/auth";
import { conflict, fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { claimEnterpriseRefundLock, finalizeEnterprisePaidVoteRefund, finalizeEnterprisePrizeFundingRefund, releaseEnterpriseRefundLock } from "@/lib/server/enterprise-prize-exposure";
import { applySponsorAgreementRefundState } from "@/lib/server/monetization-payments";

const PAYMENT_COLLECTIONS = ["challengeEntryPayments", "paidVotePurchases", "sponsorContributions", "creatorPrizeFundingPayments", "predictionPayments", "doroCoinPurchases"] as const;
const createSchema = z.object({ paymentCollection: z.enum(PAYMENT_COLLECTIONS), paymentId: z.string().min(1).max(180), reason: z.string().trim().min(8).max(1000) });
const executeSchema = z.object({ refundCaseId: z.string().min(1), action: z.enum(["approve", "reject", "execute"]), reason: z.string().trim().min(8).max(1000) });

export async function GET(request: Request) { const { response } = await requireAdminPermission(request, "refunds.request"); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Refunds"); const snap = await db.collection("refundCases").orderBy("createdAt", "desc").limit(200).get(); return ok({ refunds: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })), partialRefundsEnabled: false }); }

export async function POST(request: Request) {
  const { user, response } = await requireAdminPermission(request, "refunds.request"); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Refunds"); const body = await readJson(request); if (body.response) return body.response; const parsed = createSchema.safeParse(body.body); if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Invalid refund case." });
  try { const paymentRef = db.collection(parsed.data.paymentCollection).doc(parsed.data.paymentId); const payment = await paymentRef.get(); if (!payment.exists) return fail("Payment record not found.", 404); const data = payment.data() ?? {}; if (!["paid", "confirmed", "succeeded"].includes(String(data.status ?? data.paymentStatus))) return conflict("Only provider-confirmed payments can be refunded."); const id = `refund_${parsed.data.paymentCollection}_${parsed.data.paymentId}`; const ref = db.collection("refundCases").doc(id); const existing = await ref.get(); if (existing.exists) return ok({ id, ...existing.data() }, "Existing refund case returned."); const amountCents = Number(data.amountCents ?? data.grossAmountCents ?? data.amountMinor ?? 0); const organizationOwnerId = typeof data.organizationOwnerId === "string" ? data.organizationOwnerId : null; const challengeId = typeof data.challengeId === "string" ? data.challengeId : null; const now = new Date().toISOString(); const record = { id, paymentCollection: parsed.data.paymentCollection, paymentId: parsed.data.paymentId, userId: data.userId ?? null, organizationOwnerId, challengeId, financialOwnerType: organizationOwnerId ? "organization" : "user", amountCents, fullRefundAmountCents: amountCents, currency: data.currency ?? "USD", provider: data.provider ?? "stripe", providerPaymentIntentId: data.stripePaymentIntentId ?? data.paymentIntentId ?? null, status: "pending_review", reason: parsed.data.reason, partialRefundsEnabled: false, createdBy: user!.uid, createdAt: now, updatedAt: now }; await ref.create(record); await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: "refund.case_created", targetType: "refund", targetId: id, reason: parsed.data.reason, after: record }, db); return ok(record, "Full refund case created for review."); } catch (error) { return serverError("Refund case could not be created.", error instanceof Error ? error.message : error); }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireRecentAdminAuthentication(request, "refunds.approve"); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Refunds"); const body = await readJson(request); if (body.response) return body.response; const parsed = executeSchema.safeParse(body.body); if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Invalid refund decision." });
  try { const ref = db.collection("refundCases").doc(parsed.data.refundCaseId); const snap = await ref.get(); if (!snap.exists) return fail("Refund case not found.", 404); const record = snap.data() ?? {}; if (String(record.status) === "rejected") return ok({ id: ref.id, ...record }, "Existing refund outcome returned."); const now = new Date().toISOString(); if (String(record.status) === "succeeded") {
      if (parsed.data.action === "execute") {
        const cashLedgerRef = db.collection("cashLedger").doc(`refund_${ref.id}`);
        await db.runTransaction(async (transaction) => {
          const [latestRefund, latestCashLedger] = await Promise.all([transaction.get(ref), transaction.get(cashLedgerRef)]);
          if (latestRefund.data()?.status !== "succeeded" || latestCashLedger.data()?.status === "posted") return;
          transaction.set(cashLedgerRef, { id: `refund_${ref.id}`, transactionType: "refund", sourceType: "refund", sourceId: ref.id, amountCents: Number(record.amountCents ?? 0), currency: record.currency ?? "USD", direction: "debit", status: "posted", immutable: true, providerReference: record.providerRefundId ?? null, idempotencyKey: `refund_${ref.id}`, organizationOwnerId: record.organizationOwnerId ?? null, challengeId: record.challengeId ?? null, financialOwnerType: record.financialOwnerType ?? (record.organizationOwnerId ? "organization" : "user"), createdAt: record.executedAt ?? now, updatedAt: now }, { merge: true });
        });
      }
      return ok({ id: ref.id, ...record, idempotent: true }, "Existing refund outcome returned.");
    } if (parsed.data.action !== "execute") { const status = parsed.data.action === "approve" ? "approved" : "rejected"; await ref.set({ status, reviewedBy: user!.uid, reviewedAt: now, reviewReason: parsed.data.reason, updatedAt: now }, { merge: true }); await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: `refund.${status}`, targetType: "refund", targetId: ref.id, reason: parsed.data.reason }, db); return ok({ id: ref.id, status }, `Refund ${status}.`); }
    if (!["approved", "processing"].includes(String(record.status))) return conflict("Refund must be approved before provider execution."); const permission = await requireRecentAdminAuthentication(request, "refunds.execute"); if (permission.response) return permission.response;
    const enterpriseFundingCollection = record.paymentCollection === "sponsorContributions" || record.paymentCollection === "creatorPrizeFundingPayments" || record.paymentCollection === "challengeEntryPayments";
    const enterprisePaidVoteCollection = record.paymentCollection === "paidVotePurchases";
    const enterpriseRefundCollection = enterpriseFundingCollection || enterprisePaidVoteCollection;
    if (enterpriseRefundCollection) {
      const source = await db.collection(record.paymentCollection).doc(String(record.paymentId)).get();
      const sourceData = source.data() ?? {};
      if (sourceData.organizationOwnerId && sourceData.challengeId) {
        const lock = await db.collection("enterpriseChallengeFinanceLocks").doc(String(sourceData.challengeId)).get();
        if (lock.data()?.status === "settlement_prepared" || lock.data()?.status === "settled") return conflict("Enterprise challenge funds cannot be refunded after settlement preparation; resolve the organization finance case manually.");
      }
    }
    const stripe = getStripe(); if (!stripe) return fail("Stripe refund provider is not connected.", 503, undefined, "PROVIDER_NOT_CONFIGURED"); const paymentIntent = String(record.providerPaymentIntentId ?? ""); if (!paymentIntent) return conflict("Confirmed provider payment reference is missing.");
    let enterpriseRefundClaim: { challengeId: string; organizationOwnerId: string; idempotent: boolean } | null = null;
    if (enterpriseRefundCollection) {
      const source = await db.collection(record.paymentCollection).doc(String(record.paymentId)).get();
      const sourceData = source.data() ?? {};
      if (sourceData.organizationOwnerId && sourceData.challengeId) enterpriseRefundClaim = await claimEnterpriseRefundLock(db, {
        refundCaseId: ref.id,
        paymentCollection: record.paymentCollection as "creatorPrizeFundingPayments" | "sponsorContributions" | "challengeEntryPayments" | "paidVotePurchases",
        paymentId: String(record.paymentId),
        now,
      });
    }
    let result: Awaited<ReturnType<typeof stripe.refunds.create>>;
    try {
      result = await stripe.refunds.create({ payment_intent: paymentIntent, reason: "requested_by_customer", metadata: { refundCaseId: ref.id, adminReason: parsed.data.reason.slice(0, 450) } }, { idempotencyKey: `challenge-suite-refund-${ref.id}` });
    } catch (error) {
      if (enterpriseRefundClaim) await releaseEnterpriseRefundLock(db, { refundCaseId: ref.id, challengeId: enterpriseRefundClaim.challengeId, refundStatus: "approved", providerStatus: "provider_call_failed", now });
      throw error;
    }
    const status = result.status === "succeeded" ? "succeeded" : ["failed", "canceled"].includes(String(result.status)) ? "failed" : "processing";
    if (status === "failed" && enterpriseRefundClaim) await releaseEnterpriseRefundLock(db, { refundCaseId: ref.id, challengeId: enterpriseRefundClaim.challengeId, refundStatus: "failed", providerStatus: result.status ?? undefined, now });
    if (status === "succeeded" && enterpriseRefundCollection) {
      const source = await db.collection(record.paymentCollection).doc(String(record.paymentId)).get();
      if (source.data()?.organizationOwnerId && source.data()?.challengeId) {
        if (enterprisePaidVoteCollection) await finalizeEnterprisePaidVoteRefund(db, { refundCaseId: ref.id, paymentId: String(record.paymentId), providerRefundId: result.id, now });
        else await finalizeEnterprisePrizeFundingRefund(db, { refundCaseId: ref.id, paymentCollection: record.paymentCollection as "creatorPrizeFundingPayments" | "sponsorContributions" | "challengeEntryPayments", paymentId: String(record.paymentId), providerRefundId: result.id, now });
      }
    }
    if (status === "succeeded" && record.paymentCollection === "sponsorContributions") {
      await applySponsorAgreementRefundState(db, { contributionId: String(record.paymentId), refundCaseId: ref.id, amountCents: Number(record.amountCents ?? 0), now });
    }
    await db.runTransaction(async (transaction) => {
      const cashLedgerRef = db.collection("cashLedger").doc(`refund_${ref.id}`);
      const [latestRefund, latestCashLedger] = await Promise.all([transaction.get(ref), transaction.get(cashLedgerRef)]);
      if (latestRefund.data()?.status === "succeeded" || latestCashLedger.data()?.status === "posted") return;
      transaction.set(ref, { status, providerRefundId: result.id, providerStatus: result.status, executedBy: user!.uid, executedAt: now, updatedAt: now }, { merge: true });
      transaction.set(cashLedgerRef, { id: `refund_${ref.id}`, transactionType: "refund", sourceType: "refund", sourceId: ref.id, amountCents: Number(record.amountCents ?? 0), currency: record.currency ?? "USD", direction: "debit", status: status === "succeeded" ? "posted" : status === "failed" ? "failed" : "pending", immutable: true, providerReference: result.id, idempotencyKey: `refund_${ref.id}`, organizationOwnerId: record.organizationOwnerId ?? null, challengeId: record.challengeId ?? null, financialOwnerType: record.financialOwnerType ?? (record.organizationOwnerId ? "organization" : "user"), createdAt: now, updatedAt: now }, { merge: true });
    });
    await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: "refund.provider_executed", targetType: "refund", targetId: ref.id, reason: parsed.data.reason, metadata: { providerRefundId: result.id, providerStatus: result.status } }, db); return ok({ id: ref.id, status, providerRefundId: result.id }, "Provider refund submitted.");
  } catch (error) { return serverError("Refund action failed.", error instanceof Error ? error.message : error); }
}
