import { createHash, randomUUID } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { deterministicId } from "@/lib/server/idempotency";
import { classifySponsorAnalyticsEvent, sponsorAnalyticsEventId } from "@/lib/server/sponsor-analytics";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

function safeDestination(value: unknown) {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch { return null; }
}

export async function GET(request: Request, { params }: { params: Promise<{ sponsorshipId: string }> }) {
  const db = getAdminDb();
  if (!db) return new Response("Tracking is temporarily unavailable.", { status: 503 });
  const { sponsorshipId } = await params;
  const snap = await db.collection("sponsorships").doc(sponsorshipId).get();
  const sponsorship = snap.data() ?? {};
  const status = String(sponsorship.status ?? "").toLowerCase();
  const visibility = sponsorship.visibility && typeof sponsorship.visibility === "object" ? sponsorship.visibility as Record<string, unknown> : {};
  const destination = safeDestination(sponsorship.ctaDestinationLink ?? visibility.ctaDestinationLink);
  const challengeId = String(sponsorship.challengeId ?? sponsorship.linkedChallengeId ?? "");
  if (!snap.exists || !destination || !challengeId || !["approved", "active", "live", "completion_review"].includes(status)) return new Response("Sponsor destination is unavailable.", { status: 404 });
  const placementId = new URL(request.url).searchParams.get("placementId")?.slice(0, 120) || "sponsor_cta";
  const requestedPlacements = Array.isArray(visibility.requestedPlacements) ? visibility.requestedPlacements.map(String) : [];
  if (!requestedPlacements.includes(placementId)) return new Response("Sponsor destination is unavailable.", { status: 404 });
  const userAgent = request.headers.get("user-agent") ?? "";
  const existingCookie = request.headers.get("cookie")?.match(/(?:^|;\s*)cs_sponsor_session=([^;]+)/)?.[1];
  const sessionId = existingCookie && /^[a-f0-9-]{16,64}$/i.test(existingCookie) ? existingCookie : randomUUID();
  const rateLimit = consumeRateLimit(`sponsor-click:${sponsorshipId}:${sessionId}`, { limit: 30, windowMs: 60_000 });
  if (!rateLimit.allowed) return new Response("Too many sponsor redirects. Please try again shortly.", { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  const sessionHash = createHash("sha256").update(`${sessionId}|${userAgent}`).digest("hex");
  const now = new Date().toISOString();
  const quality = classifySponsorAnalyticsEvent({ sessionId: sessionHash, userAgent });
  const id = sponsorAnalyticsEventId({ sponsorshipId, placementId, eventType: "cta_click", sessionHash, occurredAt: now });
  await db.collection("sponsorAnalyticsEvents").doc(id).set({ id, sponsorId: sponsorship.sponsorId, sponsorOrganizationId: sponsorship.sponsorOrganizationId ?? sponsorship.sponsorId, sponsorshipId, challengeId, placementId, eventType: "cta_click", sessionHash, valid: quality.valid, classification: quality.classification, invalidReasons: quality.invalidReasons, provisional: true, finalized: false, occurredAt: now, createdAt: now, source: "tracked_sponsor_redirect" }, { merge: true });
  await db.collection("sponsorAnalyticsAggregationQueue").doc(deterministicId(sponsorshipId, now.slice(0, 13))).set({ sponsorshipId, sponsorId: sponsorship.sponsorId, status: "pending", updatedAt: now }, { merge: true });
  const redirect = Response.redirect(destination, 302);
  if (!existingCookie) redirect.headers.append("Set-Cookie", `cs_sponsor_session=${sessionId}; Path=/; Max-Age=2592000; SameSite=Lax; Secure; HttpOnly`);
  return redirect;
}
