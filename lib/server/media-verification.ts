import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminStorage } from "@/lib/firebase/admin";
import { challengeMediaDeliveryUrl } from "@/lib/server/challenge-media-delivery";
import { inspectImageBytes, inspectVideoBytes, normalizeImageBytes, validateInspectedMedia, type InspectedMedia } from "@/lib/server/media-inspection";
import { NORMAL_MEDIA_LIMITS } from "@/lib/normal-challenge-config";
import { MediaVerificationError } from "@/lib/server/media-verification-errors";

type MediaCandidate = { path: string; expectedType: "image" | "video"; field: string };
type VerifiedAsset = MediaCandidate & { sourcePath: string; generation: string | null; size: number; sha256: string; inspected: InspectedMedia; url: string };
type StorageFile = ReturnType<ReturnType<NonNullable<ReturnType<typeof getAdminStorage>>["bucket"]>["file"]>;

function candidates(challenge: Record<string, unknown>): MediaCandidate[] {
  const result: MediaCandidate[] = [];
  const add = (field: string, value: unknown, expectedType: "image" | "video") => {
    if (typeof value === "string" && value.trim()) result.push({ field, path: value.trim(), expectedType });
  };
  add("coverImagePath", challenge.coverImagePath, "image");
  add("promoImagePath", challenge.promoImagePath, "image");
  add("trailerVideoPath", challenge.trailerVideoPath, "video");
  add("promoVideoPath", challenge.promoVideoPath, "video");
  const images = Array.isArray(challenge.challengeImages) ? challenge.challengeImages : [];
  images.forEach((item, index) => add(`challengeImages.${index}.path`, (item as Record<string, unknown> | null)?.path, "image"));
  if (challenge.challengeVideo && typeof challenge.challengeVideo === "object") add("challengeVideo.path", (challenge.challengeVideo as Record<string, unknown>).path, "video");
  const seen = new Set<string>();
  return result.filter((candidate) => {
    if (seen.has(candidate.path)) return false;
    seen.add(candidate.path);
    return true;
  });
}

export async function removeDownloadToken(file: StorageFile, field: string) {
  let [metadata] = await file.getMetadata();
  if (!metadata.metadata?.firebaseStorageDownloadTokens) return metadata;
  // GCS metadata PATCH merges keys. Omission retains a bearer token; null deletes it.
  await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: null } });
  [metadata] = await file.getMetadata();
  if (metadata.metadata?.firebaseStorageDownloadTokens) throw new Error(`MEDIA_DOWNLOAD_TOKEN_COULD_NOT_BE_REMOVED:${field}`);
  return metadata;
}

