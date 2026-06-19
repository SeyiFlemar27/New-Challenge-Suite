import type { Challenge, Submission, SubmissionType, UserPlanId } from "@/lib/types";

export type ChallengeApiRecord = Omit<Partial<Challenge>, "type"> & {
  participantCount?: number;
  promoImageUrl?: string;
  trailerVideoUrl?: string;
  type?: Challenge["type"] | "public" | "private";
};

const fallbackImageUrl = "https://images.unsplash.com/photo-1547347298-4074fc3086f0?auto=format&fit=crop&w=1400&q=80";

function toDateInput(value: unknown) {
  if (typeof value !== "string" || !value) return new Date().toISOString().slice(0, 10);
  return value.includes("T") ? value.slice(0, 10) : value;
}

export function normalizeChallenge(record: ChallengeApiRecord): Challenge {
  return {
    id: String(record.id ?? ""),
    title: record.title ?? "Untitled Challenge",
    description: record.description ?? "",
    category: record.category ?? "General",
    customCategory: record.customCategory,
    imageUrl: record.imageUrl ?? record.promoImageUrl ?? fallbackImageUrl,
    trailerUrl: record.trailerUrl ?? record.trailerVideoUrl,
    type: record.type === "Private / Exclusive" || record.type === "private" ? "Private / Exclusive" : "Normal Challenge",
    competitionFormat: record.competitionFormat ?? "Entry Competition",
    twoStepFormat: record.twoStepFormat,
    bestOf: record.bestOf ?? "1 Rounder",
    acceptedSubmissionTypes: record.acceptedSubmissionTypes ?? ["image"],
    prizeType: record.prizeType ?? "Bragging Rights (Leaderboard Ranking)",
    entryFee: record.entryFee ?? 0,
    prizePool: record.prizePool ?? 0,
    startsAt: toDateInput(record.startsAt),
    endsAt: toDateInput(record.endsAt),
    registrationDeadline: toDateInput(record.registrationDeadline),
    participants: record.participants ?? record.participantCount ?? 0,
    status: record.status === "completed" || record.status === "active" ? record.status : "upcoming",
    rules: record.rules ?? [],
    ageRestriction: record.ageRestriction,
    timeLimitedUploads: record.timeLimitedUploads,
    sponsorshipAllocation: record.sponsorshipAllocation ?? []
  };
}

export type SubmissionApiRecord = Omit<Partial<Submission>, "mediaType"> & {
  voteCount?: number;
  weightedVoteCount?: number;
  createdAt?: string;
  userDisplayName?: string;
  userPlanId?: UserPlanId;
  mediaType?: SubmissionType | string;
};

export function normalizeSubmission(record: SubmissionApiRecord, challenge?: Challenge): Submission & { userPlanId?: UserPlanId } {
  return {
    id: String(record.id ?? ""),
    challengeId: String(record.challengeId ?? challenge?.id ?? ""),
    title: record.title ?? "Untitled Submission",
    description: record.description ?? "",
    userId: record.userId ?? "",
    userName: record.userName ?? record.userDisplayName ?? "Participant",
    userInitials: record.userInitials ?? "??",
    mediaUrl: record.mediaUrl ?? "",
    mediaType: record.mediaType === "video" ? "video" : "image",
    challengeTitle: record.challengeTitle ?? challenge?.title ?? "",
    challengeCategory: record.challengeCategory ?? challenge?.category ?? "",
    likes: Number(record.likes ?? record.voteCount ?? record.weightedVoteCount ?? 0),
    isWinner: record.isWinner,
    createdAt: record.createdAt ?? "",
    userPlanId: record.userPlanId
  };
}
