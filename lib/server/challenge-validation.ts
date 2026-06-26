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
  bestOf: z.enum(["1 Rounder", "Best of 3", "Best of 5"]),
  startsAt: z.string().trim().min(1, "Start date is required."),
  endsAt: z.string().trim().min(1, "End date is required."),
  submissionDeadline: z.string().trim().min(1, "Submission deadline is required."),
  votingDeadline: z.string().trim().min(1, "Voting deadline is required."),
  registrationDeadline: z.string().trim().optional(),
  votingEndsAt: z.string().trim().optional(),
  coverImageUrl: z.string().trim().url("Cover image URL must be valid.").optional().or(z.literal("")),
  promoImageUrl: z.string().trim().url("Promo image URL must be valid.").optional().or(z.literal("")),
  trailerVideoUrl: z.string().trim().url("Trailer video URL must be valid.").optional().or(z.literal("")),
  votingSettings: z.object({
    allowFreeVotes: z.coerce.boolean().default(true),
    allowDoroCoinVotes: z.coerce.boolean().default(true),
    weightedVotes: z.coerce.boolean().default(true)
  }).default({ allowFreeVotes: true, allowDoroCoinVotes: true, weightedVotes: true }),
  sponsorEnabled: z.coerce.boolean().default(false),
  sponsorSlots: z.coerce.number().int().min(0).max(20).default(0),
  minimumSponsorshipAmount: z.coerce.number().min(0).default(0),
  sponsorPlacementOptions: z.array(z.string().trim().min(1)).max(12).default([]),
  publish: z.coerce.boolean().default(false)
}).superRefine((value, ctx) => {
  if (value.category === "Other" && !value.customCategory?.trim()) {
    ctx.addIssue({ code: "custom", path: ["customCategory"], message: "Custom category is required when Other is selected." });
  }
  if (value.competitionFormat.toLowerCase().includes("tournament")) {
    ctx.addIssue({ code: "custom", path: ["competitionFormat"], message: "Tournament creation is locked until Phase 6." });
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
