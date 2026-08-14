import { challengeDateTimeForStorage, challengeDateTimeInputValue, DEFAULT_CHALLENGE_TIME_ZONE, resolveChallengeTimeZone } from "@/lib/challenge-date-time";
import { normalizeNormalChallengeCapacity } from "@/lib/normal-challenge-capacity";
import { NORMAL_CHALLENGE_BUILDER_VERSION, NORMAL_PRIZE_SPLITS } from "@/lib/normal-challenge-config";

export type NormalMedia = { id: string; url: string; path: string; fileName: string; contentType: string; size: number; width?: number; height?: number; durationSeconds?: number; moderationStatus: "pending" | "approved" | "rejected" };
export type NormalChallengeForm = {
  title: string; shortDescription: string; description: string; category: string; subcategory: string; rules: string[];
  participationMode: "open" | "approval"; locationEligibility: "worldwide" | "selected"; eligibleCountries: string[]; ageRestrictionMode: "none" | "minimum"; minimumAge: string; capacityMode: "unlimited" | "limited"; maxParticipants: string; waitlistEnabled: boolean; hideParticipantList: boolean;
  paidEntryEnabled: boolean; entryFeeAmount: string; paidVotesEnabled: boolean; sponsorReady: boolean; numberOfWinners: number; winnerPrizeAmounts: string[];
  images: NormalMedia[]; video: NormalMedia | null;
  joinWindowMode: "until_submissions" | "custom"; registrationOpensAt: string; registrationDeadline: string; submissionStartAt: string; submissionDeadline: string; votingStartsAt: string; votingDeadline: string; winnerAnnouncementAt: string; timeZone: string; hideVoteTotals: boolean; hideRankings: boolean;
  submissionMode: "image" | "video" | "both"; submissionInstructions: string; submissionRequirements: string[]; fixAndResubmitEnabled: boolean; fixAndResubmitHours: "12" | "24" | "48" | "72";
  confirmations: { accurate: boolean; rights: boolean; review: boolean };
};

const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const strings = (value: unknown) => Array.isArray(value) ? value.map(String).filter(Boolean) : [];

export function freshNormalChallengeForm(now = Date.now()): NormalChallengeForm {
  const d = (days: number) => challengeDateTimeInputValue(new Date(now + days * 86400000), DEFAULT_CHALLENGE_TIME_ZONE);
  return {
    title: "", shortDescription: "", description: "", category: "", subcategory: "", rules: [],
    participationMode: "open", locationEligibility: "worldwide", eligibleCountries: [], ageRestrictionMode: "none", minimumAge: "", capacityMode: "unlimited", maxParticipants: "", waitlistEnabled: false, hideParticipantList: false,
    paidEntryEnabled: false, entryFeeAmount: "", paidVotesEnabled: false, sponsorReady: false, numberOfWinners: 1, winnerPrizeAmounts: [""],
    images: [], video: null,
    joinWindowMode: "until_submissions", registrationOpensAt: d(1), registrationDeadline: d(4), submissionStartAt: d(4), submissionDeadline: d(8), votingStartsAt: d(8), votingDeadline: d(10), winnerAnnouncementAt: d(11), timeZone: DEFAULT_CHALLENGE_TIME_ZONE, hideVoteTotals: false, hideRankings: false,
    submissionMode: "image", submissionInstructions: "", submissionRequirements: [], fixAndResubmitEnabled: false, fixAndResubmitHours: "24",
    confirmations: { accurate: false, rights: false, review: false }
  };
}

