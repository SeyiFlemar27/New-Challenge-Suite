import { ok, readJson, serverError } from "@/lib/server/responses";
import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { cleanText, isoNow, normalizeMilestoneStatus } from "@/lib/sponsor-finance";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ milestoneId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { milestoneId } = await params;
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const owned = await assertSponsorOwnedDoc(context.db, "sponsorMilestones", milestoneId, context.user.uid);
  if (owned.response) return owned.response;
  return ok({ milestone: { id: owned.snap.id, ...owned.snap.data() } }, "Milestone loaded.");
}

export async function PATCH(request: Request, { params }: Params) {
  const { milestoneId } = await params;
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const owned = await assertSponsorOwnedDoc(context.db, "sponsorMilestones", milestoneId, context.user.uid);
  if (owned.response) return owned.response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  try {
    const now = isoNow();
    const update = {
      status: normalizeMilestoneStatus(body.status ?? owned.snap.data()?.status),
      sponsorFeedback: cleanText(body.sponsorFeedback ?? owned.snap.data()?.sponsorFeedback).slice(0, 1200),
      approvalRecordedFoundation: body.status === "approved" || owned.snap.data()?.approvalRecordedFoundation === true,
      paymentReleaseStatus: "not_active",
      releaseRequiresServerProcessing: true,
      updatedAt: now,
      updatedBy: context.user.uid
    };
    await Promise.all([
      owned.snap.ref.set(update, { merge: true }),
      context.db.collection("sponsorFinancialAuditLogs").add({ sponsorId: context.user.uid, relatedMilestoneId: milestoneId, action: "milestone_foundation_updated", newStatus: update.status, moneyMovement: false, createdAt: now, createdBy: context.user.uid })
    ]);
    return ok({ milestone: { id: milestoneId, ...(owned.snap.data() ?? {}), ...update } }, "Milestone approval foundation recorded. No funds were released.");
  } catch (error) {
    console.error("[sponsor-milestone:patch]", { userId: context.user.uid, milestoneId, message: error instanceof Error ? error.message : String(error) });
    return serverError("Milestone could not be updated.");
  }
}
