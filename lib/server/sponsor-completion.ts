import type { Firestore } from "firebase-admin/firestore";
import { createNotification } from "@/lib/server/notifications";
import { listSponsorOrganizationMemberUserIds } from "@/lib/server/sponsor-organizations";
import { reconcileSponsorAnalyticsForSponsorship } from "@/lib/server/sponsor-analytics";
import { unresolvedRequiredDeliverables } from "@/lib/server/sponsor-studio";
import { deterministicId } from "@/lib/server/idempotency";

type CompletionOutcome = { sponsorshipId: string; status: "review_started" | "warned" | "completed" | "blocked" | "skipped"; reason?: string };
type SponsorRecord = Record<string, unknown>;
const REVIEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const REVIEW_WARNING_MS = 24 * 60 * 60 * 1000;
function date(value: unknown) { const parsed = Date.parse(String(value ?? "")); return Number.isFinite(parsed) ? parsed : null; }
function openStatus(value: unknown) { return !["resolved", "closed", "cancelled", "dismissed"].includes(String(value ?? "open").toLowerCase()); }

async function ensureFinalReport(db: Firestore, sponsorshipId: string, sponsorship: SponsorRecord, now: Date) {
  const ref = db.collection("sponsorReports").doc(`${sponsorshipId}_final`);
  if ((await ref.get()).exists) return;
  const [deliverables, analytics, transactions] = await Promise.all([
    db.collection("sponsorDeliverables").where("relatedSponsorshipId", "==", sponsorshipId).limit(200).get(),
    db.collection("sponsorAnalyticsSnapshots").where("sponsorshipId", "==", sponsorshipId).limit(20).get(),
    db.collection("sponsorWalletTransactions").where("relatedSponsorshipId", "==", sponsorshipId).limit(200).get()
  ]);
  const finalized = analytics.docs.map((item) => item.data()).find((item) => item.finalized === true) ?? null;
  const createdAt = now.toISOString();
  const report = {
    id: ref.id, sponsorId: sponsorship.sponsorId, sponsorOrganizationId: sponsorship.sponsorOrganizationId ?? sponsorship.sponsorId,
    sponsorshipId, title: "Final sponsorship report", type: "campaign_completion", status: "ready", immutable: true,
    snapshotVersion: 1, dataSourceLabel: "verified_canonical_snapshot", exportPdfStatus: "ready", exportCsvStatus: "not_available", exportGenerated: true,
    snapshot: {
      summary: { sponsorshipId, sponsorRole: sponsorship.sponsorRole ?? "supporting", creatorId: sponsorship.linkedCreatorId ?? null, challengeId: sponsorship.linkedChallengeId ?? null },
      funding: { amountCents: Number(sponsorship.amountCents ?? 0), currency: sponsorship.currency ?? "USD", economics: sponsorship.economics ?? {}, transactions: transactions.docs.map((item) => ({ id: item.id, type: item.data().type ?? null, amountCents: Number(item.data().amountCents ?? 0), status: item.data().status ?? null })) },
      performance: finalized?.metrics ?? null,
      placements: (sponsorship.visibility as SponsorRecord | undefined)?.requestedPlacements ?? [],
      deliverables: deliverables.docs.map((item) => ({ id: item.id, title: item.data().title ?? "Deliverable", status: item.data().status ?? "not_started", revisionNumber: Number(item.data().revisionNumber ?? 1) })),
      results: sponsorship.results ?? null,
      timeline: { createdAt: sponsorship.createdAt ?? null, activatedAt: sponsorship.activatedAt ?? null, completionReviewStartedAt: createdAt },
      reconciledAt: createdAt, immutable: true
    },
    finalizedAt: createdAt, createdAt, updatedAt: createdAt, createdBy: "system:sponsor-completion", updatedBy: "system:sponsor-completion", version: 1
  };
  const batch = db.batch();
  batch.create(ref, report);
  batch.create(db.collection("sponsorReportJobs").doc(`${ref.id}_final`), { id: `${ref.id}_final`, sponsorId: sponsorship.sponsorId, sponsorOrganizationId: sponsorship.sponsorOrganizationId ?? sponsorship.sponsorId, reportId: ref.id, status: "ready", exportGenerated: true, createdAt, createdBy: "system:sponsor-completion" });
  batch.create(db.collection("sponsorFinancialAuditLogs").doc(`${ref.id}_finalized`), { id: `${ref.id}_finalized`, sponsorId: sponsorship.sponsorId, sponsorOrganizationId: sponsorship.sponsorOrganizationId ?? sponsorship.sponsorId, relatedSponsorshipId: sponsorshipId, relatedReportId: ref.id, action: "final_sponsorship_report_created", createdAt, createdBy: "system:sponsor-completion" });
  await batch.commit().catch(async (error) => { if ((await ref.get()).exists) return; throw error; });
}

