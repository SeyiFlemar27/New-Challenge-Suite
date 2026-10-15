import { getChallengeLifecycleState } from "@/lib/challenge-status";

/** Access enrollment is independent of paid admission and remaining capacity. */
export function privateEnrollmentOpen(challenge: Record<string, unknown>, now = new Date()) {
  const status = String(challenge.status ?? challenge.lifecycleStatus ?? "").toLowerCase();
  if (!["published", "approved", "scheduled", "registration_open", "active", "submission_open"].includes(status)) return false;
  const start = challenge.registrationOpensAt ?? challenge.registrationStartAt;
  const end = challenge.registrationDeadline ?? challenge.registrationClosesAt ?? challenge.registrationEndsAt;
  const startAt = start ? new Date(String(start)).getTime() : -Infinity;
  const endAt = end ? new Date(String(end)).getTime() : NaN;
  return startAt <= now.getTime() && Number.isFinite(endAt) && now.getTime() < endAt;
}

export function privateAccessDenied(request: Record<string, unknown> = {}, grant: Record<string, unknown> = {}) {
  return [request.status, grant.status].some((status) => ["rejected", "revoked"].includes(String(status)));
}

export function privatePublicVotingOpen(challenge: Record<string, unknown>, now = new Date()) {
  return challenge.publicPreviewEnabled === true && challenge.privateVotingAccess === "public_voting"
    && getChallengeLifecycleState(challenge, now).canVote;
}

export function privateLockedPreview(challenge: Record<string, unknown>) {
  return {
    id: String(challenge.id ?? ""), title: String(challenge.title ?? "Private Challenge"),
    coverImage: String(challenge.coverImage ?? challenge.coverImageUrl ?? ""),
    creatorId: String(challenge.creatorId ?? challenge.hostId ?? ""),
    creatorName: String(challenge.creatorName ?? challenge.hostName ?? ""),
    description: String(challenge.description ?? "").slice(0, 180),
    locked: true, visibility: "private", publicPreviewEnabled: true,
    canRequestAccess: challenge.privateJoiningPolicy === "invite_and_request" && privateEnrollmentOpen(challenge), publicVotingAvailable: privatePublicVotingOpen(challenge)
  };
}
