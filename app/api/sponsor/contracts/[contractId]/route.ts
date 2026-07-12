import { ok, readJson, serverError } from "@/lib/server/responses";
import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { cleanMoneyCents, cleanText, isoNow, normalizeContractStatus, safeArray } from "@/lib/sponsor-finance";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ contractId: string }> };

function patchPayload(body: Record<string, unknown>, sponsorId: string, now: string, existing: Record<string, unknown>) {
  return {
    title: cleanText(body.title ?? existing.title, "Untitled sponsor contract").slice(0, 180),
    status: normalizeContractStatus(body.status ?? existing.status),
    contractValueCents: cleanMoneyCents(body.contractValue ?? body.contractValueCents ?? existing.contractValueCents),
    currency: cleanText(body.currency ?? existing.currency, "USD").slice(0, 12),
    signatureStatus: cleanText(body.signatureStatus ?? existing.signatureStatus, "foundation_not_enabled").slice(0, 80),
    deliverablesSummary: safeArray(body.deliverablesSummary ?? existing.deliverablesSummary),
    paymentTermsFoundation: cleanText(body.paymentTermsFoundation ?? existing.paymentTermsFoundation).slice(0, 900),
    milestoneScheduleFoundation: safeArray(body.milestoneScheduleFoundation ?? existing.milestoneScheduleFoundation),
    legalReviewNeeded: Boolean(body.legalReviewNeeded ?? existing.legalReviewNeeded ?? true),
    eSignatureProvider: "not_configured",
    fundingStatus: "not_active",
    paymentReleaseStatus: "not_active",
    isFoundationOnly: true,
    updatedAt: now,
    updatedBy: sponsorId,
    version: Number(existing.version ?? 0) + 1
  };
}

export async function GET(request: Request, { params }: Params) {
  const { contractId } = await params;
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const owned = await assertSponsorOwnedDoc(context.db, "sponsorContracts", contractId, context.user.uid);
  if (owned.response) return owned.response;
  return ok({ contract: { id: owned.snap.id, ...owned.snap.data() } }, "Contract loaded.");
}

export async function PATCH(request: Request, { params }: Params) {
  const { contractId } = await params;
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const owned = await assertSponsorOwnedDoc(context.db, "sponsorContracts", contractId, context.user.uid);
  if (owned.response) return owned.response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  try {
    const now = isoNow();
    const update = patchPayload(body, context.user.uid, now, owned.snap.data() ?? {});
    await Promise.all([
      owned.snap.ref.set(update, { merge: true }),
      context.db.collection("sponsorContractRevisions").add({ sponsorId: context.user.uid, contractId, status: update.status, changeSummary: "Contract foundation updated.", createdAt: now, createdBy: context.user.uid }),
      context.db.collection("sponsorFinancialAuditLogs").add({ sponsorId: context.user.uid, relatedContractId: contractId, action: "contract_foundation_updated", moneyMovement: false, createdAt: now, createdBy: context.user.uid })
    ]);
    return ok({ contract: { id: contractId, ...(owned.snap.data() ?? {}), ...update } }, "Contract foundation updated. No funding, signature, or payment release was activated.");
  } catch (error) {
    console.error("[sponsor-contract:patch]", { userId: context.user.uid, contractId, message: error instanceof Error ? error.message : String(error) });
    return serverError("Contract foundation could not be updated.");
  }
}
