export class MediaVerificationError extends Error {
  constructor(public category: string, public stage: string, cause?: unknown) {
    super(category, { cause });
  }
}

export function mediaVerificationFailure(error: unknown, requestId: string) {
  const stage = error instanceof MediaVerificationError ? error.stage : "verification";
  const raw = error instanceof Error ? error.message : "";
  const category = /^MEDIA_[A-Z_]+(?=:|$)/.exec(raw)?.[0] ?? (Number((error as {code?:unknown})?.code) === 404 ? "MEDIA_OBJECT_MISSING" : "MEDIA_VERIFICATION_FAILED");
  if (/OBJECT_CHANGED|SIZE_MISMATCH/.test(category)) return { category, stage, requestId, code: "MEDIA_CHANGED", status: 409, message: "A file changed while it was being checked. Wait for the upload to finish, save your draft, and retry." };
  if (["MEDIA_REQUIRED", "MEDIA_OBJECT_MISSING"].includes(category)) return { category, stage, requestId, code: category, status: 422, message: category === "MEDIA_REQUIRED" ? "Upload at least one image before publishing." : "An uploaded file could not be found. Check that its upload finished and try again." };
  if (stage === "normalization" && /SIZE|TOO_LARGE/.test(category)) return { category, stage, requestId, code: "MEDIA_PROCESSING_UNAVAILABLE", status: 503, message: "The server could not finish processing this image. Your original upload is preserved; retry or contact Support with the request reference." };
  if (/SIZE|TOO_LARGE/.test(category)) return { category, stage, requestId, code: "MEDIA_SIZE_INVALID", status: 422, message: "Check your media file sizes. Creator images must be 10 MB or smaller." };
  if (/FORMAT|CONTENT_TYPE|TYPE_MISMATCH|DIMENSIONS|DURATION|CODEC/.test(category)) return { category, stage, requestId, code: "MEDIA_FORMAT_INVALID", status: 422, message: "A media file could not be decoded in a supported format. Use JPEG, PNG, or WebP images and a supported video format." };
  if (/PATH_NOT_CHALLENGE_SCOPED|OWNERSHIP_INVALID/.test(category)) return { category, stage, requestId, code: "MEDIA_OWNERSHIP_INVALID", status: 403, message: "This media cannot be used for this challenge. Check the saved upload and try again." };
  return { category, stage, requestId, code: "MEDIA_VERIFICATION_UNAVAILABLE", status: 503, message: "Media verification is temporarily unavailable. Your saved uploads are preserved; please retry. If this continues, contact Support with the request reference." };
}
