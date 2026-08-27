import { ok, serverError } from "@/lib/server/responses";
import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { buildTextPdf } from "@/lib/server/simple-pdf";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ reportId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { reportId } = await params;
  const { context, response } = await requireSponsorContext(request, { allowHistorical: true });
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const owned = await assertSponsorOwnedDoc(context.db, "sponsorReports", reportId, context.sponsorId);
  if (owned.response) return owned.response;
  const report = { id: owned.snap.id, ...owned.snap.data() } as Record<string, unknown>;
  if (new URL(request.url).searchParams.get("format") === "pdf") {
    if (report.status !== "ready" || report.immutable !== true) return new Response(JSON.stringify({ ok: false, error: { code: "REPORT_NOT_READY", message: "This report is not ready for export." } }), { status: 422, headers: { "content-type": "application/json" } });
    const snapshot = report.snapshot && typeof report.snapshot === "object" ? report.snapshot as Record<string, unknown> : {};
    const funding = snapshot.funding && typeof snapshot.funding === "object" ? snapshot.funding as Record<string, unknown> : {};
    const summary = snapshot.summary && typeof snapshot.summary === "object" ? snapshot.summary as Record<string, unknown> : {};
    const pdf = buildTextPdf(String(report.title ?? "Final sponsorship report"), [`Sponsorship: ${String(summary.sponsorshipId ?? report.sponsorshipId ?? "")}`, `Sponsor role: ${String(summary.sponsorRole ?? "supporting")}`, `Funding: ${String(funding.currency ?? "USD")} ${(Number(funding.amountCents ?? 0) / 100).toFixed(2)}`, `Finalized: ${String(report.finalizedAt ?? "")}`, "This report is an immutable snapshot of canonical Challenge Suite records."]);
    return new Response(pdf, { status: 200, headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="sponsorship-report-${reportId}.pdf"`, "cache-control": "private, no-store" } });
  }
  return ok({ report, exportStatus: report.exportPdfStatus }, "Sponsor report loaded.");
}
