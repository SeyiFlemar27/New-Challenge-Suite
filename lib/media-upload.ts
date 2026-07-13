export type MediaUploadKind = "image" | "video" | "media";

export type MediaUploadStage = "idle" | "preparing" | "uploading" | "processing" | "complete" | "failed";

export type MediaUploadErrorCode =
  | "storage_unavailable"
  | "unauthenticated"
  | "unsupported_format"
  | "file_too_large"
  | "permission_denied"
  | "expired_auth"
  | "network_failure"
  | "upload_cancelled"
  | "processing_failed"
  | "storage_timeout"
  | "unknown";

export type MediaUploadValidation =
  | { ok: true; mediaType: "image" | "video"; maxSizeMb: number }
  | { ok: false; code: MediaUploadErrorCode; message: string; maxSizeMb?: number };

const imageTypes = ["image/jpeg", "image/png", "image/webp"];
const videoTypes = ["video/mp4", "video/webm", "video/quicktime"];

export function mediaAccept(kind: MediaUploadKind) {
  if (kind === "image") return imageTypes.join(",");
  if (kind === "video") return videoTypes.join(",");
  return [...imageTypes, ...videoTypes].join(",");
}

export function defaultMaxSizeMb(kind: MediaUploadKind) {
  return kind === "image" ? 15 : 250;
}

export function sanitizeFileName(name: string) {
  const normalized = name.trim().replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 120);
  return normalized || "upload";
}

export function sanitizeStorageSegment(value: string) {
  return sanitizeFileName(value).replace(/^\.+|\.+$/g, "").slice(0, 80) || "item";
}

export function joinStoragePath(...segments: string[]) {
  return segments.map((segment) => sanitizeStorageSegment(segment)).filter(Boolean).join("/");
}

export function appendUploadFileName(basePath: string, fileName: string, now = Date.now()) {
  const cleanBase = basePath.split("/").map(sanitizeStorageSegment).filter(Boolean).join("/");
  return `${cleanBase}/${now}-${sanitizeFileName(fileName)}`;
}

export function validateMediaFile(file: Pick<File, "type" | "size" | "name">, kind: MediaUploadKind, maxSizeMb = defaultMaxSizeMb(kind)): MediaUploadValidation {
  const imageOk = imageTypes.includes(file.type);
  const videoOk = videoTypes.includes(file.type);
  const typeAllowed = kind === "image" ? imageOk : kind === "video" ? videoOk : imageOk || videoOk;
  if (!typeAllowed) {
    return {
      ok: false,
      code: "unsupported_format",
      message: kind === "video" ? "Upload an MP4, WebM, or QuickTime video." : kind === "image" ? "Upload a JPG, PNG, or WebP image." : "Upload a supported JPG, PNG, WebP, MP4, WebM, or QuickTime file.",
      maxSizeMb
    };
  }
  if (file.size > maxSizeMb * 1024 * 1024) {
    return { ok: false, code: "file_too_large", message: `File must be ${maxSizeMb}MB or smaller.`, maxSizeMb };
  }
  return { ok: true, mediaType: videoOk ? "video" : "image", maxSizeMb };
}

export function mediaErrorMessage(code: MediaUploadErrorCode) {
  switch (code) {
    case "storage_unavailable": return "Media uploads are temporarily unavailable. Storage is not configured for this environment.";
    case "unauthenticated": return "Sign in again before uploading media.";
    case "unsupported_format": return "This file format is not supported.";
    case "file_too_large": return "This file is too large for upload.";
    case "permission_denied": return "You do not have permission to upload to this location.";
    case "expired_auth": return "Your sign-in session expired. Sign in again and retry the upload.";
    case "network_failure": return "Network connection failed during upload. Check your connection and retry.";
    case "upload_cancelled": return "Upload was cancelled. You can retry when ready.";
    case "processing_failed": return "Upload finished, but media processing failed. Please retry.";
    case "storage_timeout": return "Upload timed out. Please retry with a stable connection.";
    default: return "Upload failed. Please retry.";
  }
}

export function classifyStorageError(error: unknown): { code: MediaUploadErrorCode; message: string } {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const lower = raw.toLowerCase();
  let code: MediaUploadErrorCode = "unknown";
  if (raw === "STORAGE_UPLOAD_TIMEOUT") code = "storage_timeout";
  else if (lower.includes("storage/unauthorized") || lower.includes("permission") || lower.includes("403")) code = "permission_denied";
  else if (lower.includes("storage/unauthenticated") || lower.includes("auth")) code = "expired_auth";
  else if (lower.includes("storage/canceled") || lower.includes("cancelled") || lower.includes("canceled")) code = "upload_cancelled";
  else if (lower.includes("processing failed")) code = "processing_failed";
  else if (lower.includes("storage/retry-limit-exceeded") || lower.includes("network") || lower.includes("offline")) code = "network_failure";
  else if (lower.includes("bucket") || lower.includes("storage/unknown") || lower.includes("storage/object-not-found")) code = "storage_unavailable";
  return { code, message: mediaErrorMessage(code) };
}
