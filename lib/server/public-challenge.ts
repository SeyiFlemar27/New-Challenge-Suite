import { isPublicChallengeStatus } from "@/lib/challenge-status";
import { challengeMediaDeliveryUrl, isFirebaseStorageDownloadUrl } from "@/lib/server/challenge-media-delivery";

const PUBLIC_SUBMISSION_STATUSES = new Set(["approved", "active", "winner"]);

function pick(source: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isRetiredHybridCompetition(record: Record<string, unknown>) {
  const operations = record.hostOperations && typeof record.hostOperations === "object"
    ? record.hostOperations as Record<string, unknown>
    : {};
  return normalized(record.type).includes("hybrid competition")
    || normalized(record.competitionType).includes("hybrid competition")
    || normalized(record.competitionFormat).includes("hybrid qualification")
    || operations.hybridCompetition === true;
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
  if (isRetiredHybridCompetition(data)) return false;
  const status = String(data.status ?? data.lifecycleStatus ?? "").toLowerCase();
  const visibility = String(data.visibility ?? "public").toLowerCase();
  const type = String(data.type ?? "").toLowerCase();
  return isPublicChallengeStatus(status)
    && visibility === "public"
    && !type.includes("private") && !type.includes("exclusive") && !type.includes("invite")
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

function privateRecord(data: Record<string, unknown>) {
  const visibility = normalized(data.visibility ?? data.type);
  const type = normalized(data.type);
  return visibility.includes("private") || visibility.includes("exclusive") || visibility.includes("invite")
    || type.includes("private") || type.includes("exclusive") || type.includes("invite");
}

function mediaUrl(data: Record<string, unknown>, pathField: string, urlField: string) {
  const path = data[pathField];
  if (typeof path === "string" && path.trim()) return challengeMediaDeliveryUrl(path.trim());
  const url = data[urlField];
  return privateRecord(data) || isFirebaseStorageDownloadUrl(url) ? null : url ?? null;
}

export function publicChallengeFields(data: Record<string, unknown>, challengeId?: string) {
  const result = pick(data, [
    "title", "shortDescription", "description", "category", "subcategory", "type", "visibility", "status", "lifecycleStatus", "builderVersion",
    "computedStatus", "startsAt", "endsAt", "submissionStartAt", "submissionDeadline", "registrationDeadline", "timezone", "timeZone",
    "votingStartsAt", "votingDeadline", "votingEndsAt", "winnerAnnouncementAt", "acceptedSubmissionTypes",
    "competitionFormat", "bestOf", "votingSettings", "rules", "standardRules",
    "challengeGuidelines", "submissionInstructionsList", "challengeRules", "prizeType", "prizeTitle", "prizeDescription", "prizeCurrency", "numberOfWinners", "winnerPrizeAmountsCents", "publicPrizeStatus",
    "participantCount", "submissionCount", "voteCount", "weightedVoteCount", "coverImageUrl",
    "challengeImages", "challengeVideo", "promoImageUrl", "trailerVideoUrl", "promoVideoUrl", "mediaUploadStatus", "mediaStatus",
    "usesPlaceholderMedia", "mediaFallbackType", "mediaStorageStatus", "isLiveEvent", "venueName",
    "eventCity", "eventState", "eventCountry", "eventCapacity", "tournamentType",
    "divisionFormat", "maxParticipants", "capacityMode", "waitlistEnabled", "locationEligibility", "eligibleCountries", "ageRestrictionMode", "minimumAge", "hideParticipantList", "scoringMode", "sponsorEnabled", "creatorName",
    "publicPreviewEnabled", "privateAccessMethod",
    "creatorUsername", "creatorAvatarUrl", "resultsConfirmed", "settlementPrepared", "settlementStatus",
    "predictionEnabled", "predictionArenaEnabled", "predictionMarketEnabled", "predictionMarketApproved", "predictionMarketStatus",
    "confirmedPredictionPoolCents", "confirmedPredictionCount",
    "publishedAt", "createdAt", "updatedAt"
  ]);
  const id = challengeId ?? (typeof data.id === "string" ? data.id : typeof data.challengeId === "string" ? data.challengeId : "");
  if (id) {
    const cover = mediaUrl(data, "coverImagePath", "coverImageUrl");
    if (cover) result.coverImageUrl = cover;
    else delete result.coverImageUrl;
    for (const [pathField, urlField] of [["promoImagePath", "promoImageUrl"], ["trailerVideoPath", "trailerVideoUrl"], ["promoVideoPath", "promoVideoUrl"]]) {
      const value = mediaUrl(data, pathField, urlField);
      if (value) result[urlField] = value;
      else delete result[urlField];
    }
    if (Array.isArray(data.challengeImages)) {
      result.challengeImages = data.challengeImages.flatMap((item) => {
        if (!item || typeof item !== "object") return privateRecord(data) ? [] : [item];
        const image = item as Record<string, unknown>;
        const value = mediaUrl(image, "path", "url");
        if (!value) return [];
        const safeImage = Object.fromEntries(["id", "path", "fileName", "contentType", "size", "width", "height", "durationSeconds", "moderationStatus"]
          .filter((key) => image[key] !== undefined)
          .map((key) => [key, image[key]]));
        return [{ ...safeImage, url: value }];
      });
    }
    if (data.challengeVideo && typeof data.challengeVideo === "object") {
      const video = data.challengeVideo as Record<string, unknown>;
      const value = mediaUrl(video, "path", "url");
      const safeVideo = Object.fromEntries(["id", "path", "fileName", "contentType", "size", "width", "height", "durationSeconds", "moderationStatus"]
        .filter((key) => video[key] !== undefined)
        .map((key) => [key, video[key]]));
      result.challengeVideo = value ? { ...safeVideo, url: value } : null;
    }
  } else if (privateRecord(data)) {
    // Never serialize stored download-token URLs when the stable media path is unavailable.
    for (const key of ["coverImageUrl", "promoImageUrl", "trailerVideoUrl", "promoVideoUrl", "challengeImages", "challengeVideo"]) delete result[key];
  }
  if (data.hideParticipantList === true) delete result.participantCount;
  if (data.hideVoteTotals === true) {
    delete result.voteCount;
    delete result.weightedVoteCount;
  }
  return result;
}

export function publicSubmissionFields(data: Record<string, unknown>) {
  const result = pick(data, [
    "challengeId", "title", "description", "mediaUrl", "mediaType", "thumbnailUrl",
    "status", "submittedAt", "createdAt", "updatedAt", "voteCount", "weightedVoteCount",
    "planBadge"
  ]);
  const path = typeof data.mediaStoragePath === "string" ? data.mediaStoragePath.trim() : "";
  if (path) result.mediaUrl = challengeMediaDeliveryUrl(path);
  else if (isFirebaseStorageDownloadUrl(data.mediaUrl)) delete result.mediaUrl;
  if (isFirebaseStorageDownloadUrl(data.thumbnailUrl)) delete result.thumbnailUrl;
  return result;
}
