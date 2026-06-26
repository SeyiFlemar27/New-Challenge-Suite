import { z } from "zod";
import { validateChallengeDates } from "@/lib/server/challenge-lifecycle";

export const challengeSchema = z
  .object({
    title: z.string().min(3),
    description: z.string().min(10),
    category: z.string().min(1),
    customCategory: z.string().optional(),
    acceptedSubmissionTypes: z.array(z.enum(["image", "video"])).min(1),
    competitionFormat: z.string().min(1),
    bestOf: z.enum(["1 Rounder", "Best of 3", "Best of 5"]),
    prizeType: z.enum(["Cash Jackpot", "Product Prize", "Bragging Rights (Leaderboard Ranking)", "DoroCoin"]),
    entryFee: z.coerce.number().nullable().optional(),
    registrationDeadline: z.string().min(1),
    submissionDeadline: z.string().min(1),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    votingDeadline: z.string().min(1),
    votingEndsAt: z.string().optional(),
    promoFlyerFile: z.any().optional(),
    trailerFile: z.any().optional(),
    minimumAge: z.coerce.number().optional(),
    publish: z.boolean().optional()
  })
  .superRefine((value, ctx) => {
    if (value.category === "Other" && !value.customCategory?.trim()) {
      ctx.addIssue({ code: "custom", path: ["customCategory"], message: "Custom category is required when Other is selected." });
    }
    const dateResult = validateChallengeDates({
      publish: Boolean(value.publish),
      startsAt: value.startsAt,
      endsAt: value.endsAt,
      submissionDeadline: value.submissionDeadline,
      votingDeadline: value.votingDeadline
    });
    for (const [field, message] of Object.entries(dateResult.fieldErrors)) {
      ctx.addIssue({ code: "custom", path: [field], message });
    }
  });
