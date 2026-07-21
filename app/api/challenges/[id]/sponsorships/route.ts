import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser, requireRole } from "@/lib/server/auth";
import { writeCashTransactionPlaceholder } from "@/lib/server/cash-transactions";
import { createNotification } from "@/lib/server/notifications";
import { calculateSponsorContributionSplit, sponsorPlacementFoundation, sponsorshipDiscussionFoundation, validateSponsorFundingWindow } from "@/lib/server/payout-structure";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { z } from "zod";

const allowedCtaLabels = new Set(["Shop Now", "Visit Website", "Register Now", "Follow Brand", "Learn More"]);

const sponsorshipSchema = z.object({
  sponsorName: z.string().trim().min(2).max(120),
  brandName: z.string().trim().max(120).optional().default(""),
  contactEmail: z.string().trim().email(),
  amount: z.coerce.number().positive().max(100000000),
  prizePoolContribution: z.coerce.number().min(0).max(100000000).default(0),
  message: z.string().trim().max(2000).default(""),
  brandingPreference: z.string().trim().max(200).default("Logo on challenge page"),
  packageId: z.string().trim().max(80).optional(),
  ctaButtonText: z.string().trim().max(40).default("Learn More"),
  ctaDestinationLink: z.string().trim().url("Enter a valid CTA destination URL.").optional().or(z.literal("")),
  sponsorReturnPercent: z.coerce.number().min(0).max(100).default(12),
  creatorPercent: z.coerce.number().min(0).max(100).default(3)
}).refine((value) => value.sponsorReturnPercent + value.creatorPercent <= 100, {
  message: "Sponsorship split percentages cannot exceed 100%.",
  path: ["sponsorReturnPercent"]
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sponsorship proposals");
  const permission = requireRole(user, ["sponsor"]);
  if (permission) return permission;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const validated = sponsorshipSchema.safeParse(parsed.body);
  if (!validated.success) {
    const fieldErrors = Object.fromEntries(validated.error.issues.map((issue) => [String(issue.path[0] ?? "proposal"), issue.message]));
    return validationError(fieldErrors);
  }
  const body = validated.data;
  const [challengeSnap, sponsorProfileSnap] = await Promise.all([
    db.collection("challenges").doc(id).get(),
    db.collection("sponsorProfiles").doc(user.uid).get()
  ]);
  if (!challengeSnap.exists) return fail("Challenge not found.", 404, { fieldErrors: { challengeId: "Challenge does not exist." } }, "NOT_FOUND");
  const challenge = challengeSnap.data() ?? {};
  const sponsorProfile = sponsorProfileSnap.data() ?? {};
  if (sponsorProfile.sponsorVerificationStatus !== "approved") {
    return fail("Sponsor verification is required before contribution proposals can be submitted.", 403, { redirectTo: "/sponsor/dashboard" }, "SPONSOR_APPROVAL_REQUIRED");
  }
  const fundingWindow = validateSponsorFundingWindow(challenge);
  if (!fundingWindow.allowed) return fail("This challenge is not eligible for sponsorship funding right now.", 409, { fundingWindow }, "SPONSORSHIP_WINDOW_CLOSED");
  if (!challenge.sponsorEnabled) return fail("This challenge is not accepting sponsor proposals.", 409, undefined, "SPONSORSHIP_REJECTED");
  const sponsorPackages = Array.isArray(challenge.sponsorPackages) ? challenge.sponsorPackages as Array<Record<string, unknown>> : [];
  const selectedPackage = body.packageId ? sponsorPackages.find((item) => item.id === body.packageId) : null;
  if (body.packageId && !selectedPackage) return validationError({ packageId: "Select an available sponsor package." });
  if (!allowedCtaLabels.has(body.ctaButtonText)) return validationError({ ctaButtonText: "Select an approved CTA label." });
  const existingProposals = await db.collection("sponsorships").where("challengeId", "==", id).limit(200).get();
  const activeStatuses = new Set(["draft", "pending_creator", "pending_sponsor", "pending_admin_review", "approved"]);
  const activeProposals = existingProposals.docs.filter((doc) => activeStatuses.has(String(doc.data().status ?? "")));
  const totalSlotLimit = Number(challenge.sponsorSlots ?? 0);
  if (totalSlotLimit > 0 && activeProposals.length >= totalSlotLimit) {
    return fail("All sponsor slots for this challenge are currently reserved.", 409, undefined, "SPONSOR_SLOTS_FULL");
  }
  if (selectedPackage) {
    const packageCount = activeProposals.filter((doc) => doc.data().packageId === body.packageId).length;
    if (packageCount >= Number(selectedPackage.slotLimit ?? 0)) {
      return fail("The selected sponsor package has no available slots.", 409, undefined, "SPONSOR_PACKAGE_FULL");
    }
  }
  const ref = db.collection("sponsorships").doc();
  const now = new Date().toISOString();
  const amount = Number(body.amount);
  const prizePoolContribution = Number(body.prizePoolContribution ?? 0);
  const amountCents = Math.max(0, Math.round(amount * 100));
  const prizePoolContributionCents = Math.max(0, Math.round(prizePoolContribution * 100));
  const sponsorContribution = calculateSponsorContributionSplit(prizePoolContributionCents > 0 ? prizePoolContributionCents : amountCents);
  const proposal = {
    id: ref.id,
    challengeId: id,
    creatorId: challenge.creatorId ?? null,
    userId: user.uid,
    sponsorId: user.uid,
    sponsorName: body.sponsorName,
    brandName: body.brandName,
    contactEmail: body.contactEmail,
    packageId: body.packageId ?? null,
    packageName: selectedPackage?.name ?? null,
    amount,
    amountCents,
    prizePoolContribution,
    prizePoolContributionCents,
    currency: "USD",
    ctaButtonText: body.ctaButtonText,
    ctaDestinationLink: body.ctaDestinationLink || null,
    sponsorReturnPercent: body.sponsorReturnPercent,
    creatorPercent: body.creatorPercent,
    platformPercent: Math.max(0, 100 - body.sponsorReturnPercent - body.creatorPercent),
    sponsorContributionRule: sponsorContribution,
    sponsorPlacements: sponsorPlacementFoundation(),
    discussionFoundation: sponsorshipDiscussionFoundation(id, user.uid),
    paymentConfirmationRequired: true,
    prizePoolCreditStatus: "awaiting_provider_confirmation",
    proposedBy: user.uid,
    sponsorApprovedAt: now,
    creatorApprovedAt: null,
    adminApprovedAt: null,
    agreementStatus: "pending_creator",
    fundingReleaseStatus: "not_active",
    sponsorMoneyCaptureStatus: "not_active",
    moneyMovementEnabled: false,
    message: body.message,
    brandingPreference: body.brandingPreference,
    status: "pending_creator",
    createdAt: now,
    updatedAt: now
  };
  const contributionIntentCents = prizePoolContributionCents > 0 ? prizePoolContributionCents : amountCents;
  const writes: Promise<unknown>[] = [
    ref.set(proposal),
    writeCashTransactionPlaceholder(db, {
      id: `sponsorship_${ref.id}_contribution_requested`,
      userId: user.uid,
      type: "sponsor_contribution_requested",
      status: "pending_review",
      amountCents: contributionIntentCents,
      currency: "USD",
      sourceType: "sponsorship",
      sourceId: ref.id,
      challengeId: id,
      description: `Sponsor contribution request recorded for challenge ${id}. This does not capture, hold, release, or pay money.`,
      now
    })
  ];
  await Promise.all(writes);
  await createNotification(db, { userId: user.uid, type: "sponsorship_submitted", title: "Sponsorship proposal sent", body: "The creator must approve the proposed terms before platform review.", targetId: ref.id });
  if (typeof challenge.creatorId === "string") {
    await createNotification(db, { userId: challenge.creatorId, type: "sponsorship_received", title: "New sponsorship proposal", body: `${body.brandName || body.sponsorName} sent collaboration terms for ${challenge.title ?? "your challenge"}.`, targetId: ref.id });
  }
  return ok({ sponsorship: proposal }, "Sponsorship proposal sent to the creator for review.");
}
