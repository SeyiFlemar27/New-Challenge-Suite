import type { Challenge } from "./types";

export type CanonicalChallengeStatus =
  | "draft"
  | "pending_review"
  | "scheduled"
  | "registration_not_open"
  | "registration_open"
  | "registration_closed"
  | "active"
  | "submission_open"
  | "submission_closed"
  | "voting_not_open"
  | "voting_open"
  | "voting_closed"
  | "under_review"
  | "winners_announced"
  | "completed"
  | "paused"
  | "postponed"
  | "cancelled";

export type LegacyChallengeStatus = "published" | "registration_open" | "voting" | "upcoming";

export type ChallengeDisplayStatus =
  | "Draft"
  | "Pending Review"
  | "Scheduled"
  | "Registration Not Open"
  | "Registration Open"
  | "Registration Closed"
  | "Active"
  | "Submissions Open"
  | "Submissions Closed"
  | "Voting Not Open"
  | "Voting Open"
  | "Voting Closed"
  | "Under Review"
  | "Winners Announced"
  | "Completed"
  | "Paused"
  | "Postponed"
  | "Cancelled"
  | "Open"
  | "Closing Soon"
  | "Closed";

export type ParticipationStatus =
  | "not_joinable"
  | "registration_not_open"
  | "registration_open"
  | "registration_closing_soon"
  | "registration_closed"
  | "late_joining_open"
  | "challenge_in_progress"
  | "challenge_full"
  | "challenge_ended"
  | "cancelled"
  | "paused"
  | "postponed";

export type SubmissionWindowStatus = "submissions_not_open" | "submissions_open" | "submissions_closed" | "no_submission_required";
export type VotingWindowStatus = "voting_not_open" | "voting_open" | "voting_closed" | "voting_not_enabled";
export type LivestreamWindowStatus = "livestream_not_scheduled" | "livestream_scheduled" | "livestream_live" | "livestream_paused" | "livestream_ended" | "replay_available" | "replay_unavailable";

export interface ChallengeLifecycleViewerContext {
  isOwner?: boolean;
  isAdmin?: boolean;
  hasJoined?: boolean;
}

export interface ChallengeTimelineWarning {
  code: string;
  field: string;
  message: string;
}

export interface ChallengeLifecycleState {
  primaryStatus: CanonicalChallengeStatus;
  primaryLabel: ChallengeDisplayStatus;
  participationStatus: ParticipationStatus;
  submissionStatus: SubmissionWindowStatus;
  votingStatus: VotingWindowStatus;
  livestreamStatus: LivestreamWindowStatus;
  canJoin: boolean;
  canSubmit: boolean;
  canVote: boolean;
  canWatchLive: boolean;
  canEdit: boolean;
  canCancel: boolean;
  nextMilestone: string | null;
  nextMilestoneAt: Date | null;
  reasonCode: string;
  userFacingMessage: string;
  actionLabel: string;
  disabledReason: string | null;
  timelineWarnings: ChallengeTimelineWarning[];
}

interface NormalizedTimeline {
  timezone: string;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  submissionOpensAt: Date | null;
  submissionClosesAt: Date | null;
  challengeStartsAt: Date | null;
  challengeEndsAt: Date | null;
  votingOpensAt: Date | null;
  votingClosesAt: Date | null;
  judgingStartsAt: Date | null;
  judgingEndsAt: Date | null;
  winnersAnnouncedAt: Date | null;
  livestreamStartsAt: Date | null;
  livestreamEndsAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  publishedAt: Date | null;
  cancelledAt: Date | null;
  completedAt: Date | null;
}

export const challengeStatusLabels: Record<CanonicalChallengeStatus, ChallengeDisplayStatus> = {
  draft: "Draft",
  pending_review: "Pending Review",
  scheduled: "Scheduled",
  registration_not_open: "Registration Not Open",
  registration_open: "Registration Open",
  registration_closed: "Registration Closed",
  active: "Active",
  submission_open: "Submissions Open",
  submission_closed: "Submissions Closed",
  voting_not_open: "Voting Not Open",
  voting_open: "Voting Open",
  voting_closed: "Voting Closed",
  under_review: "Under Review",
  winners_announced: "Winners Announced",
  completed: "Completed",
  paused: "Paused",
  postponed: "Postponed",
  cancelled: "Cancelled"
};