export function normalChallengeFormFromRecord(source: Record<string, unknown>): NormalChallengeForm {
  const fresh = freshNormalChallengeForm();
  const monetization = record(source.monetization);
  const timezone = resolveChallengeTimeZone(source);
  const local = (value: unknown, fallback: string) => challengeDateTimeInputValue(value || fallback, timezone);
  const legacyRules = String(source.standardRules || "").split(/\r?\n/).map((value) => value.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
  const types = strings(source.acceptedSubmissionTypes);
  const images = Array.isArray(source.challengeImages) ? source.challengeImages.map((item) => record(item) as NormalMedia).filter((item) => item.url && item.path) : [];
  if (!images.length && source.coverImageUrl && source.coverImagePath) images.push({ id: "legacy-cover", url: String(source.coverImageUrl), path: String(source.coverImagePath), fileName: "Challenge image", contentType: "image", size: 0, moderationStatus: "pending" });
  const prizeAmounts = Array.isArray(source.winnerPrizeAmountsCents) ? source.winnerPrizeAmountsCents.map((value) => String(Number(value) / 100)) : [];
  const winners = Math.max(1, Math.min(3, Number(source.numberOfWinners || 1)));
  if (!prizeAmounts.length) {
    const total = Number(source.prizeValue || 0);
    for (const percent of NORMAL_PRIZE_SPLITS[winners]) prizeAmounts.push(total ? String(total * percent / 100) : "");
  }
  return {
    ...fresh,
    title: String(source.title || ""), shortDescription: String(source.shortDescription || source.description || "").slice(0, 240), description: String(source.description || ""), category: String(source.category || ""), subcategory: String(source.subcategory || ""), rules: strings(source.challengeRules).length ? strings(source.challengeRules) : legacyRules,
    participationMode: source.requiresParticipantApproval === true ? "approval" : "open", locationEligibility: source.locationEligibility === "selected" || source.eligibleCountry ? "selected" : "worldwide", eligibleCountries: strings(source.eligibleCountries).length ? strings(source.eligibleCountries) : source.eligibleCountry ? [String(source.eligibleCountry)] : [], ageRestrictionMode: Number(source.minimumAge || 0) > 0 ? "minimum" : "none", minimumAge: source.minimumAge ? String(source.minimumAge) : "", capacityMode: Number(source.maxParticipants || 0) > 0 ? "limited" : "unlimited", maxParticipants: Number(source.maxParticipants || 0) > 0 ? String(source.maxParticipants) : "", waitlistEnabled: source.waitlistEnabled === true, hideParticipantList: source.hideParticipantList === true,
    paidEntryEnabled: monetization.paidEntryRequested === true, entryFeeAmount: Number(monetization.entryFeeAmountCents || 0) ? String(Number(monetization.entryFeeAmountCents) / 100) : "", paidVotesEnabled: record(source.votingSettings).allowPaidVotes === true || record(source.votingSettings).allowDoroCoinVotes === true, sponsorReady: monetization.sponsorReady === true, numberOfWinners: winners, winnerPrizeAmounts: prizeAmounts.slice(0, winners),
    images: images.slice(0, 3), video: source.challengeVideo ? record(source.challengeVideo) as NormalMedia : source.trailerVideoUrl && source.trailerVideoPath ? { id: "legacy-video", url: String(source.trailerVideoUrl), path: String(source.trailerVideoPath), fileName: "Challenge video", contentType: "video", size: 0, moderationStatus: "pending" } : null,
    joinWindowMode: source.joinWindowMode === "custom" ? "custom" : "until_submissions", registrationOpensAt: local(source.registrationOpensAt, fresh.registrationOpensAt), registrationDeadline: local(source.registrationDeadline || source.submissionStartAt, fresh.registrationDeadline), submissionStartAt: local(source.submissionStartAt || source.startsAt, fresh.submissionStartAt), submissionDeadline: local(source.submissionDeadline, fresh.submissionDeadline), votingStartsAt: local(source.votingStartsAt || source.submissionDeadline, fresh.votingStartsAt), votingDeadline: local(source.votingDeadline || source.votingEndsAt, fresh.votingDeadline), winnerAnnouncementAt: local(source.winnerAnnouncementAt || source.endsAt, fresh.winnerAnnouncementAt), timeZone: timezone, hideVoteTotals: source.hideVoteTotals === true, hideRankings: source.hideRankings === true,
    submissionMode: types.includes("image") && types.includes("video") ? "both" : types.includes("video") ? "video" : "image", submissionInstructions: String(source.challengeGuidelines || ""), submissionRequirements: strings(source.submissionRequirementsList).length ? strings(source.submissionRequirementsList) : String(source.submissionRequirements || "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean), fixAndResubmitEnabled: source.fixAndResubmitEnabled === true, fixAndResubmitHours: (["12", "24", "48", "72"].includes(String(source.fixAndResubmitHours)) ? String(source.fixAndResubmitHours) : "24") as NormalChallengeForm["fixAndResubmitHours"],
    confirmations: { accurate: false, rights: false, review: false }
  };
}

export function normalChallengePayload(form: NormalChallengeForm, challengeId = "") {
  const iso = (value: string) => challengeDateTimeForStorage(value, form.timeZone);
  const acceptedSubmissionTypes = form.submissionMode === "both" ? ["image", "video"] : [form.submissionMode];
  const maxParticipants = form.capacityMode === "unlimited" ? 0 : normalizeNormalChallengeCapacity(form.maxParticipants);
  const winnerPrizeAmountsCents = form.winnerPrizeAmounts.slice(0, form.numberOfWinners).map((value) => Math.round(Number(value || 0) * 100));
  const prizeValue = winnerPrizeAmountsCents.reduce((sum, value) => sum + value, 0) / 100;
  const primary = form.images[0];
  return {
    challengeType: "normal", challengeTypeLocked: Boolean(challengeId), builderVersion: NORMAL_CHALLENGE_BUILDER_VERSION, type: "Public Challenge", visibility: "public",
    title: form.title.trim(), shortDescription: form.shortDescription.trim(), description: form.description.trim(), category: form.category, subcategory: form.subcategory,
    challengeRules: form.rules.map((value) => value.trim()).filter(Boolean), standardRules: form.rules.map((value) => value.trim()).filter(Boolean).join("\n"), policyTerms: "",
    participationMode: form.participationMode, requiresParticipantApproval: form.participationMode === "approval", participantApprovalMode: form.participationMode === "approval" ? "manual" : "automatic", locationEligibility: form.locationEligibility, eligibleCountries: form.locationEligibility === "selected" ? form.eligibleCountries : [], eligibleCountry: "", ageRestrictionMode: form.ageRestrictionMode, minimumAge: form.ageRestrictionMode === "minimum" ? Number(form.minimumAge || 0) : 0, capacityMode: form.capacityMode, maxParticipants, waitlistEnabled: form.capacityMode === "limited" && form.waitlistEnabled, hideParticipantList: form.hideParticipantList, teamParticipationEnabled: false,
    prizeType: "money", prizeTitle: "Cash prize", prizeDescription: "", prizeValue, prizeCurrency: "USD", numberOfWinners: form.numberOfWinners, winnerPrizeAmountsCents, winnerSplits: NORMAL_PRIZE_SPLITS[form.numberOfWinners], winnerSelection: "highest_votes",
    challengeImages: form.images, challengeVideo: form.video, coverMediaType: "image", coverImageUrl: primary?.url || "", coverImagePath: primary?.path || "", trailerVideoUrl: form.video?.url || "", trailerVideoPath: form.video?.path || "", mediaUploadStatus: primary ? "uploaded" : "required", mediaStatus: primary ? "uploaded" : "required", usesPlaceholderMedia: false, mediaFallbackType: "",
    joinWindowMode: form.joinWindowMode, registrationEnabled: true, registrationOpensAt: form.joinWindowMode === "custom" ? iso(form.registrationOpensAt) : "", registrationDeadline: form.joinWindowMode === "custom" ? iso(form.registrationDeadline) : iso(form.submissionStartAt), submissionStartAt: iso(form.submissionStartAt), startsAt: iso(form.submissionStartAt), submissionDeadline: iso(form.submissionDeadline), votingStartsAt: iso(form.votingStartsAt), votingDeadline: iso(form.votingDeadline), votingEndsAt: iso(form.votingDeadline), winnerAnnouncementAt: iso(form.winnerAnnouncementAt), endsAt: iso(form.winnerAnnouncementAt), timeZone: form.timeZone, timezone: form.timeZone,
    acceptedSubmissionTypes, challengeGuidelines: form.submissionInstructions.trim(), submissionRequirementsList: form.submissionRequirements.map((value) => value.trim()).filter(Boolean), submissionRequirements: form.submissionRequirements.map((value) => value.trim()).filter(Boolean).join("\n"), fixAndResubmitEnabled: form.fixAndResubmitEnabled, fixAndResubmitHours: Number(form.fixAndResubmitHours), oneEntryPerParticipant: true,
    competitionFormat: "Public Voting", votingSettings: { allowFreeVotes: true, allowPaidVotes: form.paidVotesEnabled, adsForVotesEnabled: true, adsBeforeCooldown: 10, cooldownHours: 2, weightedVotes: false }, hideVoteTotals: form.hideVoteTotals, hideRankings: form.hideRankings,
    monetization: { enabled: form.paidEntryEnabled, paidEntryRequested: form.paidEntryEnabled, entryFeeAmountCents: Math.round(Number(form.entryFeeAmount || 0) * 100), currency: "USD", sponsorReady: form.sponsorReady, prizePoolRequested: true, paidVotesRequested: form.paidVotesEnabled, status: form.paidEntryEnabled || form.sponsorReady ? "setup_required" : "not_requested", paymentActive: false, checkoutActive: false, ledgerCreationEnabled: false, prizeReleaseActive: false, payoutReleaseActive: false, sponsorshipGoal: "", preferredSponsorCategory: "", sponsorNote: "", placements: [] },
    publishConfirmations: form.confirmations, isLiveEvent: false, tournamentType: "none"
  };
}
