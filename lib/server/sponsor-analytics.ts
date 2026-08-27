import type { Firestore } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";

export type SponsorAnalyticsEventType = "placement_impression" | "cta_click";
export type SponsorAnalyticsEvent = Record<string, unknown> & { id?: string };

function text(value: unknown) { return String(value ?? "").trim(); }
function status(value: unknown) { return text(value).toLowerCase(); }

export function sponsorAnalyticsEventId(input: { sponsorshipId: string; placementId: string; eventType: SponsorAnalyticsEventType; sessionHash: string; occurredAt: string }) {
  return deterministicId("sponsor_analytics", input.sponsorshipId, input.placementId, input.eventType, input.occurredAt.slice(0, 10), input.sessionHash.slice(0, 32));
}

export function classifySponsorAnalyticsEvent(input: { sessionId: string; userAgent: string; moderationStatus?: string | null }) {
  const reasons: string[] = [];
  if (input.sessionId.length < 16 || input.sessionId.length > 160) reasons.push("invalid_session");
  if (!input.userAgent || input.userAgent.length < 8) reasons.push("missing_user_agent");
  if (["invalid", "fraudulent", "bot", "blocked"].includes(text(input.moderationStatus).toLowerCase())) reasons.push("moderation_invalid");
  return { valid: reasons.length === 0, classification: reasons.length ? "invalid" : "provisional_valid", invalidReasons: reasons };
}

export function reconcileSponsorAnalytics(events: SponsorAnalyticsEvent[]) {
  const valid = events.filter((event) => event.valid !== false && !["invalid", "fraudulent", "bot", "blocked"].includes(status(event.classification ?? event.moderationStatus)));
  const impressions = valid.filter((event) => event.eventType === "placement_impression");
  const clicks = valid.filter((event) => event.eventType === "cta_click");
  const uniqueSessions = new Set(valid.map((event) => text(event.sessionHash)).filter(Boolean));
  return {
    validImpressions: impressions.length,
    uniqueCtaClicks: clicks.length,
    uniqueSessions: uniqueSessions.size,
    invalidEventsExcluded: events.length - valid.length,
    clickThroughRate: impressions.length ? Number(((clicks.length / impressions.length) * 100).toFixed(2)) : null
  };
}

export async function reconcileSponsorAnalyticsForSponsorship(db: Firestore, input: { sponsorshipId: string; finalized: boolean; actorId: string }) {
  const sponsorshipRef = db.collection("sponsorships").doc(input.sponsorshipId);
  const sponsorshipSnap = await sponsorshipRef.get();
  if (!sponsorshipSnap.exists) throw new Error("SPONSORSHIP_NOT_FOUND");
  const sponsorship = sponsorshipSnap.data() ?? {};
  const eventsSnap = await db.collection("sponsorAnalyticsEvents").where("sponsorshipId", "==", input.sponsorshipId).limit(5000).get();
  const metrics = reconcileSponsorAnalytics(eventsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  const snapshotId = input.finalized ? deterministicId(input.sponsorshipId, "final") : deterministicId(input.sponsorshipId, "live");
  const ref = db.collection("sponsorAnalyticsSnapshots").doc(snapshotId);
  const existing = await ref.get();
  if (input.finalized && existing.exists && existing.data()?.finalized === true) return { id: existing.id, ...existing.data(), idempotent: true };
  const now = new Date().toISOString();
  const snapshot = {
    id: ref.id,
    sponsorId: sponsorship.sponsorId,
    sponsorOrganizationId: sponsorship.sponsorOrganizationId ?? sponsorship.sponsorId,
    sponsorshipId: input.sponsorshipId,
    challengeId: sponsorship.challengeId ?? sponsorship.linkedChallengeId ?? null,
    metrics,
    state: input.finalized ? "finalized" : "live",
    finalized: input.finalized,
    reconciledAt: now,
    finalizedAt: input.finalized ? now : null,
    immutable: input.finalized,
    source: "trusted_sponsor_placement_events",
    updatedAt: now,
    updatedBy: input.actorId
  };
  if (input.finalized) await ref.create(snapshot);
  else await ref.set(snapshot, { merge: true });
  return { ...snapshot, idempotent: false };
}