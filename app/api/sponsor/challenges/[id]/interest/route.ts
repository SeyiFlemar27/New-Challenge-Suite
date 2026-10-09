import { z } from "zod";
import { requireSponsorContext, requireSponsorPermission } from "@/lib/server/sponsor";
import { fail, ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { validateSponsorFundingWindow } from "@/lib/server/payout-structure";
import { deterministicId } from "@/lib/server/idempotency";

export const dynamic = "force-dynamic";

const placements = ["challenge_detail", "voting_page", "leaderboard", "winner_announcement", "share_card"] as const;
const schema = z.object({
  amountCents: z.coerce.number().int().min(500).max(100000000),
  placements: z.array(z.enum(placements)).min(1).max(5),
  ctaText: z.string().trim().max(80).default(""),
  ctaUrl: z.string().trim().url().max(500).refine((value) => value.startsWith("https://"), "CTA destination must use HTTPS.").or(z.literal("")),
  deliverables: z.array(z.string().trim().min(1).max(180)).max(20).default([]),
  durationStart: z.string().trim().max(40).optional().default(""),
  durationEnd: z.string().trim().max(40).optional().default("")
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const denied = requireSponsorPermission(context, "sponsorship.manage");
  if (denied) return denied;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = schema.safeParse(parsed.body ?? {});
  if (!body.success) return validationError(Object.fromEntries(body.error.issues.map((issue) => [String(issue.path[0] ?? "terms"), issue.message])));
  const { id: challengeId } = await params;
  const now = new Date().toISOString();
  const agreementId = deterministicId("sponsor_opportunity", challengeId, context.organizationId);
  const agreementRef = context.db.collection("sponsorChallengeAgreements").doc(agreementId);
  try {
    const result = await context.db.runTransaction(async (transaction) => {
      const challengeRef = context.db.collection("challenges").doc(challengeId);
      const [challengeSnap, agreementSnap] = await Promise.all([transaction.get(challengeRef), transaction.get(agreementRef)]);
      if (!challengeSnap.exists) throw new Error("OPPORTUNITY_NOT_FOUND");
      const challenge = challengeSnap.data() ?? {};
      const available = validateSponsorFundingWindow(challenge);
      if (!available.allowed || !["public", "published", "public challenge"].includes(String(challenge.visibility ?? "public").toLowerCase()) || !(challenge.sponsorEnabled === true || challenge.sponsorReady === true || (challenge.monetization as Record<string, unknown> | undefined)?.sponsorReady === true)) throw new Error("OPPORTUNITY_UNAVAILABLE");
      const sponsorOrganizationId = String(context.organizationId);
      const creatorId = String(challenge.creatorId ?? challenge.hostId ?? "");
      if (!creatorId) throw new Error("OPPORTUNITY_OWNER_MISSING");
      if (agreementSnap.exists) {
        const prior = agreementSnap.data() ?? {};
        if (prior.status === "rejected" || prior.status === "cancelled" || prior.status === "expired") throw new Error("INTEREST_CLOSED");
        if (prior.fundingStatus === "pending" || prior.fundingStatus === "confirmed") return { agreement: { id: agreementId, ...prior }, duplicate: true };
        return { agreement: { id: agreementId, ...prior }, duplicate: true };
      }
      const terms = body.data;
      const start = terms.durationStart ? Date.parse(terms.durationStart) : null;
      const end = terms.durationEnd ? Date.parse(terms.durationEnd) : null;
      if ((start !== null && !Number.isFinite(start)) || (end !== null && !Number.isFinite(end)) || (start !== null && end !== null && end <= start)) throw new Error("INVALID_DURATION");
      const agreement = {
        id: agreementId,
        challengeId,
        challengeTitle: String(challenge.title ?? "Challenge").slice(0, 180),
        creatorId,
        sponsorId: sponsorOrganizationId,
        sponsorOrganizationId,
        status: "interest_submitted",
        fundingStatus: "not_started",
        termsVersion: 1,
        terms: {
          amountCents: terms.amountCents,
          currency: "USD",
          placements: [...new Set(terms.placements)].sort(),
          ctaText: terms.ctaText,
          ctaUrl: terms.ctaUrl,
          deliverables: terms.deliverables,
          durationStart: terms.durationStart || null,
          durationEnd: terms.durationEnd || null,
          brandAssetPath: String(context.sponsorProfile.logoPath ?? "").startsWith(`sponsors/${sponsorOrganizationId}/`) ? String(context.sponsorProfile.logoPath) : null
        },
        sponsorSubmittedAt: now,
        sponsorSubmittedBy: context.user.uid,
        creatorAcceptedVersion: null,
        sponsorAcceptedVersion: null,
        createdAt: now,
        updatedAt: now
      };
      transaction.create(agreementRef, agreement);
      return { agreement, duplicate: false };
    });
    return ok(result, result.duplicate ? "Your interest is already recorded for this opportunity." : "Sponsorship interest and proposed terms sent to the challenge owner.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "OPPORTUNITY_NOT_FOUND") return fail("Challenge opportunity was not found.", 404, undefined, "NOT_FOUND");
    if (code === "OPPORTUNITY_UNAVAILABLE") return fail("This opportunity is no longer available for sponsorship interest.", 409, undefined, "OPPORTUNITY_UNAVAILABLE");
    if (code === "INTEREST_CLOSED") return fail("This sponsorship interest has been closed.", 409, undefined, "INTEREST_CLOSED");
    if (code === "INVALID_DURATION") return validationError({ duration: "The agreed placement period is invalid." });
    console.error("[sponsor-interest:post]", { sponsorId: context.organizationId, challengeId, message: code || String(error) });
    return serverError("Sponsorship interest could not be recorded.");
  }
}
