import { normalizeSponsorCampaignStatus, safeArray } from "@/lib/sponsor-campaigns";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { resolveSponsorWorkspaceState } from "@/lib/sponsor-access";
import { fail, ok, readJson, serverError, validationError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

function cleanText(value: unknown, fallback = "") { return String(value ?? fallback).trim().slice(0, 2000); }
function cleanMoney(value: unknown) { const numeric = Number(value ?? 0); return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 100) : 0; }
function campaignPayload(body: Record<string, unknown>, sponsorId: string, now: string, existing: Record<string, unknown> = {}) {
  const status = normalizeSponsorCampaignStatus(body.status ?? existing.status ?? "draft");
  const deliverables = Array.isArray(body.deliverables) ? body.deliverables.slice(0, 20).map((item, index) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      id: cleanText(record.id, `deliverable_${index + 1}`).slice(0, 80),
      name: cleanText(record.name || record.deliverableName, "Campaign deliverable").slice(0, 160),
      description: cleanText(record.description).slice(0, 800),
      mediaType: cleanText(record.mediaType, "not_specified").slice(0, 80),
      quantity: Math.max(1, Number(record.quantity ?? 1) || 1),
      dueDate: cleanText(record.dueDate).slice(0, 40),
      approvalRequired: record.approvalRequired !== false,
      revisionLimit: Math.max(0, Number(record.revisionLimit ?? 1) || 0),
      requiredPlatform: cleanText(record.requiredPlatform).slice(0, 120),
      requiredMention: cleanText(record.requiredMention).slice(0, 160),
      requiredHashtag: cleanText(record.requiredHashtag).slice(0, 160),
      requiredCta: cleanText(record.requiredCta).slice(0, 160)
    };
  }) : [];
  const budget = body.budget && typeof body.budget === "object" ? body.budget as Record<string, unknown> : {};
  const paymentMilestones = Array.isArray(body.paymentMilestones) ? body.paymentMilestones.slice(0, 10).map((item, index) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { id: cleanText(record.id, `milestone_${index + 1}`).slice(0, 80), label: cleanText(record.label, "Milestone").slice(0, 160), percent: Math.max(0, Math.min(100, Number(record.percent ?? 0) || 0)), trigger: cleanText(record.trigger).slice(0, 240) };
  }) : [];
  return {
    sponsorId,
    ownerUid: sponsorId,
    campaignTitle: cleanText(body.campaignTitle || body.title, "Untitled sponsor campaign").slice(0, 180),
    campaignDescription: cleanText(body.campaignDescription || body.description).slice(0, 2000),
    objective: cleanText(body.objective || body.campaignObjective, "brand_awareness").slice(0, 120),
    category: cleanText(body.category || body.campaignCategory).slice(0, 120),
    internalReference: cleanText(body.internalReference).slice(0, 120),
    startDate: cleanText(body.startDate).slice(0, 40),
    endDate: cleanText(body.endDate).slice(0, 40),
    visibility: cleanText(body.visibility, "draft").slice(0, 80),
    status,
    targetCountries: safeArray(body.targetCountries),
    targetRegions: safeArray(body.targetRegions),
    targetAgeRange: cleanText(body.targetAgeRange).slice(0, 80),
    targetGender: cleanText(body.targetGender).slice(0, 80),
    interests: safeArray(body.interests),
    languages: safeArray(body.languages),
    platformAudience: cleanText(body.platformAudience).slice(0, 240),
    expectedParticipantProfile: cleanText(body.expectedParticipantProfile).slice(0, 800),
    creatorCategory: cleanText(body.creatorCategory).slice(0, 120),
    creatorNiche: cleanText(body.creatorNiche).slice(0, 120),
    minimumAudienceSize: cleanText(body.minimumAudienceSize).slice(0, 80),
    preferredEngagementRate: cleanText(body.preferredEngagementRate).slice(0, 80),
    creatorLocation: cleanText(body.creatorLocation).slice(0, 160),
    challengeExperienceRequired: body.challengeExperienceRequired === true,
    reputationScoreMinimum: cleanText(body.reputationScoreMinimum).slice(0, 80),
    verificationRequired: body.verificationRequired === true,
    preferredResponseTime: cleanText(body.preferredResponseTime).slice(0, 120),
    deliverables,
    deliverablesCount: deliverables.length,
    budget: {
      totalBudgetCents: cleanMoney(budget.totalBudget ?? body.totalBudget),
      creatorFeeCents: cleanMoney(budget.creatorFee ?? body.creatorFee),
      prizePoolContributionCents: cleanMoney(budget.prizePoolContribution ?? body.prizePoolContribution),
      mediaBudgetCents: cleanMoney(budget.mediaBudget ?? body.mediaBudget),
      platformFeeEstimateCents: cleanMoney(budget.platformFeeEstimate ?? body.platformFeeEstimate),
      contingencyCents: cleanMoney(budget.contingency ?? body.contingency),
      currency: cleanText(budget.currency ?? body.currency, "USD").slice(0, 12),
      taxHandlingFoundation: cleanText(budget.taxHandlingFoundation ?? body.taxHandlingFoundation).slice(0, 240),
      fundingEnabled: false,
      paymentProcessingEnabled: false
    },
    budgetSummary: cleanText(body.budgetSummary).slice(0, 240),
    paymentStructure: cleanText(body.paymentStructure, "milestone_payment").slice(0, 80),
    paymentMilestones,
    paymentFoundationOnly: true,
    brandRequirements: {
      requiredLogos: safeArray(body.requiredLogos),
      approvedBrandColors: safeArray(body.approvedBrandColors),
      prohibitedContent: cleanText(body.prohibitedContent).slice(0, 800),
      mandatoryDisclaimer: cleanText(body.mandatoryDisclaimer).slice(0, 500),
      campaignHashtags: safeArray(body.campaignHashtags),
      campaignMentions: safeArray(body.campaignMentions),
      preferredBrandVoice: cleanText(body.preferredBrandVoice).slice(0, 160),
      contentApprovalRequirements: cleanText(body.contentApprovalRequirements).slice(0, 800)
    },
    attachedCreatorCount: Number(existing.attachedCreatorCount ?? 0),
    attachedChallengeCount: Number(existing.attachedChallengeCount ?? 0),
    savedCreatorCount: Number(existing.savedCreatorCount ?? 0),
    invitedCreatorCount: Number(existing.invitedCreatorCount ?? 0),
    fundingStatus: "not_active",
    proposalStatus: "foundation_only",
    marketplacePublishEnabled: false,
    updatedAt: now,
    updatedBy: sponsorId,
    version: Number(existing.version ?? 0) + 1
  };
}

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const snap = await context.db.collection("sponsorCampaignBriefs").where("sponsorId", "==", context.user.uid).limit(100).get();
    const campaigns = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String((b as any).updatedAt ?? "").localeCompare(String((a as any).updatedAt ?? "")));
    return ok({ campaigns }, "Sponsor campaigns loaded.");
  } catch (error) {
    console.error("[sponsor-campaigns:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor campaigns could not be loaded.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  if (cleanText(body.campaignTitle || body.title).length < 3) return validationError({ campaignTitle: "Campaign title is required." });
  const workspace = resolveSponsorWorkspaceState(context.sponsorProfile);
  if (!workspace.canCreateCampaignBrief) return fail(workspace.lockedReason || "Complete the sponsor profile before creating a campaign brief.", 403, { sponsorStatus: workspace.status }, "SPONSOR_CAMPAIGN_LOCKED");
  try {
    const now = new Date().toISOString();
    const ref = context.db.collection("sponsorCampaignBriefs").doc();
    const payload = { id: ref.id, ...campaignPayload(body, context.user.uid, now), createdAt: now, createdBy: context.user.uid };
    await Promise.all([
      ref.set(payload),
      context.db.collection("sponsorCampaignActivity").add({ sponsorId: context.user.uid, campaignId: ref.id, action: "campaign_brief_created", status: payload.status, createdAt: now, createdBy: context.user.uid }),
      context.db.collection("sponsorCampaignBudgets").doc(ref.id).set({ campaignId: ref.id, sponsorId: context.user.uid, ...payload.budget, createdAt: now, updatedAt: now }, { merge: true }),
      ...payload.deliverables.map((item) => context.db.collection("sponsorCampaignDeliverables").doc(`${ref.id}_${item.id}`).set({ ...item, campaignId: ref.id, sponsorId: context.user.uid, createdAt: now, updatedAt: now }, { merge: true }))
    ]);
    return ok({ campaign: payload }, "Campaign brief saved. No funding, proposal acceptance, or public marketplace publish was activated.");
  } catch (error) {
    console.error("[sponsor-campaigns:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Campaign brief could not be saved.");
  }
}

