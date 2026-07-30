const PUBLIC_CHALLENGE_STATUSES = new Set([
  "published",
  "scheduled",
  "active",
  "registration_open",
  "submission_open",
  "voting_open",
  "voting_closed",
  "winners_announced",
  "completed"
]);

const PUBLIC_SUBMISSION_STATUSES = new Set(["approved", "active", "winner"]);

function pick(source: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

function hasKnownNonProductionText(data: Record<string, unknown>) {
  const known = [
    "the ultimate showdown",
    "the next model spotlight challenge",
    "next model spotlight",
    "qa pending challenge",
    "qa flagged challenge",
    "qa completed challenge",
    "neon city photo battle",
    "street dance finals",
    "rainline reflections"
  ];
  return [data.title, data.name, data.challengeTitle, data.displayName, data.description].some((value) => {
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    return known.some((item) => normalized.includes(item));
  });
}

export function isQaOrDemoRecord(id: string, data: Record<string, unknown>) {
  const normalizedId = id.toLowerCase();
  return hasKnownNonProductionText(data)
    || normalizedId.startsWith("demo-")
    || normalizedId.startsWith("qa-")
    || normalizedId.startsWith("qa_")
    || data.isQaSeed === true
    || data.isDemo === true
    || data.demo === true
    || data.isTest === true
    || data.test === true
    || data.isMock === true
    || data.mock === true
    || data.isPlaceholder === true
    || data.placeholder === true
    || data.createdFor === "admin_qa";
}

export function isQaDemoOrPlaceholderProfile(id: string, data: Record<string, unknown>) {
  if (isQaOrDemoRecord(id, data)) return true;
  const fields = [
    data.displayName,
    data.name,
    data.username,
    data.email,
    data.userName,
    data.userDisplayName
  ];
  return fields.some((value) => {
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    return /(^|[\s._-])(demo|sample|placeholder|mock|test|qa)([\s._-]|$)/.test(normalized)
      || normalized.endsWith("@example.com")
      || normalized.endsWith("@test.com")
      || normalized.endsWith(".test");
  });
}

export function isPublicChallenge(id: string, data: Record<string, unknown>) {
  if (isQaOrDemoRecord(id, data)) return false;
  const status = String(data.status ?? data.lifecycleStatus ?? "").toLowerCase();
  const visibility = String(data.visibility ?? "public").toLowerCase();
  const type = String(data.type ?? "").toLowerCase();
  return PUBLIC_CHALLENGE_STATUSES.has(status)
    && visibility === "public"
    && !type.includes("private")
    && !type.includes("exclusive")
    && !type.includes("invite")
    && data.publicVisibility !== false
    && data.eventVisibility !== "hidden_until_approved";
}

export function isPublicSubmission(id: string, data: Record<string, unknown>) {
  if (isQaOrDemoRecord(id, data)) return false;
  const status = String(data.status ?? "").toLowerCase();
  const visibility = String(data.visibility ?? "public").toLowerCase();
  return PUBLIC_SUBMISSION_STATUSES.has(status)
    && visibility === "public"
    && data.publicVisibility !== false;
}

export function publicChallengeFields(data: Record<string, unknown>) {
  return pick(data, [
    "title", "description", "category", "type", "visibility", "status", "lifecycleStatus",
    "computedStatus", "startsAt", "endsAt", "submissionStartAt", "submissionDeadline", "registrationDeadline", "timezone", "timeZone",
    "votingStartsAt", "votingDeadline", "votingEndsAt", "winnerAnnouncementAt", "acceptedSubmissionTypes",
    "competitionFormat", "bestOf", "votingSettings", "rules", "standardRules",
    "challengeGuidelines", "prizeType", "prizeTitle", "prizeDescription", "publicPrizeStatus",
    "participantCount", "submissionCount", "voteCount", "weightedVoteCount", "coverImageUrl",
    "promoImageUrl", "trailerVideoUrl", "promoVideoUrl", "mediaUploadStatus", "mediaStatus",
    "usesPlaceholderMedia", "mediaFallbackType", "mediaStorageStatus", "isLiveEvent", "venueName",
    "eventCity", "eventState", "eventCountry", "eventCapacity", "tournamentType",
    "divisionFormat", "maxParticipants", "scoringMode", "sponsorEnabled", "creatorName",
    "creatorUsername", "creatorAvatarUrl", "resultsConfirmed", "settlementPrepared", "settlementStatus",
    "publishedAt", "createdAt", "updatedAt"
  ]);
}

export function publicSubmissionFields(data: Record<string, unknown>) {
  return pick(data, [
    "challengeId", "title", "description", "mediaUrl", "mediaType", "thumbnailUrl",
    "status", "submittedAt", "createdAt", "updatedAt", "voteCount", "weightedVoteCount",
    "participantName", "displayName", "username", "avatarUrl", "planBadge"
  ]);
}
