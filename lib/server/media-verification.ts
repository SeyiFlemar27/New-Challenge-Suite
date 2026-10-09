import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminStorage } from "@/lib/firebase/admin";
import { inspectImageBytes, inspectVideoBytes, normalizeImageBytes, validateInspectedMedia, type InspectedMedia } from "@/lib/server/media-inspection";
import { NORMAL_MEDIA_LIMITS } from "@/lib/normal-challenge-config";

type MediaCandidate = { path: string; expectedType: "image" | "video"; field: string };
type VerifiedAsset = MediaCandidate & { generation: string | null; size: number; sha256: string; inspected: InspectedMedia; url: string };

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

export async function verifyChallengeMedia(db: Firestore, challengeId: string, challenge: Record<string, unknown>, creatorId: string) {
  const list = candidates(challenge);
  const normalV2 = String(challenge.builderVersion ?? "") === "normal_v2";
  const required = !challenge.usesPlaceholderMedia && (normalV2 || Boolean(challenge.coverImagePath || challenge.coverImageUrl));
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
        const downloadToken = randomUUID();
        await verifiedFile.save(bytes, { resumable: false, metadata: { contentType, metadata: { firebaseStorageDownloadTokens: downloadToken, normalizedBy: "challenge-media-verification-v1", sourceGeneration: generation || "unknown" } }, preconditionOpts: { ifGenerationMatch: 0 } });
      }
      const [verifiedMetadata] = await verifiedFile.getMetadata();
      verifiedGeneration = String(verifiedMetadata.generation ?? "") || null;
    }
    const sourceUrl = candidate.field.startsWith("challengeImages.")
      ? (challenge.challengeImages as Array<Record<string, unknown>> | undefined)?.[Number(candidate.field.split(".")[1])]?.url
      : candidate.field === "challengeVideo.path"
        ? (challenge.challengeVideo as Record<string, unknown> | null)?.url
        : (challenge as Record<string, unknown>)[candidate.field.replace(/Path$/, "Url")];
    let verifiedUrl = typeof sourceUrl === "string" ? sourceUrl : "";
    if (ownerDraftPath) {
      const token = String((await bucket.file(verifiedPath).getMetadata())[0].metadata?.firebaseStorageDownloadTokens ?? "").split(",")[0];
      if (!token) throw new Error(`MEDIA_DOWNLOAD_TOKEN_MISSING:${candidate.field}`);
      const encodedPath = encodeURIComponent(verifiedPath);
      const bucketName = bucket.name;
      verifiedUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;
    }
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
  return challenge;
}
