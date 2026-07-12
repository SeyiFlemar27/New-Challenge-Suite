import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { normalizeSponsorCampaignStatus, safeArray } from "@/lib/sponsor-campaigns";

export const dynamic = "force-dynamic";

function cleanText(value: unknown, fallback = "") { return String(value ?? fallback).trim().slice(0, 2000); }
function cleanMoney(value: unknown) { const numeric = Number(value ?? 0); return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 100) : 0; }
function buildPatch(body: Record<string, unknown>, sponsorId: string, now: string, existing: Record<string, unknown>) {
  const deliverables = Array.isArray(body.deliverables) ? body.deliverables.slice(0, 20).map((item, index) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { id: cleanText(record.id, `deliverable_${index + 1}`).slice(0, 80), name: cleanText(record.name || record.deliverableName, "Campaign deliverable").slice(0, 160), description: cleanText(record.description).slice(0, 800), mediaType: cleanText(record.mediaType, "not_specified").slice(0, 80), quantity: Math.max(1, Number(record.quantity ?? 1) || 1), dueDate: cleanText(record.dueDate).slice(0, 40), approvalRequired: record.approvalRequired !== false, revisionLimit: Math.max(0, Number(record.revisionLimit ?? 1) || 0), requiredPlatform: cleanText(record.requiredPlatform).slice(0, 120), requiredMention: cleanText(record.requiredMention).slice(0, 160), requiredHashtag: cleanText(record.requiredHashtag).slice(0, 160), requiredCta: cleanText(record.requiredCta).slice(0, 160) };
  }) : Array.isArray(existing.deliverables) ? existing.deliverables : [];
  const budget = body.budget && typeof body.budget === "object" ? body.budget as Record<string, unknown> : {};
  return {
    campaignTitle: cleanText(body.campaignTitle || body.title || existing.campaignTitle, "Untitled sponsor campaign").slice(0, 180),
    campaignDescription: cleanText(body.campaignDescription ?? existing.campaignDescription).slice(0, 2000),
    objective: cleanText(body.objective ?? existing.objective, "brand_awareness").slice(0, 120),
    category: cleanText(body.category ?? existing.category).slice(0, 120),
    internalReference: cleanText(body.internalReference ?? existing.internalReference).slice(0, 120),
    startDate: cleanText(body.startDate ?? existing.startDate).slice(0, 40),
    endDate: cleanText(body.endDate ?? existing.endDate).slice(0, 40),
    visibility: cleanText(body.visibility ?? existing.visibility, "draft").slice(0, 80),
    status: normalizeSponsorCampaignStatus(body.status ?? existing.status),
    targetCountries: body.targetCountries === undefined ? safeArray(existing.targetCountries) : safeArray(body.targetCountries),
    targetRegions: body.targetRegions === undefined ? safeArray(existing.targetRegions) : safeArray(body.targetRegions),
    targetAgeRange: cleanText(body.targetAgeRange ?? existing.targetAgeRange).slice(0, 80),
    targetGender: cleanText(body.targetGender ?? existing.targetGender).slice(0, 80),
    interests: body.interests === undefined ? safeArray(existing.interests) : safeArray(body.interests),
    languages: body.languages === undefined ? safeArray(existing.languages) : safeArray(body.languages),
    platformAudience: cleanText(body.platformAudience ?? existing.platformAudience).slice(0, 240),
    expectedParticipantProfile: cleanText(body.expectedParticipantProfile ?? existing.expectedParticipantProfile).slice(0, 800),
    creatorCategory: cleanText(body.creatorCategory ?? existing.creatorCategory).slice(0, 120),
    creatorNiche: cleanText(body.creatorNiche ?? existing.creatorNiche).slice(0, 120),
    minimumAudienceSize: cleanText(body.minimumAudienceSize ?? existing.minimumAudienceSize).slice(0, 80),
    preferredEngagementRate: cleanText(body.preferredEngagementRate ?? existing.preferredEngagementRate).slice(0, 80),
    creatorLocation: cleanText(body.creatorLocation ?? existing.creatorLocation).slice(0, 160),
    challengeExperienceRequired: body.challengeExperienceRequired === undefined ? Boolean(existing.challengeExperienceRequired) : body.challengeExperienceRequired === true,
    reputationScoreMinimum: cleanText(body.reputationScoreMinimum ?? existing.reputationScoreMinimum).slice(0, 80),
    verificationRequired: body.verificationRequired === undefined ? Boolean(existing.verificationRequired) : body.verificationRequired === true,
    preferredResponseTime: cleanText(body.preferredResponseTime ?? existing.preferredResponseTime).slice(0, 120),
    deliverables,
    deliverablesCount: deliverables.length,
    budget: { totalBudgetCents: cleanMoney(budget.totalBudget ?? body.totalBudget ?? (existing.budget as any)?.totalBudgetCents), creatorFeeCents: cleanMoney(budget.creatorFee ?? body.creatorFee ?? (existing.budget as any)?.creatorFeeCents), prizePoolContributionCents: cleanMoney(budget.prizePoolContribution ?? body.prizePoolContribution ?? (existing.budget as any)?.prizePoolContributionCents), mediaBudgetCents: cleanMoney(budget.mediaBudget ?? body.mediaBudget ?? (existing.budget as any)?.mediaBudgetCents), platformFeeEstimateCents: cleanMoney(budget.platformFeeEstimate ?? body.platformFeeEstimate ?? (existing.budget as any)?.platformFeeEstimateCents), contingencyCents: cleanMoney(budget.contingency ?? body.contingency ?? (existing.budget as any)?.contingencyCents), currency: cleanText(budget.currency ?? body.currency ?? (existing.budget as any)?.currency, "USD").slice(0, 12), taxHandlingFoundation: cleanText(budget.taxHandlingFoundation ?? body.taxHandlingFoundation ?? (existing.budget as any)?.taxHandlingFoundation).slice(0, 240), fundingEnabled: false, paymentProcessingEnabled: false },
    budgetSummary: cleanText(body.budgetSummary ?? existing.budgetSummary).slice(0, 240),
    paymentStructure: cleanText(body.paymentStructure ?? existing.paymentStructure, "milestone_payment").slice(0, 80),
    paymentMilestones: Array.isArray(body.paymentMilestones) ? body.paymentMilestones.slice(0, 10) : Array.isArray(existing.paymentMilestones) ? existing.paymentMilestones : [],
    paymentFoundationOnly: true,
    brandRequirements: body.brandRequirements && typeof body.brandRequirements === "object" ? body.brandRequirements : existing.brandRequirements ?? {},
    fundingStatus: "not_active",
    proposalStatus: "foundation_only",
    marketplacePublishEnabled: false,
    updatedAt: now,
    updatedBy: sponsorId,
    version: Number(existing.version ?? 0) + 1
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const { campaignId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorCampaignBriefs", campaignId, context.user.uid);
    if (owned.response) return owned.response;
    return ok({ campaign: { id: owned.snap.id, ...owned.snap.data() } }, "Campaign brief loaded.");
  } catch (error) {
    console.error("[sponsor-campaign:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Campaign brief could not be loaded.");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  if (body.campaignTitle !== undefined && cleanText(body.campaignTitle).length < 3) return validationError({ campaignTitle: "Campaign title is required." });
  try {
    const { campaignId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorCampaignBriefs", campaignId, context.user.uid);
    if (owned.response) return owned.response;
    const now = new Date().toISOString();
    const existing = owned.snap.data() ?? {};
    const payload = buildPatch(body, context.user.uid, now, existing);
    await Promise.all([
      context.db.collection("sponsorCampaignBriefs").doc(campaignId).set(payload, { merge: true }),
      context.db.collection("sponsorCampaignActivity").add({ sponsorId: context.user.uid, campaignId, action: "campaign_brief_updated", status: payload.status, createdAt: now, createdBy: context.user.uid }),
      context.db.collection("sponsorCampaignBudgets").doc(campaignId).set({ campaignId, sponsorId: context.user.uid, ...payload.budget, updatedAt: now }, { merge: true })
    ]);
    return ok({ campaign: { id: campaignId, ...existing, ...payload } }, "Campaign brief updated. Funding and proposal acceptance remain inactive.");
  } catch (error) {
    console.error("[sponsor-campaign:patch]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Campaign brief could not be updated.");
  }
}
