/** Shared, provider-independent Live Event rules. All monetary values are USD cents. */
export type LiveEventKind = "attendance_only" | "physical_competition";
export type LiveEventRecord = Record<string, unknown>;
export type AdmissionRefundPolicy = "flexible" | "standard" | "strict" | "non_refundable";

/** A booking preserves these terms; never read a later creator-selected policy. */
export function liveEventRefundEligibility(input: {
  policy: AdmissionRefundPolicy; startsAt: unknown; revisedStartsAt?: unknown;
  materialChangeNotifiedAt?: unknown; now: number; used: boolean; organizerCancelled: boolean;
  admissionCents: number; competitionEntryCents: number;
}) {
  if (![input.admissionCents, input.competitionEntryCents].every(value => Number.isSafeInteger(value) && value >= 0)) throw new LiveEventPolicyError("AMOUNT_INVALID", 422);
  if (input.organizerCancelled) return { eligible: true, admissionCents: input.admissionCents, competitionEntryCents: input.competitionEntryCents, reason: "organizer_cancellation" };
  const notice = eventTime(input.materialChangeNotifiedAt), revisedStart = eventTime(input.revisedStartsAt);
  if (Number.isFinite(notice) && Number.isFinite(revisedStart) && input.now >= notice && input.now < Math.min(notice + 7 * 86400_000, revisedStart)) return { eligible: true, admissionCents: input.admissionCents, competitionEntryCents: input.competitionEntryCents, reason: "material_event_change" };
  if (input.used) return { eligible: false, admissionCents: 0, competitionEntryCents: 0, reason: "ticket_used" };
  const hours = input.policy === "flexible" ? 24 : input.policy === "standard" ? 48 : input.policy === "strict" ? 168 : null;
  const starts = eventTime(input.startsAt);
  const eligible = hours !== null && Number.isFinite(starts) && input.now < starts - hours * 3600_000;
  return { eligible, admissionCents: eligible ? input.admissionCents : 0, competitionEntryCents: 0, reason: eligible ? "admission_policy" : "voluntary_refund_unavailable" };
}

export class LiveEventPolicyError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}

export const LIVE_EVENT_RESERVATION_MS = 30 * 60 * 1000;

/** The product deadline can precede Stripe's minimum session lifetime. */
export function liveEventReservationWindow(event: LiveEventRecord, createdAt: number) {
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) throw new LiveEventPolicyError("RESERVATION_TIME_INVALID", 422);
  assertEventBookingOpen(event, createdAt);
  const registrationClosesAt = eventTime(eventOptions(event).registrationClosesAt ?? event.registrationClosesAt);
  const expiresAt = Math.min(createdAt + LIVE_EVENT_RESERVATION_MS, registrationClosesAt);
  return { createdAt, expiresAt, stripeExpiresAtSeconds: Math.ceil((createdAt + LIVE_EVENT_RESERVATION_MS) / 1000) };
}

/** A verified paid provider-state snapshot establishes an upper bound, never an exact completion time.
 * A late or boundary-overlapping snapshot remains for reconciliation; it cannot establish lateness alone.
 */
