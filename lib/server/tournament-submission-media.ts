import { createHash } from "node:crypto";
import { getAdminStorage } from "@/lib/firebase/admin";
import { inspectImageBytes, inspectVideoBytes, normalizeImageBytes } from "@/lib/server/media-inspection";

/** Retains the existing participant Storage limits; creator promotional limits are separate. */
export async function verifyTournamentSubmissionMedia(input: { tournamentId: string; submissionId: string; path: string; mediaType: "image" | "video" }) {
  const storage = getAdminStorage();
  if (!storage) throw new Error("MEDIA_STORAGE_UNAVAILABLE");
  const bucket = storage.bucket();
  const source = bucket.file(input.path);
  const [metadata] = await source.getMetadata();
  const size = Number(metadata.size);
  const isImage = input.mediaType === "image";
  const types = isImage ? ["image/jpeg", "image/png", "image/webp"] : ["video/mp4", "video/avi", "video/x-msvideo"];
  if (!types.includes(String(metadata.contentType)) || !Number.isSafeInteger(size) || size <= 0 || (isImage ? size > 5 * 1024 * 1024 : size >= 50 * 1024 * 1024)) throw new Error("SUBMISSION_MEDIA_INVALID");
  const [bytes] = await source.download();
  const [after] = await source.getMetadata();
  if (String(after.generation) !== String(metadata.generation) || bytes.length !== size) throw new Error("SUBMISSION_MEDIA_CHANGED");
  const inspected = isImage ? await inspectImageBytes(bytes) : inspectVideoBytes(bytes);
  if (isImage) {
    if (`image/${inspected.format}` !== metadata.contentType) throw new Error("SUBMISSION_MEDIA_INVALID");
    await normalizeImageBytes(bytes);
  } else if ((inspected.format === "mp4") !== (metadata.contentType === "video/mp4")) throw new Error("SUBMISSION_MEDIA_INVALID");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const verifiedPath = `verified-tournament-submissions/${input.tournamentId}/${input.submissionId}/${sha256}`;
  const target = bucket.file(verifiedPath);
  try {
    await target.save(bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: metadata.contentType, cacheControl: "private, no-store" } });
  } catch (error) {
    // An identical concurrent revision may already own this content-addressed object.
    if (!(error && typeof error === "object" && "code" in error && Number(error.code) === 412)) throw error;
  }
  const [saved] = await target.getMetadata();
  if (Number(saved.size) !== size || saved.contentType !== metadata.contentType || saved.metadata?.firebaseStorageDownloadTokens) throw new Error("SUBMISSION_MEDIA_INVALID");
  return { status: "verified", path: verifiedPath, sourcePath: input.path, generation: String(saved.generation), size, contentType: String(saved.contentType), sha256, inspected, verifiedAt: new Date().toISOString() };
}
