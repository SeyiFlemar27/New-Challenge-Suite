import { z } from "zod";

export const submissionCreateSchema = z.object({
  challengeId: z.string().trim().min(1, "Challenge ID is required."),
  title: z.string().trim().min(2, "Title is required.").max(120, "Title must be 120 characters or fewer."),
  description: z.string().trim().max(2000).optional().default(""),
  caption: z.string().trim().max(2000).optional().default(""),
  mediaUrl: z.string().trim().url("Media URL must be valid.").optional().or(z.literal("")),
  mediaType: z.enum(["image", "video"], { message: "Media type must be image or video." }).default("image"),
  mediaUploadPending: z.coerce.boolean().default(false),
  originalFileName: z.string().trim().max(240).optional().default(""),
  fileSize: z.coerce.number().min(0).default(0),
  mediaStoragePath: z.string().trim().max(500).optional().default(""),
  entryAgreementAccepted: z.coerce.boolean().default(false),
  rulesAccepted: z.coerce.boolean().default(false)
}).superRefine((value, ctx) => {
  if (value.mediaUploadPending) {
    ctx.addIssue({ code: "custom", path: ["mediaUploadPending"], message: "Participant media must be uploaded before submitting. Storage-disabled challenge demo mode does not apply to participant submissions." });
  }
  if (!value.mediaUrl) {
    ctx.addIssue({ code: "custom", path: ["mediaUrl"], message: "Upload an accepted media file before submitting." });
  }
  if (!value.mediaStoragePath || /^https?:/i.test(value.mediaStoragePath) || value.mediaStoragePath.includes("..")) {
    ctx.addIssue({ code: "custom", path: ["mediaStoragePath"], message: "Submission media must include a valid Firebase Storage path." });
  }
  const maxBytes = (value.mediaType === "video" ? 250 : 15) * 1024 * 1024;
  if (value.fileSize <= 0 || value.fileSize > maxBytes) {
    ctx.addIssue({ code: "custom", path: ["fileSize"], message: `${value.mediaType === "video" ? "Video" : "Image"} uploads must be larger than 0 bytes and no more than ${value.mediaType === "video" ? 250 : 15}MB.` });
  }
  if (!value.entryAgreementAccepted && !value.rulesAccepted) {
    ctx.addIssue({ code: "custom", path: ["entryAgreementAccepted"], message: "Accept the challenge rules and entry agreement before submitting." });
  }
});

export type SubmissionCreateInput = z.infer<typeof submissionCreateSchema>;

export function zodFieldErrors(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0] ?? "submission")] = issue.message;
  return fieldErrors;
}