const activeDashboardStatuses = new Set<CanonicalChallengeStatus | LegacyChallengeStatus>([
  "pending_review",
  "scheduled",
  "registration_not_open",
  "registration_open",
  "registration_closed",
  "active",
  "submission_open",
  "submission_closed",
  "voting_not_open",
  "voting_open",
  "voting_closed",
  "under_review",
  "published",
  "registration_open",
  "voting",
  "upcoming"
]);

const sponsorEligibleStatuses = new Set<CanonicalChallengeStatus | LegacyChallengeStatus>([
  "pending_review",
  "scheduled",
  "registration_not_open",
  "registration_open",
  "active",
  "submission_open",
  "voting_open",
  "published",
  "voting",
  "upcoming"
]);

const boostEligibleStatuses = new Set<CanonicalChallengeStatus | LegacyChallengeStatus>([
  "scheduled",
  "registration_not_open",
  "registration_open",
  "active",
  "submission_open",
  "voting_open",
  "published",
  "registration_open",
  "voting",
  "upcoming"
]);

const publicChallengeStatuses = new Set<CanonicalChallengeStatus | LegacyChallengeStatus>([
  "pending_review",
  "scheduled",
  "registration_not_open",
  "registration_open",
  "registration_closed",
  "active",
  "submission_open",
  "submission_closed",
  "voting_not_open",
  "voting_open",
  "voting_closed",
  "under_review",
  "winners_announced",
  "completed",
  "published",
  "registration_open",
  "voting",
  "upcoming"
]);

const votableSubmissionStatuses = new Set(["active", "approved", "winner"]);
const unavailableSubmissionStatuses = new Set(["draft", "submitted", "pending_review", "pending_approval", "rejected", "flagged", "removed", "private", "withdrawn", "disqualified", "eliminated"]);
const terminalStatuses = new Set<CanonicalChallengeStatus>(["cancelled", "paused", "postponed", "completed"]);

export function normalizeChallengeLifecycleStatus(status: unknown): CanonicalChallengeStatus {
  const value = String(status ?? "draft").toLowerCase();
  if (value === "published") return "active";
  if (value === "registration_open") return "registration_open";
  if (value === "voting") return "voting_open";
  if (value === "upcoming") return "scheduled";
  if (isCanonicalChallengeStatus(value)) return value;
  return "draft";
}

export function isLegacyChallengeStatus(status: unknown): status is LegacyChallengeStatus {
  return status === "published" || status === "registration_open" || status === "voting" || status === "upcoming";
}

export function isCanonicalChallengeStatus(status: unknown): status is CanonicalChallengeStatus {
  return [
    "draft",
    "pending_review",
    "scheduled",
    "registration_not_open",
    "registration_open",
    "registration_closed",
    "active",
    "submission_open",
    "submission_closed",
    "voting_not_open",
    "voting_open",
    "voting_closed",
    "under_review",
    "winners_announced",
    "completed",
    "paused",
    "postponed",
    "cancelled"
  ].includes(String(status));
}

export function isChallengeActiveForDashboard(status: unknown) {
  return activeDashboardStatuses.has(String(status ?? "").toLowerCase() as CanonicalChallengeStatus | LegacyChallengeStatus);
}

export function isChallengeEligibleForBoost(status: unknown) {
  return boostEligibleStatuses.has(String(status ?? "").toLowerCase() as CanonicalChallengeStatus | LegacyChallengeStatus);
}

export function isChallengeEligibleForSponsorship(status: unknown) {
  return sponsorEligibleStatuses.has(String(status ?? "").toLowerCase() as CanonicalChallengeStatus | LegacyChallengeStatus);
}

export function isPublicChallengeStatus(status: unknown) {
  return publicChallengeStatuses.has(String(status ?? "").toLowerCase() as CanonicalChallengeStatus | LegacyChallengeStatus);
}

export function normalizeSubmissionLifecycleStatus(status: unknown) {
  const value = String(status ?? "draft").toLowerCase();
  if (value === "pending_approval") return "pending_review";
  return value;
}

export function isSubmissionUnavailableForVoting(status: unknown) {
  return unavailableSubmissionStatuses.has(String(status ?? "").toLowerCase());
}

