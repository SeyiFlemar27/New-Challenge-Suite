import { z } from "zod";

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
    entryFee: z.coerce.number().nullable(),
    registrationDeadline: z.string().min(1),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    promoFlyerFile: z.any().optional(),
    trailerFile: z.any().optional(),
    minimumAge: z.coerce.number().optional()
  })
  .superRefine((value, ctx) => {
    if (value.category === "Other" && !value.customCategory?.trim()) {
      ctx.addIssue({ code: "custom", path: ["customCategory"], message: "Custom category is required when Other is selected." });
    }
    if (value.prizeType !== "Bragging Rights (Leaderboard Ranking)" && (value.entryFee === null || Number.isNaN(value.entryFee) || value.entryFee <= 0)) {
      ctx.addIssue({ code: "custom", path: ["entryFee"], message: "Entry fee must be greater than $0 unless this is a Bragging Rights competition." });
    }
  });
