import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminStorage } from "@/lib/firebase/admin";
import { challengeMediaDeliveryUrl } from "@/lib/server/challenge-media-delivery";
import { inspectImageBytes, inspectVideoBytes, normalizeImageBytes, validateInspectedMedia, type InspectedMedia } from "@/lib/server/media-inspection";
import { isModernNormalChallenge, NORMAL_MEDIA_LIMITS } from "@/lib/normal-challenge-config";

type MediaCandidate = { path: string; expectedType: "image" | "video"; field: string };
type VerifiedAsset = MediaCandidate & { generation: string | null; size: number; sha256: string; inspected: InspectedMedia; url: string };
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

async function removeDownloadToken(file: StorageFile, field: string) {
  let [metadata] = await file.getMetadata();
  const objectMetadata = { ...(metadata.metadata ?? {}) } as Record<string, string>;
  if (!objectMetadata.firebaseStorageDownloadTokens) return metadata;
  delete objectMetadata.firebaseStorageDownloadTokens;
  await file.setMetadata({ metadata: objectMetadata });
  [metadata] = await file.getMetadata();
  if (metadata.metadata?.firebaseStorageDownloadTokens) throw new Error(`MEDIA_DOWNLOAD_TOKEN_COULD_NOT_BE_REMOVED:${field}`);
  return metadata;
}

