import { z } from "zod";
import { validateChallengeDates } from "@/lib/server/challenge-lifecycle";

export const serverChallengeCreateSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(120, "Title must be 120 characters or fewer."),
  description: z.string().trim().min(10, "Description must be at least 10 characters.").max(2000, "Description must be 2,000 characters or fewer."),
  category: z.string().trim().min(1, "Category is required.").max(80),
  customCategory: z.string().trim().max(80).optional().or(z.literal("")),
  type: z.string().trim().optional(),
  visibility: z.enum(["public", "private", "exclusive"]).default("public"),
  premiumOnly: z.coerce.boolean().default(false),
  acceptedSubmissionTypes: z.array(z.enum(["image", "video"])).min(1, "Select at least one submission type.").max(2),
  competitionFormat: z.string().trim().min(1, "Challenge format is required.").max(80),
  bestOf: z.enum(["1 Rounder", "Best of 3", "Best of 5", "Best of 7"]),
  startsAt: z.string().trim().min(1, "Start date is required."),
  endsAt: z.string().trim().min(1, "End date is required."),
  submissionDeadline: z.string().trim().min(1, "Submission deadline is required."),
  votingDeadline: z.string().trim().min(1, "Voting deadline is required."),
  votingStartsAt: z.string().trim().optional(),
  registrationDeadline: z.string().trim().optional(),
  votingEndsAt: z.string().trim().optional(),
  standardRules: z.string().trim().max(6000).default(""),
  policyTerms: z.string().trim().max(6000).default(""),
  challengeGuidelines: z.string().trim().max(6000).default(""),
  coverImageUrl: z.string().trim().url("Cover image URL must be valid.").optional().or(z.literal("")),
  promoImageUrl: z.string().trim().url("Promo image URL must be valid.").optional().or(z.literal("")),
  trailerVideoUrl: z.string().trim().url("Trailer video URL must be valid.").optional().or(z.literal("")),
  promoVideoUrl: z.string().trim().url("Promo video URL must be valid.").optional().or(z.literal("")),
  prizeType: z.enum(["none", "money", "physical_product", "digital_product", "bragging_rights"]).default("bragging_rights"),
  prizeTitle: z.string().trim().max(120).default(""),
  prizeDescription: z.string().trim().max(1200).default(""),
  prizeValue: z.coerce.number().min(0).max(100000000).default(0),
  prizeDeliveryNotes: z.string().trim().max(1200).default(""),
  votingSettings: z.object({
    allowFreeVotes: z.coerce.boolean().default(true),
    allowDoroCoinVotes: z.coerce.boolean().default(true),
    weightedVotes: z.coerce.boolean().default(true)
  }).default({ allowFreeVotes: true, allowDoroCoinVotes: true, weightedVotes: true }),
  requiresSubmissionApproval: z.coerce.boolean().default(false),
  sponsorEnabled: z.coerce.boolean().default(false),
  sponsorSlots: z.coerce.number().int().min(0).max(20).default(0),
  minimumSponsorshipAmount: z.coerce.number().min(0).default(0),
  sponsorPlacementOptions: z.array(z.string().trim().min(1)).max(12).default([]),
  sponsorPackages: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    name: z.string().trim().min(2).max(80),
    price: z.coerce.number().min(0).max(100000000),
    slotLimit: z.coerce.number().int().min(1).max(20),
    benefits: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
    logoPlacement: z.coerce.boolean().default(false),
    ctaButton: z.coerce.boolean().default(false),
    leaderboardMention: z.coerce.boolean().default(false),
    winnerAnnouncementMention: z.coerce.boolean().default(false),
    feedBannerPlacement: z.coerce.boolean().default(false),
    campaignReportAvailable: z.coerce.boolean().default(false)
  })).max(12).default([]),
  isLiveEvent: z.coerce.boolean().default(false),
  venueName: z.string().trim().max(160).default(""),
  eventAddress: z.string().trim().max(240).default(""),
  eventCity: z.string().trim().max(100).default(""),
  eventState: z.string().trim().max(100).default(""),
  eventCountry: z.string().trim().max(100).default(""),
  eventMapUrl: z.string().trim().url("Map link must be valid.").optional().or(z.literal("")),
  eventCapacity: z.coerce.number().int().min(0).max(50000).default(0),
  tournamentType: z.enum(["none", "one_vs_one", "group"]).default("none"),
  divisionFormat: z.coerce.number().int().refine((value) => [2, 4, 6].includes(value), "Division format must be 2, 4, or 6.").default(2),
  maxParticipants: z.coerce.number().int().min(2).max(50).default(50),
  scoringMode: z.enum(["best_of", "points"]).default("best_of"),
  bestOfRounds: z.coerce.number().int().refine((value) => [3, 5, 7].includes(value), "Best-of scoring must be 3, 5, or 7.").default(3),
  pointsToWin: z.coerce.number().int().min(1).max(100000).default(10),
  timerEnabled: z.coerce.boolean().default(false),
  timerDuration: z.coerce.number().int().min(0).max(86400).default(0),
  roundDuration: z.coerce.number().int().min(0).max(86400).default(0),
  judgeScoringEnabled: z.coerce.boolean().default(false),
  publish: z.coerce.boolean().default(false)
}).superRefine((value, ctx) => {
  if (value.category === "Other" && !value.customCategory?.trim()) {
    ctx.addIssue({ code: "custom", path: ["customCategory"], message: "Custom category is required when Other is selected." });
  }
  if (value.votingStartsAt && new Date(value.votingStartsAt) < new Date(value.submissionDeadline)) {
    ctx.addIssue({ code: "custom", path: ["votingStartsAt"], message: "Voting cannot start before the submission deadline." });
  }
  if (value.timerEnabled && value.timerDuration <= 0) {
    ctx.addIssue({ code: "custom", path: ["timerDuration"], message: "Timer duration must be greater than zero." });
  }
  if (value.isLiveEvent && (!value.venueName || !value.eventCity || !value.eventCountry)) {
    ctx.addIssue({ code: "custom", path: ["venueName"], message: "Venue, city, and country are required for live events." });
  }
  if (!["none", "bragging_rights"].includes(value.prizeType) && !value.prizeTitle) {
    ctx.addIssue({ code: "custom", path: ["prizeTitle"], message: "Prize title is required for product or money prize metadata." });
  }
  const dateResult = validateChallengeDates(value);
  for (const [field, message] of Object.entries(dateResult.fieldErrors)) {
    ctx.addIssue({ code: "custom", path: [field], message });
  }
});

export type ServerChallengeCreateInput = z.infer<typeof serverChallengeCreateSchema>;

export function zodFieldErrors(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "challenge");
    fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}
