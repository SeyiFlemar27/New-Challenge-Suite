import { eventKind, eventTime,isPublicApprovedLiveEvent } from "@/lib/live-event-policy";
import { SPONSOR_FUNDING_RESERVATION_WINDOW_MS } from "@/lib/server/sponsor-reservation-policy";

export function isLiveEventV2(record: Record<string, unknown>) {
  return record.isLiveEvent === true && (record.hostOperations as Record<string, unknown> | undefined)?.schemaVersion === 2;
}
/** A delayed edit cannot extend the persisted financial deadline, and an occurred closure never disappears. */
export function liveEventSponsorCutoff(event: Record<string, unknown>) {
  const starts = eventTime(event.startsAt);
  if (!Number.isFinite(starts)) return NaN;
  const values = [starts, ...[event.sponsorFundingCutoffAt, event.liveEventStartedAt, event.sponsorFundingClosedAt].filter(value => value != null).map(eventTime)];
  return values.every(Number.isFinite) ? Math.min(...values) : NaN;
}
export function liveEventSponsorFundingWindow(event: Record<string, unknown>, now = new Date()) {
  const cutoff = liveEventSponsorCutoff(event);
  let physical = false; try { physical = eventKind(event) === "physical_competition"; } catch { /* Unknown historical formats remain closed. */ }
  const sponsorReady = physical && Boolean(event.sponsorEnabled || event.sponsorReady);
  const published = isPublicApprovedLiveEvent(event) && ["scheduled", "approved", "registration_open", "registration_closed", "active"].includes(String(event.status));
  const terminal = Boolean(event.sponsorFundingClosedAt || event.resultsPublishedAt || event.settlementRestricted || ["cancelled", "completed", "rejected", "deleted"].includes(String(event.status)));
  const votingStarted = !Number.isFinite(cutoff) || now.getTime() >= cutoff;
  const allowed = sponsorReady && published && !terminal && !votingStarted && Number.isFinite(now.getTime());
  return { allowed, sponsorReady, published, terminal, votingStarted, lifecycleStatus: String(event.status), closesAt: Number.isFinite(cutoff) ? new Date(cutoff).toISOString() : null, reason: allowed ? "sponsor_funding_open" : !sponsorReady ? "event_not_sponsor_ready" : !published ? "event_not_published" : terminal ? "event_funding_restricted" : "event_funding_cutoff_reached" };
}
export function liveEventSponsorReservation(event: Record<string, unknown>, createdAt: Date) {
  const cutoff = liveEventSponsorCutoff(event), created = createdAt.getTime();
  if (!liveEventSponsorFundingWindow(event, createdAt).allowed) throw new Error("LIVE_EVENT_SPONSOR_WINDOW_CLOSED");
  return { createdAt: createdAt.toISOString(), expiresAt: new Date(Math.min(created + SPONSOR_FUNDING_RESERVATION_WINDOW_MS, cutoff)).toISOString(), fundingCutoffAt: new Date(cutoff).toISOString() };
}
export function isLiveEventSponsorPaymentTimely(input: { event: Record<string, unknown>; reservationCreatedAt: unknown; reservationExpiresAt: unknown; reservedCutoffAt: unknown; providerCompletionUpperBoundAt: unknown; precisionMs: number }) {
  const created = eventTime(input.reservationCreatedAt), expires = eventTime(input.reservationExpiresAt), reservedCutoff = eventTime(input.reservedCutoffAt), cutoff = liveEventSponsorCutoff(input.event), paid = eventTime(input.providerCompletionUpperBoundAt);
  if (![created, expires, reservedCutoff, cutoff, paid].every(Number.isFinite) || !Number.isSafeInteger(input.precisionMs) || input.precisionMs < 0) return false;
  if (expires !== Math.min(created + SPONSOR_FUNDING_RESERVATION_WINDOW_MS, reservedCutoff) || created >= Math.min(reservedCutoff, cutoff)) return false;
  // Preserve the shared Sponsor flow's conservative handling of whole-second provider evidence.
  return paid >= created && paid + input.precisionMs < Math.min(expires, cutoff);
}
