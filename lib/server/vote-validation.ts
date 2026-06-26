import { z } from "zod";

export const voteRequestSchema = z.object({
  challengeId: z.string().trim().min(1, "Challenge ID is required."),
  submissionId: z.string().trim().min(1, "Submission ID is required."),
  voteMode: z.enum(["free", "dorocoin"], { message: "Vote mode must be free or dorocoin." }),
  quantity: z.coerce.number().int("Quantity must be a whole number.").min(1, "Quantity must be at least 1.").max(500, "Vote quantity is too large.").default(1)
});

export type VoteRequestInput = z.infer<typeof voteRequestSchema>;

export function zodFieldErrors(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0] ?? "vote")] = issue.message;
  return fieldErrors;
}
