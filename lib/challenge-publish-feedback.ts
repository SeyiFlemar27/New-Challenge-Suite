import type { ApiResult } from "@/lib/api/response-parser";

const timelineCodes = new Set(["INVALID_TIMELINE", "TIMELINE_INVALID", "SUBMISSION_DEADLINE_REQUIRED"]);
const mediaCodes = new Set(["REQUIRED_BANNER", "CHALLENGE_MEDIA_REQUIRED", "CHALLENGE_MEDIA_UNAVAILABLE"]);

export function challengePublishError(result: Pick<ApiResult<unknown>, "code" | "status" | "details">) {
  const code = String(result.code ?? "");
  const validation = (result.details as { publishValidation?: { errors?: Array<{ code?: string; field?: string }> } } | undefined)?.publishValidation;
  const issues = validation?.errors ?? [];
  if (code === "SESSION_REQUIRED" || result.status === 401) return "Your session expired. Please sign in again.";
  if (code === "PERMISSION_DENIED" || code === "SPONSOR_NOT_ALLOWED" || result.status === 403) return "You can't publish this challenge.";
  if (/PLAN|MONETIZATION|PRIVATE_CHALLENGE_LOCKED|FREE_BASIC_LIMIT/.test(code)) return "This feature isn't included in your plan.";
  if (code === "CHALLENGE_NOT_EDITABLE") return "This challenge has already been submitted.";
  if (/PENDING_REVIEW|ALREADY_UNDER_REVIEW/.test(code)) return "This challenge is already under review.";
  if (/ENTRY_FEE|PAID_ENTRY/.test(code)) return "Paid entry setup needs attention.";
  if (/SPONSOR/.test(code)) return "Sponsor setup needs attention.";
  if (/PRIZE/.test(code)) return "Prize funding needs attention.";
  if (/PROVIDER|PAYMENT/.test(code)) return "Payment setup is not ready yet.";
  if (/PROCESSING|UPLOAD_IN_PROGRESS/.test(code)) return "Your media is still processing. Try again shortly.";
  if (mediaCodes.has(code) || issues.some((issue) => mediaCodes.has(String(issue.code)) || /coverImage|media/i.test(String(issue.field)))) return "Please add challenge media before publishing.";
  if (timelineCodes.has(code) || issues.some((issue) => timelineCodes.has(String(issue.code)) || /date|time|deadline|startsAt/i.test(String(issue.field)))) return "Your challenge timeline needs fixing.";
  if (code === "PUBLISH_VALIDATION_FAILED" || result.status === 422) return "Some required details are missing.";
  if (code === "NETWORK_ERROR" || result.status === 0) return "Network issue. Please try again.";
  return "Publishing failed. Please try again.";
}