export async function verifyChallengeMedia(db: Firestore, challengeId: string, challenge: Record<string, unknown>, creatorId: string) {
  const list = candidates(challenge);
  if (!list.some((item) => item.expectedType === "image")) throw new Error("MEDIA_REQUIRED");
  const storage = getAdminStorage();
  if (!storage) throw new Error("MEDIA_STORAGE_UNAVAILABLE");
  const bucket = storage.bucket();
  const assets: VerifiedAsset[] = [];
  let stage = "validation";
  try {
  for (const candidate of list) {
    stage = "validation";
    const ownerDraftPath = ["challenges/drafts", "challenges/host-drafts", "challenges/hybrid-drafts", "live-events/drafts", "live-events/hybrid-drafts"].some((prefix) => candidate.path.startsWith(`${prefix}/${creatorId}/`));
    const challengePath = candidate.path.startsWith(`challenges/${challengeId}/`);
    const verifiedChallengePath = candidate.path.startsWith(`verified-challenge-media/${challengeId}/`);
    if ((!ownerDraftPath && !challengePath && !verifiedChallengePath) || candidate.path.includes("..") || candidate.path.startsWith("/")) throw new Error(`MEDIA_PATH_NOT_CHALLENGE_SCOPED:${candidate.field}`);
    const file = bucket.file(candidate.path);
    stage = "source_metadata";
    const [exists] = await file.exists();
    if (!exists) throw new Error(`MEDIA_OBJECT_MISSING:${candidate.field}`);
    const [metadata] = await file.getMetadata();
    const generation = String(metadata.generation ?? "");
    const declaredSize = Number(metadata.size ?? 0);
    const max = candidate.expectedType === "image" ? NORMAL_MEDIA_LIMITS.imageBytes : NORMAL_MEDIA_LIMITS.videoBytes;
    if (!Number.isSafeInteger(declaredSize) || declaredSize <= 0 || (candidate.expectedType === "image" ? declaredSize > max : declaredSize >= max)) throw new Error(`MEDIA_SIZE_INVALID:${candidate.field}`);
    stage = "source_read";
    const [sourceBytes] = await file.download();
    const [latestMetadata] = await file.getMetadata();
    if (generation && String(latestMetadata.generation ?? "") !== generation) throw new Error(`MEDIA_OBJECT_CHANGED_DURING_VERIFICATION:${candidate.field}`);
    if (sourceBytes.length !== declaredSize) throw new Error(`MEDIA_SIZE_MISMATCH:${candidate.field}`);
    let bytes = sourceBytes;
    let inspected: InspectedMedia;
    stage = "inspection";
    if (candidate.expectedType === "image") {
      const sourceInspection = await inspectImageBytes(sourceBytes);
      if (String(metadata.contentType ?? "").toLowerCase() !== `image/${sourceInspection.format}`) throw new Error(`MEDIA_CONTENT_TYPE_INVALID:${candidate.field}`);
      validateInspectedMedia(candidate, sourceInspection, sourceBytes.length);
      stage = "normalization";
      const normalized = await normalizeImageBytes(sourceBytes);
      bytes = verifiedChallengePath ? sourceBytes : normalized.bytes;
      inspected = verifiedChallengePath ? sourceInspection : normalized.inspected;
    } else inspected = inspectVideoBytes(sourceBytes);
    validateInspectedMedia(candidate, inspected, bytes.length);
    const contentType = candidate.expectedType === "image" ? `image/${inspected.format}` : String(metadata.contentType ?? "").toLowerCase();
    const allowedTypes = candidate.expectedType === "image" ? ["image/jpeg", "image/png", "image/webp"] : inspected.format === "mp4" ? ["video/mp4"] : ["video/avi", "video/x-msvideo"];
    if (!allowedTypes.includes(contentType)) throw new Error(`MEDIA_CONTENT_TYPE_INVALID:${candidate.field}`);
    if (!allowedTypes.includes(String(metadata.contentType ?? "").toLowerCase())) throw new Error(`MEDIA_CONTENT_TYPE_INVALID:${candidate.field}`);
    let verifiedPath = candidate.path;
    let verifiedGeneration = generation || null;
    let verifiedBytes = bytes;
    if (ownerDraftPath) {
      stage = "verified_copy";
      const extension = inspected.format === "jpeg" ? "jpg" : inspected.format;
      verifiedPath = `verified-challenge-media/${challengeId}/${candidate.expectedType === "image" ? "images" : "videos"}/${createHash("sha256").update(candidate.path).update("\0").update(sourceBytes).digest("hex").slice(0, 20)}.${extension}`;
      const verifiedFile = bucket.file(verifiedPath);
      const [verifiedExists] = await verifiedFile.exists();
      if (verifiedExists) {
        const [existingBytes] = await verifiedFile.download();
        if (!existingBytes.equals(bytes)) throw new Error(`MEDIA_VERIFIED_OBJECT_COLLISION:${candidate.field}`);
        verifiedBytes = existingBytes;
      } else {
        try {
          await verifiedFile.save(bytes, { resumable: false, metadata: { contentType, metadata: { normalizedBy: "challenge-media-verification-v1", sourceGeneration: generation || "unknown" } }, preconditionOpts: { ifGenerationMatch: 0 } });
        } catch (error) {
          if (Number((error as { code?: unknown }).code) !== 412) throw error;
          const [concurrentBytes] = await verifiedFile.download();
          if (!concurrentBytes.equals(bytes)) throw new Error(`MEDIA_VERIFIED_OBJECT_COLLISION:${candidate.field}`);
          verifiedBytes = concurrentBytes;
        }
      }
      stage = "token_revocation";
      const verifiedMetadata = await removeDownloadToken(verifiedFile, candidate.field);
      verifiedGeneration = String(verifiedMetadata.generation ?? "") || null;
    }
    // Upload SDKs may have attached a bearer download token to the source file.
    // Revoke that capability after verification; readers use the server route.
    stage = "token_revocation";
    await removeDownloadToken(file, candidate.field);
    // Persist only an application URL. Firebase download-token URLs are bearer
    // capabilities and bypass Storage Rules after they have been shared.
    const verifiedUrl = challengeMediaDeliveryUrl(verifiedPath);
    assets.push({ ...candidate, sourcePath: candidate.path, path: verifiedPath, generation: verifiedGeneration, size: verifiedBytes.length, sha256: createHash("sha256").update(verifiedBytes).digest("hex"), inspected, url: verifiedUrl });
  }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const category = /^MEDIA_[A-Z_]+(?=:|$)/.exec(message)?.[0]
      ?? (Number((error as { code?: unknown })?.code) === 403 ? "MEDIA_STORAGE_PERMISSION_DENIED"
        : Number((error as { code?: unknown })?.code) === 404 ? "MEDIA_OBJECT_MISSING"
          : stage === "inspection" && /unsupported image|corrupt|invalid|input buffer|pixel limit/i.test(message) ? "MEDIA_IMAGE_FORMAT_INVALID" : "MEDIA_VERIFICATION_FAILED");
    throw new MediaVerificationError(category, stage, error);
  }
  const verification = { version: 1, status: "verified", verifiedAt: new Date().toISOString(), assets };
  return verification;
}

