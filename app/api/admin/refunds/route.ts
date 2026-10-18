import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe";
import { writeAuditLog } from "@/lib/server/audit";
import { requireAdminPermission, requireRecentAdminAuthentication } from "@/lib/server/auth";
import { conflict, fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { claimEnterpriseRefundLock, finalizeEnterprisePaidVoteRefund, finalizeEnterprisePrizeFundingRefund, releaseEnterpriseRefundLock } from "@/lib/server/enterprise-prize-exposure";
import { applySponsorAgreementRefundState } from "@/lib/server/monetization-payments";
import { initiateTournamentEntryRefund } from "@/lib/server/tournament-paid-entry";
import { reconcileNormalRefund } from "@/lib/server/normal-refunds";
import {executeLiveEventRefund} from "@/lib/server/live-event-refunds";
import {returnLiveEventUnfulfilledPayment} from "@/lib/server/live-event-unfulfilled-refunds";
import {isLiveEventV2} from "@/lib/server/live-event-sponsor-cutoff";

function liveEventRefundCase(record:Record<string,unknown>){return record.paymentCollection==="liveEventBookings"||String(record.type??"").startsWith("live_event_")||record.liveEventFinancialPolicyVersion===1;}

async function handleLiveEventRefund(request:Request,db:NonNullable<ReturnType<typeof getAdminDb>>,record:Record<string,unknown>,input:z.infer<typeof executeSchema>,actorId:string){
  const eligibleTicket=!(record.type!=="live_event_ticket_refund"||record.automaticPolicyEligible!==true);
  const unfulfilled=record.type==="live_event_booking_reconciliation";
  if(input.action!=="execute"||record.paymentCollection!=="liveEventBookings"||!eligibleTicket&&!unfulfilled)return conflict("This Live Event case requires policy and financial reconciliation. Generic status changes and unverified full-charge refunds are unavailable.",{code:"LIVE_EVENT_FINANCIAL_REVIEW_REQUIRED"});
  if(input.confirmed!==true)return fail("Explicitly confirm the original-payment return after reviewing its evidence.",422);
  const permission=await requireRecentAdminAuthentication(request,"refunds.execute");if(permission.response)return permission.response;
  if(process.env.LIVE_EVENT_AUTOMATIC_REFUNDS_ENABLED!=="true")return fail("Live Event refund execution is not enabled. The case and its reserved liability remain preserved.",503,undefined,"LIVE_EVENT_REFUND_EXECUTION_DISABLED");
  const stripe=getStripe();if(!stripe)return fail("The refund provider is unavailable. No refund has been confirmed.",503);
  await writeAuditLog({actorId,actorType:"admin",action:"live_event.refund_execution_requested",targetType:"refund",targetId:input.refundCaseId,reason:input.reason,before:{status:record.status},metadata:{eventId:record.eventId,paymentId:record.paymentId,amountCents:record.amountCents}},db);
  try{
    if(unfulfilled)await returnLiveEventUnfulfilledPayment(db,stripe,{caseId:input.refundCaseId,adminId:actorId,reason:input.reason,confirmed:true});
    else await executeLiveEventRefund(db,stripe,input.refundCaseId);
  }catch{return conflict("The original payment or its financial restrictions require reconciliation. Refresh the evidence before retrying; no completed return is assumed.");}
  const latest=(await db.collection("refundCases").doc(input.refundCaseId).get()).data()??{};
  return ok({id:input.refundCaseId,status:latest.status,providerRefundId:latest.providerRefundId??null},latest.status==="refunded"?"The original-payment refund is provider-confirmed.":"The refund remains pending or under review. No completed return is assumed.");
}

const PAYMENT_COLLECTIONS = ["challengeEntryPayments", "paidVotePurchases", "sponsorContributions", "creatorPrizeFundingPayments", "predictionPayments", "doroCoinPurchases", "tournamentEntryPayments"] as const;
const createSchema = z.object({ paymentCollection: z.enum(PAYMENT_COLLECTIONS), paymentId: z.string().min(1).max(180), reason: z.string().trim().min(8).max(1000) });
const executeSchema = z.object({ refundCaseId: z.string().min(1), action: z.enum(["approve", "reject", "execute"]), reason: z.string().trim().min(8).max(1000),confirmed:z.boolean().optional() });

export async function GET(request: Request) { const { response } = await requireAdminPermission(request, "refunds.request"); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Refunds"); const snap = await db.collection("refundCases").orderBy("createdAt", "desc").limit(200).get(); const result=ok({ refunds: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),partialRefundsEnabled:false,liveEventRefundExecutionAvailable:process.env.LIVE_EVENT_AUTOMATIC_REFUNDS_ENABLED==="true"&&Boolean(getStripe()),hasMore:snap.size===200 });result.headers.set("Cache-Control","private, no-store");return result; }

export async function POST(request: Request) {
  const { user, response } = await requireAdminPermission(request, "refunds.request"); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Refunds"); const body = await readJson(request); if (body.response) return body.response; const parsed = createSchema.safeParse(body.body); if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Invalid refund case." });
  if (parsed.data.paymentCollection === "tournamentEntryPayments") {
    try {
      const result = await createTournamentEntryRefundCase(db, { paymentId: parsed.data.paymentId, reason: parsed.data.reason, actorId: user!.uid });
      if (result.existing) return ok(result.record, "Existing Tournament refund case returned.");
      await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: "refund.case_created", targetType: "refund", targetId: String(result.record.id), reason: parsed.data.reason, after: result.record }, db);
      return ok(result.record, "Full Tournament entry refund case created for review.");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (["TOURNAMENT_REFUND_NOT_FOUND", "TOURNAMENT_REFUND_NOT_ELIGIBLE", "TOURNAMENT_REFUND_CUTOFF_PASSED", "TOURNAMENT_REFUND_ADVANCED_ENTRANT", "TOURNAMENT_REFUND_CUTOFF_UNVERIFIED"].includes(code)) return conflict("This Tournament entry is not eligible for an ordinary refund under the Tournament cutoff policy.", { code });
      return serverError("Tournament refund case could not be created.", error instanceof Error ? error.message : error);
    }
  }
  try { const paymentRef = db.collection(parsed.data.paymentCollection).doc(parsed.data.paymentId); const payment = await paymentRef.get(); if (!payment.exists) return fail("Payment record not found.", 404); const data = payment.data() ?? {}; if (!["paid", "confirmed", "succeeded"].includes(String(data.status ?? data.paymentStatus))) return conflict("Only provider-confirmed payments can be refunded."); const id = `refund_${parsed.data.paymentCollection}_${parsed.data.paymentId}`; const ref = db.collection("refundCases").doc(id); const existing = await ref.get(); if (existing.exists) return ok({ id, ...existing.data() }, "Existing refund case returned."); const amountCents = Number(data.amountCents ?? data.grossAmountCents ?? data.amountMinor ?? 0); const organizationOwnerId = typeof data.organizationOwnerId === "string" ? data.organizationOwnerId : null; const challengeId = typeof data.challengeId === "string" ? data.challengeId : null; const sourceChallenge = challengeId ? await db.collection("challenges").doc(challengeId).get() : null; const now = new Date().toISOString(); const record = { id, ...(isLiveEventV2(sourceChallenge?.data()??{})?{eventId:challengeId,liveEventFinancialPolicyVersion:1}:{}), normalLifecyclePolicyVersion: sourceChallenge?.data()?.builderVersion === "normal_v3" && ["challengeEntryPayments", "sponsorContributions", "creatorPrizeFundingPayments"].includes(parsed.data.paymentCollection) ? 1 : null, paymentCollection: parsed.data.paymentCollection, paymentId: parsed.data.paymentId, userId: data.userId ?? null, organizationOwnerId, challengeId, financialOwnerType: organizationOwnerId ? "organization" : "user", amountCents, fullRefundAmountCents: amountCents, currency: data.currency ?? "USD", provider: data.provider ?? "stripe", providerPaymentIntentId: data.providerPaymentIntentId ?? data.stripePaymentIntentId ?? data.paymentIntentId ?? null, status: "pending_review", reason: parsed.data.reason, partialRefundsEnabled: false, createdBy: user!.uid, createdAt: now, updatedAt: now }; await ref.create(record); await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: "refund.case_created", targetType: "refund", targetId: id, reason: parsed.data.reason, after: record }, db); return ok(record, "Full refund case created for review."); } catch (error) { return serverError("Refund case could not be created.", error instanceof Error ? error.message : error); }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireRecentAdminAuthentication(request, "refunds.approve"); if (response) return response; const db = getAdminDb(); if (!db) return serverUnavailable("Refunds"); const body = await readJson(request); if (body.response) return body.response; const parsed = executeSchema.safeParse(body.body); if (!parsed.success) return validationError({ request: parsed.error.issues[0]?.message ?? "Invalid refund decision." });
  try { const ref = db.collection("refundCases").doc(parsed.data.refundCaseId); const snap = await ref.get(); if (!snap.exists) return fail("Refund case not found.", 404); const record = snap.data() ?? {}; if(liveEventRefundCase(record))return handleLiveEventRefund(request,db,record,parsed.data,user!.uid); if (String(record.status) === "rejected") return ok({ id: ref.id, ...record }, "Existing refund outcome returned."); const now = new Date().toISOString(); if (String(record.status) === "succeeded") {
      if (parsed.data.action === "execute") {
        const cashLedgerRef = db.collection("cashLedger").doc(`refund_${ref.id}`);
        await db.runTransaction(async (transaction) => {
          const [latestRefund, latestCashLedger] = await Promise.all([transaction.get(ref), transaction.get(cashLedgerRef)]);
          if (latestRefund.data()?.status !== "succeeded" || latestCashLedger.data()?.status === "posted") return;
          transaction.set(cashLedgerRef, { id: `refund_${ref.id}`, transactionType: "refund", sourceType: "refund", sourceId: ref.id, amountCents: Number(record.amountCents ?? 0), currency: record.currency ?? "USD", direction: "debit", status: "posted", immutable: true, providerReference: record.providerRefundId ?? null, idempotencyKey: `refund_${ref.id}`, organizationOwnerId: record.organizationOwnerId ?? null, challengeId: record.challengeId ?? null, financialOwnerType: record.financialOwnerType ?? (record.organizationOwnerId ? "organization" : "user"), createdAt: record.executedAt ?? now, updatedAt: now }, { merge: true });
        });
      }
      return ok({ id: ref.id, ...record, idempotent: true }, "Existing refund outcome returned.");
    } if (record.paymentCollection === "tournamentEntryPayments" && parsed.data.action === "approve") {
      try {
        const approval = await approveTournamentRefundBeforeCutoff(db, { refundCaseId: ref.id, actorId: user!.uid, reason: parsed.data.reason, now });
        await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: "refund.approved", targetType: "refund", targetId: ref.id, reason: parsed.data.reason, after: approval }, db);
        return ok({ id: ref.id, status: "approved", ...approval }, "Tournament refund approved before its voting cutoff.");
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        if (["TOURNAMENT_REFUND_CUTOFF_PASSED", "TOURNAMENT_REFUND_ADVANCED_ENTRANT", "TOURNAMENT_REFUND_CUTOFF_UNVERIFIED", "TOURNAMENT_REFUND_STATE_CHANGED"].includes(code)) return conflict("This Tournament refund can no longer be approved under the ordinary refund policy.", { code });
        throw error;
      }
    } if (parsed.data.action !== "execute") { const status = parsed.data.action === "approve" ? "approved" : "rejected"; await ref.set({ status, reviewedBy: user!.uid, reviewedAt: now, reviewReason: parsed.data.reason, updatedAt: now }, { merge: true }); await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: `refund.${status}`, targetType: "refund", targetId: ref.id, reason: parsed.data.reason }, db); return ok({ id: ref.id, status }, `Refund ${status}.`); }
    if (!["approved", "processing"].includes(String(record.status))) return conflict("Refund must be approved before provider execution."); const permission = await requireRecentAdminAuthentication(request, "refunds.execute"); if (permission.response) return permission.response;
    if (record.paymentCollection === "tournamentEntryPayments" && record.refundType === "ordinary_tournament_entry" && record.approvedBeforeCutoff !== true) return conflict("A Tournament refund must have been approved before the voting cutoff.");
    const enterpriseFundingCollection = record.paymentCollection === "sponsorContributions" || record.paymentCollection === "creatorPrizeFundingPayments" || record.paymentCollection === "challengeEntryPayments";
    const enterprisePaidVoteCollection = record.paymentCollection === "paidVotePurchases";
    const enterpriseRefundCollection = enterpriseFundingCollection || enterprisePaidVoteCollection;
    const paymentWasNeverCredited = record.financialCreditStatus === "never_credited";
    if (enterpriseRefundCollection && !paymentWasNeverCredited) {
      const source = await db.collection(record.paymentCollection).doc(String(record.paymentId)).get();
      const sourceData = source.data() ?? {};
      if (sourceData.organizationOwnerId && sourceData.challengeId) {
        const lock = await db.collection("enterpriseChallengeFinanceLocks").doc(String(sourceData.challengeId)).get();
        if (lock.data()?.status === "settlement_prepared" || lock.data()?.status === "settled") return conflict("Enterprise challenge funds cannot be refunded after settlement preparation; resolve the organization finance case manually.");
      }
    }
    const stripe = getStripe(); if (!stripe) return fail("Stripe refund provider is not connected.", 503, undefined, "PROVIDER_NOT_CONFIGURED"); const paymentIntent = String(record.providerPaymentIntentId ?? ""); if (!paymentIntent) return conflict("Confirmed provider payment reference is missing.");
    if (record.paymentCollection === "tournamentEntryPayments") {
      const tournamentRefund = await initiateTournamentEntryRefund(stripe, db, String(record.paymentId));
      await writeAuditLog({ actorId: user!.uid, actorType: "admin", action: "refund.provider_executed", targetType: "refund", targetId: ref.id, reason: parsed.data.reason, metadata: { providerRefundId: tournamentRefund.providerRefundId ?? null, providerStatus: tournamentRefund.status } }, db);
      return ok({ id: ref.id, ...tournamentRefund }, "Tournament entry refund submitted using the idempotent payment reversal workflow.");
    }
    let enterpriseRefundClaim: { challengeId: string; organizationOwnerId: string; idempotent: boolean } | null = null;
    if (enterpriseRefundCollection && !paymentWasNeverCredited) {
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
      result = await stripe.refunds.create({ payment_intent: paymentIntent, reason: "requested_by_customer", metadata: record.normalLifecyclePolicyVersion === 1 ? { refundCaseId: ref.id } : { refundCaseId: ref.id, adminReason: parsed.data.reason.slice(0, 450) } }, { idempotencyKey: `challenge-suite-refund-${ref.id}` });
    } catch (error) {
      if (enterpriseRefundClaim) await releaseEnterpriseRefundLock(db, { refundCaseId: ref.id, challengeId: enterpriseRefundClaim.challengeId, refundStatus: "approved", providerStatus: "provider_call_failed", now });
      throw error;
    }
    const status = result.status === "succeeded" ? "succeeded" : ["failed", "canceled"].includes(String(result.status)) ? "failed" : "processing";
    if (status === "failed" && enterpriseRefundClaim) await releaseEnterpriseRefundLock(db, { refundCaseId: ref.id, challengeId: enterpriseRefundClaim.challengeId, refundStatus: "failed", providerStatus: result.status ?? undefined, now });
    if (status === "succeeded" && record.normalLifecyclePolicyVersion === 1) await reconcileNormalRefund(db, { refundCaseId: ref.id, providerRefundId: result.id, paymentIntentId: typeof result.payment_intent === "string" ? result.payment_intent : result.payment_intent?.id ?? "", amountCents: result.amount, currency: result.currency, providerStatus: status });
    if (status === "succeeded" && enterpriseRefundCollection && !paymentWasNeverCredited) {
      const source = await db.collection(record.paymentCollection).doc(String(record.paymentId)).get();
      if (source.data()?.organizationOwnerId && source.data()?.challengeId) {
        if (enterprisePaidVoteCollection) await finalizeEnterprisePaidVoteRefund(db, { refundCaseId: ref.id, paymentId: String(record.paymentId), providerRefundId: result.id, now });
        else await finalizeEnterprisePrizeFundingRefund(db, { refundCaseId: ref.id, paymentCollection: record.paymentCollection as "creatorPrizeFundingPayments" | "sponsorContributions" | "challengeEntryPayments", paymentId: String(record.paymentId), providerRefundId: result.id, now });
      }
    }
    if (status === "succeeded" && record.paymentCollection === "sponsorContributions") {
      await applySponsorAgreementRefundState(db, { contributionId: String(record.paymentId), refundCaseId: ref.id, amountCents: Number(record.amountCents ?? 0), neverCredited: paymentWasNeverCredited, now });
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

function tournamentRefundCutoff(tournament: Record<string, unknown>, matches: FirebaseFirestore.QuerySnapshot) {
  const persisted = typeof tournament.firstVotingOpenedAt === "string" ? tournament.firstVotingOpenedAt : typeof tournament.tournamentVotingCutoffAt === "string" ? tournament.tournamentVotingCutoffAt : null;
  if (persisted && Number.isFinite(Date.parse(persisted))) return persisted;
  const openMatches = matches.docs.map((doc) => doc.data()).filter((match) => String(match.status) === "voting_open");
  if (!openMatches.length) return null;
  const evidence = openMatches.map((match) => String(match.votingOpenedAt ?? match.votingOpensAt ?? match.openedAt ?? "")).filter((value) => Number.isFinite(Date.parse(value))).sort()[0];
  return evidence || "unverified";
}

function tournamentEntrantAdvanced(entrantId: string, matches: FirebaseFirestore.QuerySnapshot) {
  return matches.docs.some((doc) => {
    const match = doc.data();
    return Number(match.roundNumber ?? 1) > 1 && (match.participantAId === entrantId || match.participantBId === entrantId);
  });
}

async function createTournamentEntryRefundCase(db: FirebaseFirestore.Firestore, input: { paymentId: string; reason: string; actorId: string }) {
  const paymentRef = db.collection("tournamentEntryPayments").doc(input.paymentId);
  const refundRef = db.collection("refundCases").doc(`refund_tournamentEntryPayments_${input.paymentId}`);
  const result = await db.runTransaction(async (transaction) => {
    const paymentSnap = await transaction.get(paymentRef);
    if (!paymentSnap.exists) throw new Error("TOURNAMENT_REFUND_NOT_FOUND");
    const payment = paymentSnap.data() ?? {};
    if (payment.status !== "confirmed" || payment.webhookConfirmed !== true || !payment.providerPaymentIntentId) throw new Error("TOURNAMENT_REFUND_NOT_ELIGIBLE");
    const [refundSnap, tournamentSnap, matchSnap] = await Promise.all([
      transaction.get(refundRef),
      transaction.get(db.collection("tournaments").doc(String(payment.tournamentId ?? ""))),
      transaction.get(db.collection("tournamentMatches").where("tournamentId", "==", String(payment.tournamentId ?? "")).limit(490))
    ]);
    if (refundSnap.exists) return { existing: true, record: { id: refundRef.id, ...refundSnap.data() } };
    if (!tournamentSnap.exists) throw new Error("TOURNAMENT_REFUND_NOT_FOUND");
    const cutoff = tournamentRefundCutoff(tournamentSnap.data() ?? {}, matchSnap);
    if (cutoff === "unverified") throw new Error("TOURNAMENT_REFUND_CUTOFF_UNVERIFIED");
    const now = new Date();
    if (cutoff && now.getTime() >= Date.parse(cutoff)) throw new Error("TOURNAMENT_REFUND_CUTOFF_PASSED");
    if (tournamentEntrantAdvanced(String(payment.entrantId ?? ""), matchSnap)) throw new Error("TOURNAMENT_REFUND_ADVANCED_ENTRANT");
    const amountCents = Number(payment.amountCents ?? 0);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("TOURNAMENT_REFUND_NOT_ELIGIBLE");
    const record = {
      id: refundRef.id, paymentCollection: "tournamentEntryPayments", paymentId: input.paymentId,
      tournamentId: payment.tournamentId, entrantType: payment.entrantType, entrantId: payment.entrantId,
      userId: payment.userId, provider: "stripe", providerPaymentIntentId: payment.providerPaymentIntentId,
      providerSessionId: payment.providerSessionId, amountCents, fullRefundAmountCents: amountCents,
      currency: payment.currency ?? "USD", status: "pending_review", refundType: "ordinary_tournament_entry",
      approvedBeforeCutoff: false, ordinaryRefundCutoffAt: cutoff, reason: input.reason,
      createdBy: input.actorId, createdAt: now.toISOString(), updatedAt: now.toISOString(), partialRefundsEnabled: false
    };
    transaction.create(refundRef, record);
    return { existing: false, record };
  });
  return result;
}

async function approveTournamentRefundBeforeCutoff(db: FirebaseFirestore.Firestore, input: { refundCaseId: string; actorId: string; reason: string; now: string }) {
  const refundRef = db.collection("refundCases").doc(input.refundCaseId);
  return db.runTransaction(async (transaction) => {
    const refundSnap = await transaction.get(refundRef);
    if (!refundSnap.exists || refundSnap.data()?.paymentCollection !== "tournamentEntryPayments") throw new Error("TOURNAMENT_REFUND_STATE_CHANGED");
    const refund = refundSnap.data() ?? {};
    if (refund.approvedBeforeCutoff === true && ["approved", "processing", "succeeded"].includes(String(refund.status))) return { idempotent: true, approvedBeforeCutoff: true };
    if (refund.status !== "pending_review") throw new Error("TOURNAMENT_REFUND_STATE_CHANGED");
    const paymentRef = db.collection("tournamentEntryPayments").doc(String(refund.paymentId ?? ""));
    const tournamentRef = db.collection("tournaments").doc(String(refund.tournamentId ?? ""));
    const [paymentSnap, tournamentSnap, matchesSnap] = await Promise.all([
      transaction.get(paymentRef), transaction.get(tournamentRef), transaction.get(db.collection("tournamentMatches").where("tournamentId", "==", String(refund.tournamentId ?? "")).limit(490))
    ]);
    if (!paymentSnap.exists || paymentSnap.data()?.status !== "confirmed" || !tournamentSnap.exists) throw new Error("TOURNAMENT_REFUND_STATE_CHANGED");
    const cutoff = tournamentRefundCutoff(tournamentSnap.data() ?? {}, matchesSnap);
    if (cutoff === "unverified") throw new Error("TOURNAMENT_REFUND_CUTOFF_UNVERIFIED");
    if (cutoff && Date.parse(input.now) >= Date.parse(cutoff)) throw new Error("TOURNAMENT_REFUND_CUTOFF_PASSED");
    if (tournamentEntrantAdvanced(String(refund.entrantId ?? paymentSnap.data()?.entrantId ?? ""), matchesSnap)) throw new Error("TOURNAMENT_REFUND_ADVANCED_ENTRANT");
    transaction.set(refundRef, { status: "approved", reviewedBy: input.actorId, reviewedAt: input.now, reviewReason: input.reason, approvedAt: input.now, approvedBeforeCutoff: true, approvalCutoffAt: cutoff, updatedAt: input.now }, { merge: true });
    return { idempotent: false, approvedBeforeCutoff: true, approvalCutoffAt: cutoff };
  });
}
