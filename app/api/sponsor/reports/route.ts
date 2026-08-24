import { fail, ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { requireSponsorContext, requireSponsorPermission } from "@/lib/server/sponsor";
import { cleanText, isoNow, normalizeReportStatus, normalizeReportType } from "@/lib/sponsor-operations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const snap = await context.db.collection("sponsorReports").where("sponsorId", "==", context.sponsorId).limit(100).get();
    const reports = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string })).sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
    return ok({ reports }, "Sponsor reports loaded.");
  } catch (error) {
    console.error("[sponsor-reports:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor reports could not be loaded.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const permissionError = requireSponsorPermission(context, "report.view");
  if (permissionError) return permissionError;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const sponsorshipId = cleanText(body.sponsorshipId).slice(0, 120);
  if (!sponsorshipId) return validationError({ sponsorshipId: "Select a completed sponsorship." });
  try {
    const sponsorshipRef = context.db.collection("sponsorships").doc(sponsorshipId);
    const sponsorshipSnap = await sponsorshipRef.get();
    const sponsorship = sponsorshipSnap.data() ?? {};
    if (!sponsorshipSnap.exists || sponsorship.sponsorId !== context.sponsorId) return fail("Sponsorship not found.", 404, undefined, "NOT_FOUND");
    if (!['completed', 'completion_review'].includes(String(sponsorship.status ?? ''))) return fail("Final reports are available after sponsorship completion.", 422, undefined, "SPONSORSHIP_NOT_COMPLETE");
    const ref = context.db.collection("sponsorReports").doc(`${sponsorshipId}_final`);
    const existing = await ref.get();
    if (existing.exists) return ok({ report: { id: existing.id, ...existing.data() }, idempotent: true }, "Final sponsorship report loaded.");
    const [deliverablesSnap, analyticsSnap, transactionsSnap] = await Promise.all([
      context.db.collection("sponsorDeliverables").where("sponsorId", "==", context.sponsorId).limit(200).get(),
      context.db.collection("sponsorAnalyticsSnapshots").where("sponsorId", "==", context.sponsorId).limit(100).get(),
      context.db.collection("sponsorWalletTransactions").where("sponsorId", "==", context.sponsorId).limit(200).get()
    ]);
    const now = isoNow();
    const snapshot = {
      summary: { sponsorshipId, sponsorRole: sponsorship.sponsorRole ?? "supporting", creatorId: sponsorship.linkedCreatorId ?? null, challengeId: sponsorship.linkedChallengeId ?? null },
      funding: { amountCents: Number(sponsorship.amountCents ?? 0), currency: sponsorship.currency ?? "USD", economics: sponsorship.economics ?? {}, transactions: transactionsSnap.docs.filter((doc) => doc.data().relatedSponsorshipId === sponsorshipId).map((doc) => ({ id: doc.id, type: doc.data().type ?? null, amountCents: Number(doc.data().amountCents ?? 0), status: doc.data().status ?? null })) },
      performance: analyticsSnap.docs.find((doc) => doc.data().relatedSponsorshipId === sponsorshipId)?.data()?.metrics ?? null,
      placements: (sponsorship.visibility as Record<string, unknown> | undefined)?.requestedPlacements ?? [],
      deliverables: deliverablesSnap.docs.filter((doc) => doc.data().relatedSponsorshipId === sponsorshipId).map((doc) => ({ id: doc.id, title: doc.data().title ?? "Deliverable", status: doc.data().status ?? "not_started", revisionNumber: Number(doc.data().revisionNumber ?? 1) })),
      results: sponsorship.results ?? null,
      timeline: { createdAt: sponsorship.createdAt ?? null, activatedAt: sponsorship.activatedAt ?? null, completedAt: sponsorship.completedAt ?? now },
      reconciledAt: now,
      immutable: true
    };
    const title = cleanText(body.title, "Final sponsorship report").slice(0, 180);
    const report = { id: ref.id, sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, ownerUid: context.user.uid, sponsorshipId, title, type: normalizeReportType(body.type ?? "campaign_completion"), status: normalizeReportStatus("ready"), snapshot, snapshotVersion: 1, immutable: true, dataSourceLabel: "verified_canonical_snapshot", exportPdfStatus: "ready", exportCsvStatus: "not_available", exportGenerated: true, finalizedAt: now, createdAt: now, updatedAt: now, createdBy: context.user.uid, updatedBy: context.user.uid, version: 1 };
    const jobRef = context.db.collection("sponsorReportJobs").doc(`${ref.id}_final`);
    const batch = context.db.batch();
    batch.create(ref, report);
    batch.create(jobRef, { id: jobRef.id, sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, reportId: ref.id, status: "ready", exportGenerated: true, createdAt: now, createdBy: context.user.uid });
    batch.create(context.db.collection("sponsorFinancialAuditLogs").doc(`${ref.id}_finalized`), { id: `${ref.id}_finalized`, sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, relatedSponsorshipId: sponsorshipId, relatedReportId: ref.id, action: "final_sponsorship_report_created", createdAt: now, createdBy: context.user.uid });
    await batch.commit();
    return ok({ report }, "Final sponsorship report created.");
  } catch (error) {
    console.error("[sponsor-reports:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor report could not be saved.");
  }
}
