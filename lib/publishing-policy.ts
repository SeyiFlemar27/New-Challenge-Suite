import { calculateNormalWinnerAmountsCents, normalWinnerPercentages } from "@/lib/normal-challenge-prize-allocation";

export const AUTOMATIC_PUBLICATION_POLICY_VERSION = 1;
export type PublicationOutcome = "published" | "needs_attention" | "held_for_moderation";

/** Defaults are shared by client readiness and server validation. Explicit invalid values are never repaired. */
export function withPublishingDefaults<T extends Record<string, unknown>>(source: T): T & Record<string, unknown> {
  const value: Record<string, unknown> = { ...source };
  // Older creation handlers store absent optional strings as null. Normalize only
  // those optional fields before schema parsing; retain invalid explicit values.
  for (const key of ["customCategory", "promoImageUrl", "promoImagePath", "trailerVideoUrl", "trailerVideoPath", "promoVideoUrl", "promoVideoPath", "prizeTitle", "prizeDescription", "prizeDeliveryNotes", "eventState", "eventMapUrl", "inviteCode", "accessCode", "privateAccessInstructions"]) if (value[key] === null) value[key] = "";
  const absent = (key: string) => value[key] === undefined || value[key] === null || value[key] === "";
  const set = (key: string, fallback: unknown) => { if (absent(key)) value[key] = fallback; };
  set("timeZone", value.timezone || "America/New_York");
  if (value.isLiveEvent) {
    const ops = { ...((value.hostOperations ?? {}) as Record<string, unknown>) };
    ops.timezone ||= value.timeZone;
    ops.registrationOpensAt ||= new Date().toISOString();
    ops.registrationClosesAt ||= value.startsAt;
    ops.checkInStartAt ||= value.startsAt;
    ops.checkInEndAt ||= value.endsAt;
    value.hostOperations = ops;
  } else {
    set("type", value.visibility === "private" ? "Private Challenge" : "Normal Challenge");
    set("competitionFormat", "Entry Competition");
    set("submissionStartAt", value.startsAt);
    set("votingStartsAt", value.submissionDeadline);
    set("votingDeadline", value.votingEndsAt || value.endsAt);
    set("winnerAnnouncementAt", value.endsAt || value.votingDeadline);
    set("endsAt", value.winnerAnnouncementAt || value.votingDeadline);
    if (!Array.isArray(value.acceptedSubmissionTypes) || !value.acceptedSubmissionTypes.length) value.acceptedSubmissionTypes = ["image", "video"];
    set("winnerSelection", "highest_votes");
    set("numberOfWinners", 1);
    const legacyLocked = value.builderVersion === "normal_v2" && (Number(value.confirmedCreatorPrizeFundingCents ?? 0) > 0 || Boolean(value.creatorPrizeGuaranteeLockedAt) || Number(value.participantCount ?? 0) > 0);
    if (!legacyLocked) {
      const winners = Number(value.numberOfWinners);
      value.winnerSplits = normalWinnerPercentages(winners);
      value.winnerPrizeAmountsCents = calculateNormalWinnerAmountsCents(Math.round(Number(value.prizeValue ?? 0) * 100), winners);
      if (value.builderVersion === "normal_v3") value.prizeType = "money";
    }
    if (value.prizeType === "money") set("prizeTitle", "Cash prize");
  }
  return value as T & Record<string, unknown>;
}

/** Only persisted, explicit safety decisions qualify; technical failures and unverified reports do not. */
export function publicationSafetyHold(account: Record<string, unknown>, challenge: Record<string, unknown>): string | null {
  if (["suspended", "banned", "disabled", "removed", "deletion_pending"].includes(String(account.accountStatus ?? account.status))) return "ACCOUNT_RESTRICTED";
  if (account.publishingSuspended === true) return "ACCOUNT_PUBLISHING_RESTRICTED";
  if (["held", "suspended", "removed", "confirmed_abuse"].includes(String(challenge.moderationStatus))) return "CONTENT_MODERATION_HOLD";
  if (challenge.safetyHold === true || challenge.fraudConfirmed === true) return "CONTENT_SAFETY_HOLD";
  if (["rejected", "changes_requested"].includes(String(challenge.adminApprovalStatus ?? challenge.reviewStatus))) return "HISTORICAL_REVIEW_REQUIRES_REMEDIATION";
  return null;
}

export const PROMOTIONAL_EDIT_FIELDS = ["title", "description", "shortDescription", "promoImageUrl", "promoImagePath", "promoVideoUrl", "promoVideoPath", "trailerVideoUrl", "trailerVideoPath", "coverImageUrl", "coverImagePath", "challengeImages", "challengeVideo"] as const;
