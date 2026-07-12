import { ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { cleanText, isoNow, normalizeReportStatus, normalizeReportType } from "@/lib/sponsor-operations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const snap = await context.db.collection("sponsorReports").where("sponsorId", "==", context.user.uid).limit(100).get();
    const reports = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String((b as any).updatedAt ?? "").localeCompare(String((a as any).updatedAt ?? "")));
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
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  if (cleanText(body.title).length < 3) return validationError({ title: "Report title is required." });
  try {
    const now = isoNow();
    const ref = context.db.collection("sponsorReports").doc();
    const report = { id: ref.id, sponsorId: context.user.uid, ownerUid: context.user.uid, title: cleanText(body.title).slice(0, 180), type: normalizeReportType(body.type), status: normalizeReportStatus(body.status ?? "draft"), relatedCampaignId: cleanText(body.campaignId ?? body.relatedCampaignId).slice(0, 120) || null, dataSourceLabel: "foundation_unavailable", exportPdfStatus: "not_configured", exportCsvStatus: "not_configured", fakeExportGenerated: false, createdAt: now, updatedAt: now, createdBy: context.user.uid, updatedBy: context.user.uid, version: 1 };
    await Promise.all([ref.set(report), context.db.collection("sponsorReportJobs").add({ sponsorId: context.user.uid, reportId: ref.id, status: "draft", exportGenerated: false, createdAt: now, createdBy: context.user.uid })]);
    return ok({ report }, "Report foundation saved. No PDF or CSV export was generated.");
  } catch (error) {
    console.error("[sponsor-reports:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor report could not be saved.");
  }
}