async function finalizeAnalyticsAndReport(db: Firestore, sponsorshipId: string, sponsorship: SponsorRecord, now: Date) {
  await reconcileSponsorAnalyticsForSponsorship(db, { sponsorshipId, finalized: true, actorId: "system:sponsor-completion" }).catch(async (error) => {
    await db.collection("sponsorAnalyticsReconciliationQueue").doc(deterministicId("completion", sponsorshipId)).set({ sponsorshipId, status: "retry_required", safeCode: "FINAL_RECONCILIATION_FAILED", updatedAt: now.toISOString() }, { merge: true });
    console.error("[sponsor-completion:analytics]", { sponsorshipId, message: error instanceof Error ? error.message : String(error) });
  });
  await ensureFinalReport(db, sponsorshipId, sponsorship, now);
}

export async function processSponsorCompletion(db: Firestore, now = new Date()): Promise<CompletionOutcome[]> {
  const snapshots = await Promise.all(["completion_review", "active", "live"].map((status) => db.collection("sponsorships").where("status", "==", status).limit(200).get()));
  const docs = [...new Map(snapshots.flatMap((snapshot) => snapshot.docs).map((doc) => [doc.id, doc])).values()];
  const outcomes: CompletionOutcome[] = [];
  for (const doc of docs) {
    const sponsorshipId = doc.id;
    let current = doc.data() ?? {};
    if (["active", "live"].includes(String(current.status))) {
      const endsAt = date(current.completionEligibleAt ?? current.endDate ?? current.sponsorshipEndAt);
      if (!endsAt || endsAt > now.getTime()) { outcomes.push({ sponsorshipId, status: "skipped", reason: "sponsorship_still_active" }); continue; }
      const reviewStarted = await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(doc.ref); const record = fresh.data() ?? {};
        if (!fresh.exists || !["active", "live"].includes(String(record.status))) return null;
        const freshEndsAt = date(record.completionEligibleAt ?? record.endDate ?? record.sponsorshipEndAt);
        if (!freshEndsAt || freshEndsAt > now.getTime()) return null;
        const startedAt = now.toISOString(); const reviewEndsAt = new Date(now.getTime() + REVIEW_WINDOW_MS).toISOString();
        const auditRef = db.collection("sponsorCompletionAuditLogs").doc(deterministicId("sponsorship_completion_review_started", sponsorshipId));
        const audit = await transaction.get(auditRef);
        if (!audit.exists) transaction.create(auditRef, { id: auditRef.id, sponsorshipId, sponsorId: record.sponsorId, sponsorOrganizationId: record.sponsorOrganizationId ?? record.sponsorId, action: "sponsorship_completion_review_started", actorType: "system", createdAt: startedAt });
        transaction.update(doc.ref, { status: "completion_review", completionReviewStartedAt: startedAt, completionReviewEndsAt: reviewEndsAt, updatedAt: startedAt, version: Number(record.version ?? 1) + 1 });
        return { ...record, status: "completion_review", completionReviewStartedAt: startedAt, completionReviewEndsAt: reviewEndsAt };
      });
      if (!reviewStarted) { outcomes.push({ sponsorshipId, status: "skipped", reason: "terminal_or_changed" }); continue; }
      current = reviewStarted;
      await finalizeAnalyticsAndReport(db, sponsorshipId, current, now);
      const members = await listSponsorOrganizationMemberUserIds(db, String(current.sponsorOrganizationId ?? current.sponsorId ?? ""));
      await Promise.all(members.map((userId) => createNotification(db, { userId, accountType: "sponsor", type: "sponsorship_completion_review_started", title: "Final sponsorship report ready", message: "Review the final report during the seven-day completion window.", entityType: "sponsorship", entityId: sponsorshipId, actionUrl: "/sponsor/sponsorships/" + sponsorshipId, priority: "high", idempotencyKey: deterministicId("sponsorship_completion_review_started", sponsorshipId) })));
      outcomes.push({ sponsorshipId, status: "review_started" });
      continue;
    }

    await finalizeAnalyticsAndReport(db, sponsorshipId, current, now);
    const reviewEndsAt = date(current.completionReviewEndsAt);
    if (!reviewEndsAt) { outcomes.push({ sponsorshipId, status: "blocked", reason: "missing_completion_deadline" }); continue; }
    const warningAt = reviewEndsAt - REVIEW_WARNING_MS;
    if (now.getTime() >= warningAt && now.getTime() < reviewEndsAt && !current.autoCompletionWarningSentAt) {
      const warningApplied = await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(doc.ref);
        if (!fresh.exists || fresh.data()?.status !== "completion_review" || fresh.data()?.autoCompletionWarningSentAt) return false;
        transaction.update(doc.ref, { autoCompletionWarningSentAt: now.toISOString(), updatedAt: now.toISOString() }); return true;
      });
      if (warningApplied) {
        const members = await listSponsorOrganizationMemberUserIds(db, String(current.sponsorOrganizationId ?? current.sponsorId ?? ""));
        await Promise.all(members.map((userId) => createNotification(db, { userId, accountType: "sponsor", type: "sponsorship_auto_completion_warning", title: "Sponsorship completion review ending soon", message: "Review the sponsorship outcome or report an issue before automatic completion.", entityType: "sponsorship", entityId: sponsorshipId, actionUrl: "/sponsor/sponsorships/" + sponsorshipId, priority: "high", idempotencyKey: deterministicId("sponsorship_completion_warning", sponsorshipId) })));
        outcomes.push({ sponsorshipId, status: "warned" });
      } else outcomes.push({ sponsorshipId, status: "skipped", reason: "warning_already_sent" });
      continue;
    }
    if (now.getTime() < reviewEndsAt) { outcomes.push({ sponsorshipId, status: "skipped", reason: "review_window_open" }); continue; }
    const result = await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(doc.ref); const sponsorship = fresh.data() ?? {};
      if (!fresh.exists || sponsorship.status !== "completion_review") return { completed: false, reason: "terminal_or_changed", sponsorship };
      const [disputes, deliverables] = await Promise.all([
        transaction.get(db.collection("sponsorDisputes").where("sponsorshipId", "==", sponsorshipId).limit(50)),
        transaction.get(db.collection("sponsorDeliverables").where("relatedSponsorshipId", "==", sponsorshipId).limit(200))
      ]);
      if (disputes.docs.some((item) => openStatus(item.data().status))) return { completed: false, reason: "open_dispute", sponsorship };
      if (unresolvedRequiredDeliverables(deliverables.docs.map((item) => ({ id: item.id, ...item.data() })))) return { completed: false, reason: "required_deliverables_unresolved", sponsorship };
      const auditRef = db.collection("sponsorCompletionAuditLogs").doc(deterministicId("sponsorship_auto_completed", sponsorshipId));
      if ((await transaction.get(auditRef)).exists) return { completed: false, reason: "already_completed", sponsorship };
      const completedAt = now.toISOString();
      transaction.update(doc.ref, { status: "completed", completedAt, autoCompletedAt: completedAt, completionMethod: "seven_day_scheduler", externalPayoutExecuted: false, externalRefundExecuted: false, updatedAt: completedAt, version: Number(sponsorship.version ?? 1) + 1 });
      transaction.create(auditRef, { id: auditRef.id, sponsorshipId, sponsorId: sponsorship.sponsorId, sponsorOrganizationId: sponsorship.sponsorOrganizationId ?? sponsorship.sponsorId, action: "sponsorship_auto_completed", actorType: "system", externalPayoutExecuted: false, externalRefundExecuted: false, createdAt: completedAt });
      return { completed: true, reason: "", sponsorship };
    });
    if (!result.completed) { outcomes.push({ sponsorshipId, status: result.reason === "terminal_or_changed" || result.reason === "already_completed" ? "skipped" : "blocked", reason: result.reason }); continue; }
    const members = await listSponsorOrganizationMemberUserIds(db, String(result.sponsorship.sponsorOrganizationId ?? result.sponsorship.sponsorId ?? ""));
    await Promise.all(members.map((userId) => createNotification(db, { userId, accountType: "sponsor", type: "sponsorship_completed", title: "Sponsorship completed", message: "The completion review window ended with no open issue or unresolved required deliverable.", entityType: "sponsorship", entityId: sponsorshipId, actionUrl: "/sponsor/sponsorships/" + sponsorshipId, idempotencyKey: deterministicId("sponsorship_completed", sponsorshipId) })));
    outcomes.push({ sponsorshipId, status: "completed" });
  }
  return outcomes;
}