export async function recordChallengeMediaVerificationFailure(db: Firestore, challengeId: string, reason: string, diagnostic?: { requestId: string; stage: string }) {
  const failure = { category: reason, stage: diagnostic?.stage ?? "verification", requestId: diagnostic?.requestId ?? "unreferenced", occurredAt: new Date().toISOString() };
  const ref = db.collection("challengeMediaVerifications").doc(challengeId);
  await ref.set({ version: 1, status: "rejected", reason: reason.slice(0, 180), verifiedAt: failure.occurredAt, lastFailure: failure }, { merge: true });
  if (diagnostic) await ref.collection("attempts").doc(diagnostic.requestId).set(failure);
  console.warn("[challenge-media-verification]", failure);
}

export async function persistChallengeMediaVerification(db: Firestore, challengeId: string, verification: Record<string, unknown>) {
  await db.collection("challengeMediaVerifications").doc(challengeId).set(verification, { merge: true });
}

export async function deleteUnpublishedChallengeMedia(db: Firestore, challengeId: string, challenge: Record<string, unknown>, creatorId: string) {
  const paths = [...new Set(candidates(challenge).map((candidate) => candidate.path))];
  const safePaths = paths.filter((path) => !path.includes("..")
    && (path.startsWith(`challenges/drafts/${creatorId}/`) || path.startsWith(`challenges/${challengeId}/`)));
  if (safePaths.length) {
    const storage = getAdminStorage();
    if (!storage) throw new Error("MEDIA_STORAGE_UNAVAILABLE");
    await Promise.all(safePaths.map((path) => storage.bucket().file(path).delete({ ignoreNotFound: true })));
  }
  await db.collection("challengeMediaVerifications").doc(challengeId).delete().catch(() => undefined);
  return { deletedAssetCount: safePaths.length };
}

export function applyVerifiedChallengeMedia(challenge: Record<string, unknown>, verification: Record<string, unknown>) {
  const assets = Array.isArray(verification.assets) ? verification.assets as Array<Record<string, unknown>> : [];
  const byField = new Map(assets.map((asset) => [String(asset.field), asset]));
  // One uploaded object can be referenced by both the cover and the gallery.
  // Inspection is deduplicated by path, but every reference must be rewritten.
  const bySourcePath = new Map(assets.filter((asset) => typeof asset.sourcePath === "string").map((asset) => [String(asset.sourcePath), asset]));
  const direct: Array<[string, string]> = [["coverImagePath", "coverImageUrl"], ["promoImagePath", "promoImageUrl"], ["trailerVideoPath", "trailerVideoUrl"], ["promoVideoPath", "promoVideoUrl"]];
  for (const [pathField, urlField] of direct) {
    const asset = byField.get(pathField) ?? bySourcePath.get(String(challenge[pathField] ?? ""));
    if (asset) { challenge[pathField] = asset.path; challenge[urlField] = asset.url; }
  }
  if (Array.isArray(challenge.challengeImages)) {
    challenge.challengeImages = (challenge.challengeImages as Array<Record<string, unknown>>).map((image, index) => {
      const asset = byField.get(`challengeImages.${index}.path`) ?? bySourcePath.get(String(image.path ?? ""));
      return asset ? { ...image, path: asset.path, url: asset.url } : image;
    });
  }
  if (challenge.challengeVideo && typeof challenge.challengeVideo === "object") {
    const asset = byField.get("challengeVideo.path") ?? bySourcePath.get(String((challenge.challengeVideo as Record<string, unknown>).path ?? ""));
    if (asset) challenge.challengeVideo = { ...(challenge.challengeVideo as Record<string, unknown>), path: asset.path, url: asset.url };
  }
  // Storage Rules cannot inspect an array of objects to authorize one exact
  // gallery path. Persist a server-derived list of the verified public image
  // paths so rules can allow only referenced media while staying within the
  // cross-service document-access limit. Visibility/status checks still gate
  // every read, and private previews expose only their cover.
  const publicPaths = new Set<string>();
  if (typeof challenge.coverImagePath === "string" && challenge.coverImagePath.trim()) {
    publicPaths.add(challenge.coverImagePath.trim());
  }
  if (Array.isArray(challenge.challengeImages)) {
    for (const image of challenge.challengeImages) {
      const path = image && typeof image === "object" ? (image as Record<string, unknown>).path : null;
      if (typeof path === "string" && path.trim()) publicPaths.add(path.trim());
    }
  }
  challenge.publicMediaPaths = [...publicPaths];
  const primary = assets.find((asset) => asset.expectedType === "image");
  if (primary) { challenge.coverImagePath = primary.path; challenge.coverImageUrl = primary.url; }
  return challenge;
}