export function isSubmissionVotableStatus(status: unknown) {
  return votableSubmissionStatuses.has(normalizeSubmissionLifecycleStatus(status));
}

export function normalizeChallengeDate(value: unknown, boundary: "start" | "end" = "start"): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object") {
    const maybeTimestamp = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof maybeTimestamp.toDate === "function") {
      const date = maybeTimestamp.toDate();
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const seconds = typeof maybeTimestamp.seconds === "number" ? maybeTimestamp.seconds : maybeTimestamp._seconds;
    if (typeof seconds === "number") {
      const date = new Date(seconds * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value > 9_999_999_999 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const source = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T${boundary === "end" ? "23:59:59.999" : "00:00:00.000"}Z`
    : trimmed;
  const date = new Date(source);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function compareChallengeDates(left: unknown, right: unknown) {
  const a = normalizeChallengeDate(left);
  const b = normalizeChallengeDate(right);
  if (!a || !b) return null;
  return a.getTime() === b.getTime() ? 0 : a.getTime() < b.getTime() ? -1 : 1;
}

export function getLifecycleLabel(status: CanonicalChallengeStatus): ChallengeDisplayStatus {
  return challengeStatusLabels[status] ?? "Scheduled";
}

export function getLifecycleAction(status: CanonicalChallengeStatus) {
  if (status === "registration_not_open") return "Registration Opens";
  if (status === "registration_open" || status === "submission_open" || status === "active") return "Join Challenge";
  if (status === "voting_not_open") return "Voting Opens";
  if (status === "voting_open") return "Vote Now";
  if (status === "winners_announced") return "View Results";
  if (status === "completed") return "Challenge Ended";
  if (status === "cancelled") return "Challenge Cancelled";
  if (status === "paused") return "Challenge Paused";
  if (status === "postponed") return "Challenge Postponed";
  return getLifecycleLabel(status);
}

export function getNextMilestone(challenge: Challenge | Record<string, unknown>, now = new Date()) {
  const timeline = normalizeTimeline(challenge as Record<string, unknown>);
  const milestones = [
    ["registration_opens", timeline.registrationOpensAt],
    ["registration_closes", timeline.registrationClosesAt],
    ["submissions_open", timeline.submissionOpensAt],
    ["submissions_close", timeline.submissionClosesAt],
    ["challenge_starts", timeline.challengeStartsAt],
    ["voting_opens", timeline.votingOpensAt],
    ["voting_closes", timeline.votingClosesAt],
    ["challenge_ends", timeline.challengeEndsAt],
    ["winners_announced", timeline.winnersAnnouncedAt]
  ] as const;
  return milestones.find(([, date]) => date && date.getTime() > now.getTime()) ?? [null, null] as const;
}

export function getChallengeLifecycleState(challenge: Challenge | Record<string, unknown>, now = new Date(), viewerContext: ChallengeLifecycleViewerContext = {}): ChallengeLifecycleState {
  const record = challenge as Record<string, unknown>;
  const persisted = normalizeChallengeLifecycleStatus(record.status ?? record.lifecycleStatus);
  const timeline = normalizeTimeline(record);
  const warnings = timelineWarnings(timeline);
  const maxParticipants = Number(record.maxParticipants ?? record.participantLimit ?? 0);
  const participantCount = Number(record.participantCount ?? record.participants ?? 0);
  const isFull = maxParticipants > 0 && participantCount >= maxParticipants;
  const lateJoiningAllowed = record.allowLateRegistration === true || record.lateRegistrationEnabled === true || record.allowLateEntries === true;

  const submissionStatus = resolveSubmissionStatus(record, timeline, now);
  const votingStatus = resolveVotingStatus(record, timeline, now, persisted);
  const livestreamStatus = resolveLivestreamStatus(record, timeline, now);
  const primaryStatus = resolvePrimaryStatus(persisted, timeline, now, submissionStatus, votingStatus);
  const next = getNextMilestone(record, now);
  const nextMilestone = next[0];
  const nextMilestoneAt = next[1];

  let participationStatus: ParticipationStatus = "not_joinable";
  let canJoin = false;
  let actionLabel: string = getLifecycleAction(primaryStatus);
  let disabledReason: string | null = null;
  let reasonCode: string = primaryStatus.toUpperCase();
  let userFacingMessage: string = getLifecycleLabel(primaryStatus);

  if (persisted === "cancelled") {
    participationStatus = "cancelled";
    actionLabel = "Challenge Cancelled";
    disabledReason = "This challenge has been cancelled.";
    userFacingMessage = disabledReason;
  } else if (persisted === "paused") {
    participationStatus = "paused";
    actionLabel = "Challenge Paused";
    disabledReason = "This challenge is paused.";
    userFacingMessage = disabledReason;
  } else if (persisted === "postponed") {
    participationStatus = "postponed";
    actionLabel = "Challenge Postponed";
    disabledReason = "This challenge has been postponed.";
    userFacingMessage = disabledReason;
  } else if (persisted === "completed" || primaryStatus === "completed" || primaryStatus === "winners_announced") {
    participationStatus = "challenge_ended";
    actionLabel = primaryStatus === "winners_announced" ? "View Results" : "Challenge Ended";
    disabledReason = "This challenge has ended.";
    userFacingMessage = disabledReason;
  } else if (isFull) {
    participationStatus = "challenge_full";
    actionLabel = "Challenge Full";
    disabledReason = "This challenge is full.";
    userFacingMessage = disabledReason;
    reasonCode = "CHALLENGE_FULL";
  } else if (timeline.registrationOpensAt && now < timeline.registrationOpensAt) {
    participationStatus = "registration_not_open";
    actionLabel = `Registration Opens ${formatMilestoneDate(timeline.registrationOpensAt)}`;
    disabledReason = "Registration has not opened yet.";
    userFacingMessage = disabledReason;
    reasonCode = "REGISTRATION_NOT_OPEN";
  } else if (timeline.registrationClosesAt && now <= timeline.registrationClosesAt) {
    participationStatus = closesSoon(timeline.registrationClosesAt, now) ? "registration_closing_soon" : "registration_open";
    canJoin = true;
    actionLabel = "Join Challenge";
    userFacingMessage = closesSoon(timeline.registrationClosesAt, now) ? `Registration closes ${formatMilestoneDate(timeline.registrationClosesAt)}.` : "Registration is open.";
    reasonCode = "REGISTRATION_OPEN";
  } else if (timeline.challengeStartsAt && now < timeline.challengeStartsAt) {
    participationStatus = "registration_closed";
    actionLabel = "Registration Closed";
    disabledReason = "Registration is closed for this challenge.";
    userFacingMessage = disabledReason;
    reasonCode = "REGISTRATION_CLOSED";
  } else if (timeline.challengeEndsAt && now > timeline.challengeEndsAt) {
    participationStatus = "challenge_ended";
    actionLabel = "Challenge Ended";
    disabledReason = "This challenge has ended.";
    userFacingMessage = disabledReason;
    reasonCode = "CHALLENGE_ENDED";
  } else if (lateJoiningAllowed && ["active", "submission_open"].includes(primaryStatus)) {
    participationStatus = "late_joining_open";
    canJoin = true;
    actionLabel = "Join Challenge";
    userFacingMessage = "Late entry is open for this challenge.";
    reasonCode = "LATE_JOINING_OPEN";
  } else if (["active", "submission_open"].includes(primaryStatus)) {
    participationStatus = "challenge_in_progress";
    actionLabel = "Challenge in Progress";
    disabledReason = "This challenge is already in progress.";
    userFacingMessage = disabledReason;
    reasonCode = "CHALLENGE_IN_PROGRESS";
  } else if (persisted === "active" || persisted === "submission_open" || persisted === "registration_open") {
    canJoin = true;
    participationStatus = "registration_open";
    actionLabel = "Join Challenge";
    userFacingMessage = "Registration is open.";
    reasonCode = "REGISTRATION_OPEN";
  } else {
    disabledReason = "This challenge is not open for registration.";
    userFacingMessage = disabledReason;
    reasonCode = "NOT_JOINABLE";
  }

  const noSubmissionRequired = submissionStatus === "no_submission_required";
  const canSubmit = submissionStatus === "submissions_open" && !terminalStatuses.has(persisted) && primaryStatus !== "pending_review" && primaryStatus !== "draft";
  const canVote = votingStatus === "voting_open" && !terminalStatuses.has(persisted);
  const canWatchLive = livestreamStatus === "livestream_live";
  const canEdit = viewerContext.isOwner === true || viewerContext.isAdmin === true ? !["cancelled", "completed"].includes(persisted) : false;
  const canCancel = viewerContext.isOwner === true || viewerContext.isAdmin === true ? !["cancelled", "completed"].includes(persisted) : false;

  if (noSubmissionRequired && canJoin) {
    userFacingMessage = "Registration is open. No media submission is required.";
  }

  return {
    primaryStatus,
    primaryLabel: getLifecycleLabel(primaryStatus),
    participationStatus,
    submissionStatus,
    votingStatus,
    livestreamStatus,
    canJoin,
    canSubmit,
    canVote,
    canWatchLive,
    canEdit,
    canCancel,
    nextMilestone,
    nextMilestoneAt,
    reasonCode,
    userFacingMessage,
    actionLabel,
    disabledReason,
    timelineWarnings: warnings
  };
}

export function getChallengeDisplayStatus(challenge: Challenge | Record<string, unknown>, now = new Date()): ChallengeDisplayStatus {
  const lifecycle = getChallengeLifecycleState(challenge, now);
  if (lifecycle.primaryStatus === "registration_open") return lifecycle.participationStatus === "registration_closing_soon" ? "Closing Soon" : "Open";
  if (lifecycle.primaryStatus === "registration_closed") return "Registration Closed";
  return lifecycle.primaryLabel;
}

export function canJoinChallenge(challenge: Challenge | Record<string, unknown>, now = new Date()) {
  return getChallengeLifecycleState(challenge, now).canJoin;
}

export function canVoteOnChallenge(challenge: Challenge | Record<string, unknown>, now = new Date()) {
  return getChallengeLifecycleState(challenge, now).canVote;
}

export function canSubmitToChallenge(challenge: Challenge | Record<string, unknown>, now = new Date()) {
  return getChallengeLifecycleState(challenge, now).canSubmit;
}

export function statusClassName(status: ChallengeDisplayStatus | CanonicalChallengeStatus) {
  const value = String(status).toLowerCase().replaceAll(" ", "_");
  if (["open", "registration_open", "active", "submission_open", "submissions_open"].includes(value)) return "bg-emerald-500 text-black";
  if (value === "closing_soon") return "bg-yellow-400 text-black";
  if (value === "voting_open") return "bg-indigo-500 text-white";
  if (["pending_review", "under_review", "scheduled", "registration_not_open", "voting_not_open"].includes(value)) return "bg-yellow-500 text-black";
  if (["cancelled", "paused", "postponed"].includes(value)) return "bg-red-900 text-red-100";
  return "bg-slate-700 text-white";
}

function normalizeTimeline(record: Record<string, unknown>): NormalizedTimeline {
  const timeLimitedUploads = isRecord(record.timeLimitedUploads) ? record.timeLimitedUploads : {};
  return {
    timezone: String(record.timezone ?? record.timeZone ?? "UTC"),
    registrationOpensAt: firstDate(record, ["registrationOpensAt", "registrationStartsAt", "registrationOpenAt", "registrationStartDate"], "start"),
    registrationClosesAt: firstDate(record, ["registrationClosesAt", "registrationDeadline", "registrationEndsAt", "registrationEndDate"], "end"),
    submissionOpensAt: firstDate(record, ["submissionOpensAt", "submissionStartsAt", "submissionsOpenAt", "submissionStartDate"], "start") ?? normalizeChallengeDate(timeLimitedUploads.startsAt, "start"),
    submissionClosesAt: firstDate(record, ["submissionClosesAt", "submissionDeadline", "submissionsCloseAt", "submissionEndDate"], "end") ?? normalizeChallengeDate(timeLimitedUploads.endsAt, "end"),
    challengeStartsAt: firstDate(record, ["challengeStartsAt", "startsAt", "startDate"], "start"),
    challengeEndsAt: firstDate(record, ["challengeEndsAt", "endsAt", "endDate"], "end"),
    votingOpensAt: firstDate(record, ["votingOpensAt", "votingStartsAt", "votingStartDate"], "start"),
    votingClosesAt: firstDate(record, ["votingClosesAt", "votingDeadline", "votingEndsAt", "votingEndDate"], "end"),
    judgingStartsAt: firstDate(record, ["judgingStartsAt", "judgingStartDate"], "start"),
    judgingEndsAt: firstDate(record, ["judgingEndsAt", "judgingEndDate"], "end"),
    winnersAnnouncedAt: firstDate(record, ["winnersAnnouncedAt", "winnerAnnouncementAt", "winnerAnnouncementDate"], "start"),
    livestreamStartsAt: firstDate(record, ["livestreamStartsAt", "livestreamStartAt", "externalLiveOpensAt", "liveStartsAt"], "start"),
    livestreamEndsAt: firstDate(record, ["livestreamEndsAt", "livestreamEndAt", "liveEndsAt"], "end"),
    createdAt: firstDate(record, ["createdAt"], "start"),
    updatedAt: firstDate(record, ["updatedAt"], "start"),
    publishedAt: firstDate(record, ["publishedAt"], "start"),
    cancelledAt: firstDate(record, ["cancelledAt"], "start"),
    completedAt: firstDate(record, ["completedAt"], "start")
  };
}

function firstDate(record: Record<string, unknown>, fields: string[], boundary: "start" | "end") {
  for (const field of fields) {
    const date = normalizeChallengeDate(record[field], boundary);
    if (date) return date;
  }
  return null;
}

function resolvePrimaryStatus(persisted: CanonicalChallengeStatus, timeline: NormalizedTimeline, now: Date, submissionStatus: SubmissionWindowStatus, votingStatus: VotingWindowStatus): CanonicalChallengeStatus {
  if (terminalStatuses.has(persisted)) return persisted;
  if (persisted === "draft" || persisted === "pending_review" || persisted === "paused" || persisted === "postponed" || persisted === "cancelled") return persisted;
  if (persisted === "winners_announced") return "winners_announced";
  if (timeline.winnersAnnouncedAt && now >= timeline.winnersAnnouncedAt) return "winners_announced";
  if (votingStatus === "voting_open") return "voting_open";
  if (submissionStatus === "submissions_open") return "submission_open";
  if (timeline.challengeStartsAt && now < timeline.challengeStartsAt) {
    if (timeline.registrationOpensAt && now < timeline.registrationOpensAt) return "registration_not_open";
    if (timeline.registrationClosesAt && now <= timeline.registrationClosesAt) return "registration_open";
    if (timeline.registrationClosesAt && now > timeline.registrationClosesAt) return "registration_closed";
    return "scheduled";
  }
  if (votingStatus === "voting_not_open") return "voting_not_open";
  if (votingStatus === "voting_closed") return "voting_closed";
  if (timeline.challengeEndsAt && now > timeline.challengeEndsAt) {
    if (persisted === "under_review") return "under_review";
    return "completed";
  }
  if (submissionStatus === "submissions_closed") return "submission_closed";
  if (persisted === "scheduled" && !timeline.challengeStartsAt) return "scheduled";
  if (persisted === "registration_open") return "registration_open";
  if (["active", "submission_open"].includes(persisted)) return "active";
  return persisted === "scheduled" ? "scheduled" : "active";
}

function resolveSubmissionStatus(record: Record<string, unknown>, timeline: NormalizedTimeline, now: Date): SubmissionWindowStatus {
  const accepted = Array.isArray(record.acceptedSubmissionTypes) ? record.acceptedSubmissionTypes : [];
  const noSubmissionRequired = record.submissionRequired === false || record.requiresSubmission === false || String(record.competitionFormat ?? "").toLowerCase().includes("no submission") || accepted.includes("none");
  if (noSubmissionRequired) return "no_submission_required";
  const opensAt = timeline.submissionOpensAt ?? timeline.challengeStartsAt;
  const closesAt = timeline.submissionClosesAt ?? timeline.challengeEndsAt;
  if (opensAt && now < opensAt) return "submissions_not_open";
  if (closesAt && now > closesAt) return "submissions_closed";
  if (opensAt || closesAt) return "submissions_open";
  const persisted = normalizeChallengeLifecycleStatus(record.status ?? record.lifecycleStatus);
  if (persisted === "registration_open" || persisted === "registration_not_open" || persisted === "registration_closed") return "submissions_not_open";
  if (["active", "submission_open"].includes(persisted)) return "submissions_open";
  return "submissions_not_open";
}

function resolveVotingStatus(record: Record<string, unknown>, timeline: NormalizedTimeline, now: Date, persisted: CanonicalChallengeStatus): VotingWindowStatus {
  const votingSettings = isRecord(record.votingSettings) ? record.votingSettings : {};
  const votingEnabled = record.votingEnabled === true || votingSettings.enabled === true || Boolean(timeline.votingOpensAt || timeline.votingClosesAt) || persisted === "voting_open" || persisted === "voting_closed";
  if (!votingEnabled) return "voting_not_enabled";
  if (persisted === "voting_open") return "voting_open";
  if (persisted === "voting_closed") return "voting_closed";
  if (timeline.votingOpensAt && now < timeline.votingOpensAt) return "voting_not_open";
  if (timeline.votingClosesAt && now > timeline.votingClosesAt) return "voting_closed";
  if (timeline.votingOpensAt || timeline.votingClosesAt) return "voting_open";
  return "voting_not_open";
}

function resolveLivestreamStatus(record: Record<string, unknown>, timeline: NormalizedTimeline, now: Date): LivestreamWindowStatus {
  const streamStatus = String(record.streamStatus ?? record.externalLiveStatus ?? "").toLowerCase();
  const hasStreamUrl = Boolean(record.livestreamUrl || record.livestreamEmbedUrl || record.externalLiveUrl);
  const replayEnabled = record.replayEnabled === true;
  const hasReplay = Boolean(record.replayUrl || record.recordingUrl);
  const livestreamEnabled = record.livestreamEnabled === true || record.externalLiveEnabled === true || hasStreamUrl || Boolean(timeline.livestreamStartsAt || timeline.livestreamEndsAt);
  if (!livestreamEnabled) return "livestream_not_scheduled";
  if (streamStatus === "paused") return "livestream_paused";
  if (streamStatus === "live" && hasStreamUrl) return "livestream_live";
  if (streamStatus === "ended") return replayEnabled && hasReplay ? "replay_available" : "replay_unavailable";
  if (timeline.livestreamStartsAt && now < timeline.livestreamStartsAt) return "livestream_scheduled";
  if (timeline.livestreamEndsAt && now > timeline.livestreamEndsAt) return replayEnabled && hasReplay ? "replay_available" : "livestream_ended";
  if (timeline.livestreamStartsAt && now >= timeline.livestreamStartsAt && (!timeline.livestreamEndsAt || now <= timeline.livestreamEndsAt) && hasStreamUrl) return "livestream_live";
  return "livestream_scheduled";
}

function timelineWarnings(timeline: NormalizedTimeline): ChallengeTimelineWarning[] {
  const warnings: ChallengeTimelineWarning[] = [];
  if (!timeline.challengeStartsAt) warnings.push({ code: "MISSING_CHALLENGE_START", field: "challengeStartsAt", message: "Challenge start time is missing or ambiguous." });
  if (!timeline.challengeEndsAt) warnings.push({ code: "MISSING_CHALLENGE_END", field: "challengeEndsAt", message: "Challenge end time is missing or ambiguous." });
  if (timeline.registrationOpensAt && timeline.registrationClosesAt && timeline.registrationOpensAt > timeline.registrationClosesAt) warnings.push({ code: "REGISTRATION_DATES_REVERSED", field: "registrationClosesAt", message: "Registration closes before it opens." });
  if (timeline.challengeStartsAt && timeline.challengeEndsAt && timeline.challengeStartsAt > timeline.challengeEndsAt) warnings.push({ code: "CHALLENGE_DATES_REVERSED", field: "challengeEndsAt", message: "Challenge ends before it starts." });
  if (timeline.submissionOpensAt && timeline.submissionClosesAt && timeline.submissionOpensAt > timeline.submissionClosesAt) warnings.push({ code: "SUBMISSION_DATES_REVERSED", field: "submissionClosesAt", message: "Submissions close before they open." });
  if (timeline.votingOpensAt && timeline.votingClosesAt && timeline.votingOpensAt > timeline.votingClosesAt) warnings.push({ code: "VOTING_DATES_REVERSED", field: "votingClosesAt", message: "Voting closes before it opens." });
  return warnings;
}

function closesSoon(date: Date, now: Date) {
  const msUntilClose = date.getTime() - now.getTime();
  return msUntilClose > 0 && msUntilClose <= 1000 * 60 * 60 * 24 * 2;
}

function formatMilestoneDate(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}




