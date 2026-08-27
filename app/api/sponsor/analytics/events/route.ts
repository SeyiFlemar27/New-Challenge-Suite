import { createHash } from "node:crypto";
import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { deterministicId } from "@/lib/server/idempotency";
import { classifySponsorAnalyticsEvent, sponsorAnalyticsEventId } from "@/lib/server/sponsor-analytics";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";
const schema = z.object({
  sponsorshipId: z.string().trim().min(1).max(160),
  challengeId: z.string().trim().min(1).max(160),
  placementId: z.string().trim().min(1).max(120),
  eventType: z.enum(["placement_impression", "cta_click"]),
  sessionId: z.string().trim().min(1).max(180)
});

export async function POST(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sponsor analytics");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const input = schema.safeParse(parsed.body);
  if (!input.success) return validationError({ event: "Sponsor placement event is invalid." });
  const sponsorshipRef = db.collection("sponsorships").doc(input.data.sponsorshipId);
  const sponsorshipSnap = await sponsorshipRef.get();
  const sponsorship = sponsorshipSnap.data() ?? {};
  const challengeId = String(sponsorship.challengeId ?? sponsorship.linkedChallengeId ?? "");
  const lifecycle = String(sponsorship.status ?? "").toLowerCase();
  if (!sponsorshipSnap.exists || challengeId !== input.data.challengeId || !["approved", "active", "live", "completion_review"].includes(lifecycle)) return fail("Sponsor placement is not available.", 404, undefined, "SPONSOR_PLACEMENT_NOT_AVAILABLE");
  const visibility = sponsorship.visibility && typeof sponsorship.visibility === "object" ? sponsorship.visibility as Record<string, unknown> : {};
  const placements = Array.isArray(visibility.requestedPlacements) ? visibility.requestedPlacements.map(String) : [];
  if (placements.length && !placements.includes(input.data.placementId)) return fail("Sponsor placement is not available.", 404, undefined, "SPONSOR_PLACEMENT_NOT_AVAILABLE");
  const userAgent = request.headers.get("user-agent") ?? "";
  const sessionHash = createHash("sha256").update(input.data.sessionId + "|" + userAgent).digest("hex");
  const quality = classifySponsorAnalyticsEvent({ sessionId: input.data.sessionId, userAgent });
  const now = new Date().toISOString();
  const id = sponsorAnalyticsEventId({ sponsorshipId: input.data.sponsorshipId, placementId: input.data.placementId, eventType: input.data.eventType, sessionHash, occurredAt: now });
  const ref = db.collection("sponsorAnalyticsEvents").doc(id);
  const existing = await ref.get();
  if (existing.exists) return ok({ accepted: true, deduplicated: true }, "Sponsor placement event recorded.");
  await ref.create({
    id,
    sponsorId: sponsorship.sponsorId,
    sponsorOrganizationId: sponsorship.sponsorOrganizationId ?? sponsorship.sponsorId,
    sponsorshipId: input.data.sponsorshipId,
    challengeId,
    placementId: input.data.placementId,
    eventType: input.data.eventType,
    sessionHash,
    valid: quality.valid,
    classification: quality.classification,
    invalidReasons: quality.invalidReasons,
    provisional: true,
    finalized: false,
    occurredAt: now,
    createdAt: now,
    source: "public_sponsor_placement"
  });
  await db.collection("sponsorAnalyticsAggregationQueue").doc(deterministicId(input.data.sponsorshipId, now.slice(0, 13))).set({ sponsorshipId: input.data.sponsorshipId, sponsorId: sponsorship.sponsorId, status: "pending", updatedAt: now }, { merge: true });
  return ok({ accepted: true, deduplicated: false }, "Sponsor placement event recorded.");
}