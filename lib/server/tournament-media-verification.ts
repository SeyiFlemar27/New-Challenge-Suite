import { createHash } from "node:crypto";
import { getAdminStorage } from "@/lib/firebase/admin";
import { verifyCreatorImage } from "@/lib/server/creator-image-verification";
import { inspectImageBytes, inspectVideoBytes, normalizeImageBytes, validateInspectedMedia } from "@/lib/server/media-inspection";

/** Repair only the historical mixed source-path/protected-URL pair using its server-owned verification record. */
export function normalizeTournamentReviewMedia(record: Record<string, unknown>) {
  const cover = record.coverMedia as Record<string, unknown> | undefined;
  const verified = (record.creatorMediaVerification as { cover?: Record<string, unknown> } | undefined)?.cover;
  return cover && verified && cover.path === verified.sourcePath && cover.url === verified.url
    ? { ...record, coverMedia: { ...cover, path: verified.path } } : record;
}

export async function verifyTournamentBuilderMedia(tournament: Record<string, unknown>, ownerId: string) {
  const coverMedia = tournament.coverMedia as Record<string, unknown> | undefined;
  async function image(path: string) {
    const prefix = `verified-tournament-media/${tournament.id}/`;
    if (!tournament.id || !path.startsWith(prefix)) return verifyCreatorImage(path, ownerId);
    const digest = path.slice(prefix.length); if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("MEDIA_OWNERSHIP_INVALID");
    const storage = getAdminStorage(); if (!storage) throw new Error("MEDIA_STORAGE_UNAVAILABLE");
    const file = storage.bucket().file(path); const [metadata] = await file.getMetadata(); const [bytes] = await file.download(); const [latest] = await file.getMetadata();
    if (String(metadata.generation) !== String(latest.generation) || bytes.length !== Number(metadata.size) || createHash("sha256").update(bytes).digest("hex") !== digest) throw new Error("MEDIA_OBJECT_CHANGED");
    const inspected = await inspectImageBytes(bytes); validateInspectedMedia({ expectedType: "image", field: "coverImagePath" }, inspected, bytes.length);
    if (`image/${inspected.format}` !== metadata.contentType) throw new Error("MEDIA_IMAGE_FORMAT_INVALID"); await normalizeImageBytes(bytes);
    return { status: "verified", path, generation: String(metadata.generation), size: bytes.length, sha256: digest, width: inspected.width, height: inspected.height, verifiedAt: new Date().toISOString() };
  }
  const cover = await image(String(tournament.coverImagePath ?? coverMedia?.path ?? ""));
  const gallery = Array.isArray(tournament.galleryMedia) ? tournament.galleryMedia : [];
  if (gallery.length > 2) throw new Error("TOURNAMENT_GALLERY_LIMIT");
  const additional = await Promise.all(gallery.map(media => image(String((media as Record<string, unknown>).path ?? ""))));
  const trailerMedia = tournament.trailerMedia as Record<string, unknown> | undefined;
  const path = String(tournament.trailerPath ?? trailerMedia?.path ?? "");
  if (!path) return { cover, gallery: additional, trailer: null };
  const frozenTrailerPrefix = `verified-tournament-media/${tournament.id}/`;
  const frozenTrailer = Boolean(tournament.id) && path.startsWith(frozenTrailerPrefix) && /^[a-f0-9]{64}$/.test(path.slice(frozenTrailerPrefix.length));
  if ((!path.startsWith(`tournaments/drafts/${ownerId}/trailer/`) && !frozenTrailer) || path.includes("..")) throw new Error("MEDIA_OWNERSHIP_INVALID");
  const storage = getAdminStorage();
  if (!storage) throw new Error("MEDIA_STORAGE_UNAVAILABLE");
  const file = storage.bucket().file(path);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  if (!Number.isSafeInteger(size) || size <= 0 || size > 49 * 1024 * 1024) throw new Error("MEDIA_VIDEO_TOO_LARGE");
  if (!["video/mp4", "video/x-msvideo", "video/avi"].includes(String(metadata.contentType))) throw new Error("MEDIA_VIDEO_FORMAT_INVALID");
  const [bytes] = await file.download();
  const [after] = await file.getMetadata();
  if (String(after.generation) !== String(metadata.generation) || bytes.length !== size) throw new Error("MEDIA_OBJECT_CHANGED");
  if (frozenTrailer && createHash("sha256").update(bytes).digest("hex") !== path.slice(frozenTrailerPrefix.length)) throw new Error("MEDIA_OBJECT_CHANGED");
  const inspected = inspectVideoBytes(bytes);
  validateInspectedMedia({ field: "trailerVideoPath", expectedType: "video" }, inspected, size);
  if ((inspected.format === "mp4") !== (metadata.contentType === "video/mp4")) throw new Error("MEDIA_VIDEO_FORMAT_INVALID");
  return { cover, gallery: additional, trailer: { status: "verified", path, generation: String(metadata.generation), size, sha256: createHash("sha256").update(bytes).digest("hex"), ...inspected, verifiedAt: new Date().toISOString() } };
}

/** Reviewed promotional bytes cannot be changed later through an owner-writable draft path. */
export async function freezeTournamentBuilderMedia(tournamentId: string, verification: Awaited<ReturnType<typeof verifyTournamentBuilderMedia>>) {
  const storage = getAdminStorage();
  if (!storage) throw new Error("MEDIA_STORAGE_UNAVAILABLE");
  async function snapshot<T extends { path: string; generation: string; size: number; sha256: string }>(asset: T) {
    const bucket = storage!.bucket();
    const [bytes] = await bucket.file(asset.path, { generation: asset.generation }).download();
    if (bytes.length !== asset.size || createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error("MEDIA_OBJECT_CHANGED");
    const [sourceMetadata] = await bucket.file(asset.path, { generation: asset.generation }).getMetadata();
    const path = `verified-tournament-media/${tournamentId}/${asset.sha256}`;
    const target = bucket.file(path);
    try { await target.save(bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: sourceMetadata.contentType, cacheControl: "private, no-store" } }); }
    catch (error) { if (!(error && typeof error === "object" && "code" in error && Number(error.code) === 412)) throw error; }
    const [metadata] = await target.getMetadata();
    if (Number(metadata.size) !== asset.size || metadata.contentType !== sourceMetadata.contentType || metadata.metadata?.firebaseStorageDownloadTokens) throw new Error("MEDIA_SNAPSHOT_INVALID");
    return { ...asset, sourcePath: asset.path, path, generation: String(metadata.generation), contentType: String(metadata.contentType), url: `/api/tournaments/${encodeURIComponent(tournamentId)}/media/${asset.sha256}` };
  }
  return { cover: await snapshot(verification.cover), gallery: await Promise.all(verification.gallery.map(snapshot)), trailer: verification.trailer ? await snapshot(verification.trailer) : null };
}
