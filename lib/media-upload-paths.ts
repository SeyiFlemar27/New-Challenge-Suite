import { joinStoragePath, sanitizeStorageSegment } from "./media-upload";

export type ChallengeDraftMediaFolder = "banner" | "gallery" | "video" | "documents";
export type ChallengeMediaFolder = "banner" | "gallery" | "video" | "documents";
export type SubmissionMediaFolder = "images" | "videos" | "documents";
export type ProfileMediaFolder = "avatar" | "banner";
export type SponsorMediaFolder = "logo" | "banner";
export type SponsorCampaignMediaFolder = "logo" | "banner" | "creative" | "video" | "documents";

export const storageRulesBaseline = {
  challengeDrafts: "challenges/drafts/{userId}/{folder}/{fileName}",
  challengeMedia: "challenges/{challengeId}/{folder}/{fileName}",
  submissions: "challenges/{challengeId}/submissions/{userId}/{folder}/{fileName}",
  profile: "users/{userId}/profile/{folder}/{fileName}",
  sponsor: "sponsors/{userId}/{folder}/{fileName}",
  sponsorCampaigns: "sponsors/{userId}/campaigns/{campaignId}/{folder}/{fileName}"
} as const;

export function challengeDraftMediaPath(userId: string, folder: ChallengeDraftMediaFolder) {
  return joinStoragePath("challenges", "drafts", userId, folder);
}

export function challengeMediaPath(challengeId: string, folder: ChallengeMediaFolder) {
  return joinStoragePath("challenges", challengeId, folder);
}

export function submissionMediaPath(challengeId: string, userId: string, folder: SubmissionMediaFolder) {
  return joinStoragePath("challenges", challengeId, "submissions", userId, folder);
}

export function submissionFolderForMediaType(mediaType: "image" | "video" | "document"): SubmissionMediaFolder {
  if (mediaType === "video") return "videos";
  if (mediaType === "document") return "documents";
  return "images";
}

export function profileMediaPath(userId: string, folder: ProfileMediaFolder) {
  return joinStoragePath("users", userId, "profile", folder);
}

export function sponsorMediaPath(userId: string, folder: SponsorMediaFolder) {
  return joinStoragePath("sponsors", userId, folder);
}

export function sponsorCampaignMediaPath(userId: string, campaignId: string, folder: SponsorCampaignMediaFolder) {
  return joinStoragePath("sponsors", userId, "campaigns", campaignId, folder);
}

export function legacyHostDraftMediaPath(userId: string, folder: string) {
  return joinStoragePath("challenges", "drafts", userId, sanitizeStorageSegment(folder));
}