export function liveEventPaymentTiming(input: { reservationCreatedAt: unknown; reservationExpiresAt: unknown; registrationClosesAt: unknown; verifiedCompletionUpperBoundSeconds: number | null }) {
  const created = eventTime(input.reservationCreatedAt), expires = eventTime(input.reservationExpiresAt), closes = eventTime(input.registrationClosesAt);
  if (![created, expires, closes].every(Number.isFinite) || created >= closes || expires !== Math.min(created + LIVE_EVENT_RESERVATION_MS, closes)) return { eligible: false, reason: "reservation_invalid" } as const;
  const bound = input.verifiedCompletionUpperBoundSeconds;
  if (bound === null || !Number.isSafeInteger(bound) || bound <= 0) return { eligible: false, reason: "completion_evidence_unavailable" } as const;
  // Provider timestamps have one-second precision. The entire uncertainty interval must precede expiry.
  if ((bound + 1) * 1000 > expires || bound * 1000 < Math.floor(created / 1000) * 1000) return { eligible: false, reason: "completion_requires_review" } as const;
  return { eligible: true, reason: "verified_before_deadline" } as const;
}
export function eventTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  return typeof value === "string" ? Date.parse(value) : NaN;
}
export function eventOptions(event: LiveEventRecord): LiveEventRecord {
  return event.hostOperations && typeof event.hostOperations === "object" ? event.hostOperations as LiveEventRecord : {};
}
export function liveEventFinancialConfigurationLocked(current: LiveEventRecord, patch: LiveEventRecord) {
  if (!current.isLiveEvent) return false;
  const money = current.monetization && typeof current.monetization === "object" ? current.monetization as LiveEventRecord : {};
  const funded = [current.confirmedCreatorPrizeFundingCents, money.confirmedCreatorPrizeFundingCents, current.confirmedSponsorContributionCents, current.confirmedEntryFeeAllocationCents].some(value => Number(value ?? 0) > 0) || Boolean(current.creatorPrizeGuaranteeLockedAt);
  if (!funded) return false;
  for (const key of ["prizeValue", "prizeType", "numberOfWinners"]) if (patch[key] !== undefined && String(patch[key]) !== String(current[key] ?? (key === "numberOfWinners" ? 1 : key === "prizeValue" ? 0 : "bragging_rights"))) return true;
  const before = eventOptions(current), after = eventOptions(patch);
  for (const key of ["eventFormat", "winnerCount"]) if (after[key] !== undefined && String(after[key]) !== String(before[key] ?? (key === "winnerCount" ? current.numberOfWinners ?? 1 : "attendance_only"))) return true;
  return false;
}
export function eventKind(event: LiveEventRecord): LiveEventKind {
  const value = eventOptions(event).eventFormat ?? event.eventFormat;
  if (value !== "attendance_only" && value !== "physical_competition") throw new LiveEventPolicyError("EVENT_FORMAT_REVIEW_REQUIRED");
  return value;
}
export function eventCapacities(event: LiveEventRecord) {
  const options = eventOptions(event);
  const total = Number(event.capacity ?? event.eventCapacity ?? event.maxParticipants);
  const competitors = eventKind(event) === "physical_competition" ? Number(options.competitorCapacity ?? event.competitorCapacity) : 0;
  if (!Number.isSafeInteger(total) || total < 1 || !Number.isSafeInteger(competitors) || competitors < 0 || competitors > total || (eventKind(event) === "physical_competition" && competitors < 1)) throw new LiveEventPolicyError("EVENT_CAPACITY_REVIEW_REQUIRED");
  return { total, audience: total - competitors, competitors };
}
export function assertEventBookingOpen(event: LiveEventRecord, now: number) {
  const options = eventOptions(event);
  const status = String(event.status ?? "").toLowerCase();
  if (!["scheduled", "approved", "active", "registration_open", "in_progress"].includes(status) || !isPublicApprovedLiveEvent(event)) throw new LiveEventPolicyError("REGISTRATION_CLOSED");
  const opens = eventTime(options.registrationOpensAt ?? event.registrationOpensAt);
  const closes = eventTime(options.registrationClosesAt ?? event.registrationClosesAt);
  const ends = eventTime(event.endsAt);
  const starts = eventTime(event.startsAt);
  if (![opens, closes, starts, ends].every(Number.isFinite) || starts >= ends || now < opens || now >= closes || now >= ends) throw new LiveEventPolicyError("REGISTRATION_CLOSED");
}
export function assertEventCheckInOpen(event: LiveEventRecord, now: number) {
  const options = eventOptions(event);
  const start = eventTime(options.checkInStartAt ?? event.checkInStartAt);
  const end = eventTime(options.checkInEndAt ?? event.checkInEndAt);
  if (event.eventApprovalStatus !== "approved" || !["scheduled", "approved", "active", "registration_open", "registration_closed", "in_progress"].includes(String(event.status)) || !Number.isFinite(start) || !Number.isFinite(end) || now < start || now >= end) throw new LiveEventPolicyError("CHECK_IN_CLOSED");
}
export function assertAvailableSpaces(event: LiveEventRecord, type: "audience" | "competitor", quantity: number) {
  const capacity = eventCapacities(event);
  const confirmed = Number(event[type === "audience" ? "audienceCount" : "competitorCount"] ?? 0);
  const reserved = Number(event[type === "audience" ? "audienceReserved" : "competitorReserved"] ?? 0);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20 || type === "competitor" && quantity !== 1) throw new LiveEventPolicyError("BOOKING_QUANTITY_INVALID", 422);
  if (![confirmed, reserved].every(value => Number.isSafeInteger(value) && value >= 0)) throw new LiveEventPolicyError("CAPACITY_RECONCILIATION_REQUIRED");
  if (confirmed + reserved + quantity > (type === "audience" ? capacity.audience : capacity.competitors)) throw new LiveEventPolicyError(type === "audience" ? "AUDIENCE_FULL" : "COMPETITION_FULL");
}
export function allocateLiveEventRevenue(admissionCents: number, entryCents: number) {
  if (![admissionCents, entryCents].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000)) throw new LiveEventPolicyError("AMOUNT_INVALID", 422);
  const admissionPlatform = Math.floor(admissionCents * 15 / 100);
  const entryWinners = Math.floor(entryCents * 65 / 100), entryCreator = Math.floor(entryCents * 20 / 100);
  return { admission: { platform: admissionPlatform, creator: admissionCents - admissionPlatform }, competition: { winners: entryWinners, creator: entryCreator, platform: entryCents - entryWinners - entryCreator } };
}
export function liveEventWinnerShares(totalCents: number, winners: number) {
  const ratios = winners === 1 ? [100] : winners === 2 ? [70, 30] : winners === 3 ? [60, 25, 15] : null;
  if (!ratios || !Number.isSafeInteger(totalCents) || totalCents < 0) throw new LiveEventPolicyError("PRIZE_CONFIGURATION_INVALID", 422);
  const shares = ratios.map(ratio => Math.floor(totalCents * ratio / 100));
  // Preserve every cent; deterministic placement order receives rounding remainders.
  let remainder = totalCents - shares.reduce((sum, value) => sum + value, 0);
  for (let index = 0; remainder > 0; index++, remainder--) shares[index % shares.length]++;
  return shares;
}
export function rankPhysicalResults(entries: Array<{ userId: string; checkedIn: boolean; eligible: boolean; scores: number[] }>, judges: number, winners: number) {
  if (!Number.isSafeInteger(judges) || judges < 1 || judges > 20 || ![1, 2, 3].includes(winners)) throw new LiveEventPolicyError("JUDGING_CONFIGURATION_INVALID", 422);
  if (new Set(entries.map(row => row.userId)).size !== entries.length) throw new LiveEventPolicyError("DUPLICATE_COMPETITOR", 422);
  const eligible = entries.filter(row => row.eligible);
  if (!eligible.length) throw new LiveEventPolicyError("NO_ELIGIBLE_COMPETITORS");
  const ranking = eligible.map(row => {
    if (!row.checkedIn || row.scores.length !== judges || row.scores.some(score => !Number.isFinite(score) || score < 0 || score > 10 || Math.abs(Math.round(score * 100) - score * 100) > 0.000001)) throw new LiveEventPolicyError("COMPLETE_PHYSICAL_SCORES_REQUIRED");
    return { userId: row.userId, score: row.scores.reduce((sum, score) => sum + Math.round(score * 100), 0) };
  }).sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId));
  for (let index = 0; index < Math.min(winners, ranking.length); index++) {
    if (index + 1 < ranking.length && ranking[index].score === ranking[index + 1].score) throw new LiveEventPolicyError("PHYSICAL_TIE_ASSESSMENT_REQUIRED");
  }
  return ranking;
}
/** Missing legacy approval or visibility is not permission to publish a record. */
export function isPublicApprovedLiveEvent(event:Record<string,unknown>){
  return event.eventApprovalStatus==="approved"&&event.visibility==="public"&&!["hidden","hidden_until_approved"].includes(String(event.eventVisibility))&&!["draft","pending_review","pending_admin_review","rejected","deleted","requires_changes","changes_requested"].includes(String(event.status));
}