export async function verifyChallengeMedia(db: Firestore, challengeId: string, challenge: Record<string, unknown>, creatorId: string) {
  const list = candidates(challenge);
  const modernNormalChallenge = isModernNormalChallenge(challenge);
  const required = !challenge.usesPlaceholderMedia && (modernNormalChallenge || Boolean(challenge.coverImagePath || challenge.coverImageUrl));
  if (!list.length) {
    if (required) throw new Error("MEDIA_REQUIRED");
    return { version: 1, status: "not_required", assets: [], verifiedAt: new Date().toISOString() };
  }
  const storage = getAdminStorage();
  if (!storage) throw new Error("MEDIA_STORAGE_UNAVAILABLE");
  const bucket = storage.bucket();
  const assets: VerifiedAsset[] = [];
  for (const candidate of list) {
    const ownerDraftPath = candidate.path.startsWith(`challenges/drafts/${creatorId}/`);
    const challengePath = candidate.path.startsWith(`challenges/${challengeId}/`);
    if ((!ownerDraftPath && !challengePath) || candidate.path.includes("..") || candidate.path.startsWith("/")) throw new Error(`MEDIA_PATH_NOT_CHALLENGE_SCOPED:${candidate.field}`);
    const file = bucket.file(candidate.path);
    const [exists] = await file.exists();
    if (!exists) throw new Error(`MEDIA_OBJECT_MISSING:${candidate.field}`);
    const [metadata] = await file.getMetadata();
    const generation = String(metadata.generation ?? "");
    const declaredSize = Number(metadata.size ?? 0);
    const max = candidate.expectedType === "image" ? NORMAL_MEDIA_LIMITS.imageBytes : NORMAL_MEDIA_LIMITS.videoBytes;
    if (!Number.isSafeInteger(declaredSize) || declaredSize <= 0 || (candidate.expectedType === "image" ? declaredSize > max : declaredSize >= max)) throw new Error(`MEDIA_SIZE_INVALID:${candidate.field}`);
    const [sourceBytes] = await file.download();
    const [latestMetadata] = await file.getMetadata();
    if (generation && String(latestMetadata.generation ?? "") !== generation) throw new Error(`MEDIA_OBJECT_CHANGED_DURING_VERIFICATION:${candidate.field}`);
    if (sourceBytes.length !== declaredSize) throw new Error(`MEDIA_SIZE_MISMATCH:${candidate.field}`);
    let bytes = sourceBytes;
    let inspected: InspectedMedia;
    if (candidate.expectedType === "image") {
      const sourceInspection = await inspectImageBytes(sourceBytes);
      validateInspectedMedia(candidate, sourceInspection, sourceBytes.length);
      const normalized = await normalizeImageBytes(sourceBytes);
      bytes = normalized.bytes;
      inspected = normalized.inspected;
    } else inspected = inspectVideoBytes(sourceBytes);
    validateInspectedMedia(candidate, inspected, bytes.length);
    const contentType = candidate.expectedType === "image" ? `image/${inspected.format}` : String(metadata.contentType ?? "").toLowerCase();
    const allowedTypes = candidate.expectedType === "image" ? ["image/jpeg", "image/png", "image/webp"] : inspected.format === "mp4" ? ["video/mp4"] : ["video/avi", "video/x-msvideo"];
    if (!allowedTypes.includes(contentType)) throw new Error(`MEDIA_CONTENT_TYPE_INVALID:${candidate.field}`);
    let verifiedPath = candidate.path;
    let verifiedGeneration = generation || null;
    let verifiedBytes = bytes;
    if (ownerDraftPath) {
      const extension = inspected.format === "jpeg" ? "jpg" : inspected.format;
      verifiedPath = `verified-challenge-media/${challengeId}/${candidate.expectedType === "image" ? "images" : "videos"}/${createHash("sha256").update(candidate.path).digest("hex").slice(0, 20)}.${extension}`;
      const verifiedFile = bucket.file(verifiedPath);
      const [verifiedExists] = await verifiedFile.exists();
      if (verifiedExists) {
        const [existingBytes] = await verifiedFile.download();
        if (!existingBytes.equals(bytes)) throw new Error(`MEDIA_VERIFIED_OBJECT_COLLISION:${candidate.field}`);
        verifiedBytes = existingBytes;
      } else {
        await verifiedFile.save(bytes, { resumable: false, metadata: { contentType, metadata: { normalizedBy: "challenge-media-verification-v1", sourceGeneration: generation || "unknown" } }, preconditionOpts: { ifGenerationMatch: 0 } });
      }
      const verifiedMetadata = await removeDownloadToken(verifiedFile, candidate.field);
      verifiedGeneration = String(verifiedMetadata.generation ?? "") || null;
    }
    // Upload SDKs may have attached a bearer download token to the source file.
    // Revoke that capability after verification; readers use the server route.
    await removeDownloadToken(file, candidate.field);
    // Persist only an application URL. Firebase download-token URLs are bearer
    // capabilities and bypass Storage Rules after they have been shared.
    const verifiedUrl = challengeMediaDeliveryUrl(verifiedPath);
    assets.push({ ...candidate, path: verifiedPath, generation: verifiedGeneration, size: verifiedBytes.length, sha256: createHash("sha256").update(verifiedBytes).digest("hex"), inspected, url: verifiedUrl });
  }
  const verification = { version: 1, status: "verified", verifiedAt: new Date().toISOString(), assets };
  return verification;
}

export async function recordChallengeMediaVerificationFailure(db: Firestore, challengeId: string, reason: string) {
  await db.collection("challengeMediaVerifications").doc(challengeId).set({ version: 1, status: "rejected", reason: reason.slice(0, 180), verifiedAt: new Date().toISOString() }, { merge: true });
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
  const direct: Array<[string, string]> = [["coverImagePath", "coverImageUrl"], ["promoImagePath", "promoImageUrl"], ["trailerVideoPath", "trailerVideoUrl"], ["promoVideoPath", "promoVideoUrl"]];
  for (const [pathField, urlField] of direct) {
    const asset = byField.get(pathField);
    if (asset) { challenge[pathField] = asset.path; challenge[urlField] = asset.url; }
  }
  if (Array.isArray(challenge.challengeImages)) {
    challenge.challengeImages = (challenge.challengeImages as Array<Record<string, unknown>>).map((image, index) => {
      const asset = byField.get(`challengeImages.${index}.path`);
      return asset ? { ...image, path: asset.path, url: asset.url } : image;
    });
  }
  if (challenge.challengeVideo && typeof challenge.challengeVideo === "object") {
    const asset = byField.get("challengeVideo.path");
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
  return challenge;
}
