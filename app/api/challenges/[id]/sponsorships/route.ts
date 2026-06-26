import { isChallengeEligibleForSponsorship } from "@/lib/challenge-status";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser, requireRole } from "@/lib/server/auth";
import { writeCashTransactionPlaceholder } from "@/lib/server/cash-transactions";
import { createNotification } from "@/lib/server/notifications";
import { mergeSponsorPrizePoolPlaceholder } from "@/lib/server/prize-pools";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

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
  const body = parsed.body;
  const fieldErrors: Record<string, string> = {};
  if (!body?.sponsorName) fieldErrors.sponsorName = "Sponsor name is required.";
  if (!body?.contactEmail) fieldErrors.contactEmail = "Contact email is required.";
  if (!Number.isFinite(Number(body?.amount)) || Number(body?.amount) <= 0) fieldErrors.amount = "Amount must be greater than zero.";
  if (Object.keys(fieldErrors).length) return validationError(fieldErrors);
  const challengeSnap = await db.collection("challenges").doc(id).get();
  if (!challengeSnap.exists) return fail("Challenge not found.", 404, { fieldErrors: { challengeId: "Challenge does not exist." } }, "NOT_FOUND");
  const challenge = challengeSnap.data() ?? {};
  if (!isChallengeEligibleForSponsorship(challenge.status)) return fail("This challenge is not eligible for sponsorship.", 409, undefined, "SPONSORSHIP_REJECTED");
  const ref = db.collection("sponsorships").doc();
  const now = new Date().toISOString();
  const amount = Number(body.amount);
  const prizePoolContribution = Number(body.prizePoolContribution ?? 0);
  const amountCents = Math.max(0, Math.round(amount * 100));
  const prizePoolContributionCents = Math.max(0, Math.round(prizePoolContribution * 100));
  const proposal = { id: ref.id, challengeId: id, userId: user.uid, sponsorName: body.sponsorName, brandName: body.brandName ?? "", contactEmail: body.contactEmail, amount, amountCents, prizePoolContribution, prizePoolContributionCents, currency: "USD", fundingReleaseStatus: "not_active", sponsorMoneyCaptureStatus: "not_active", message: body.message ?? "", brandingPreference: body.brandingPreference ?? "Logo on challenge page", status: "pending_review", createdAt: now, updatedAt: now };
  const contributionIntentCents = prizePoolContributionCents > 0 ? prizePoolContributionCents : amountCents;
  const writes: Promise<unknown>[] = [
    ref.set(proposal),
    writeCashTransactionPlaceholder(db, {
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
  if (prizePoolContributionCents > 0) {
    writes.push(mergeSponsorPrizePoolPlaceholder(db, { challengeId: id, sponsorshipId: ref.id, contributionCents: prizePoolContributionCents, now }));
  }
  await Promise.all(writes);
  await createNotification(db, { userId: user.uid, type: "sponsorship_submitted", title: "Sponsorship submitted", body: "Your proposal is pending admin review.", targetId: ref.id });
  return ok({ sponsorship: proposal }, "Sponsorship proposal submitted for admin review.");
}
