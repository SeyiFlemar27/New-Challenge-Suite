import { createHash } from "node:crypto";
import { getAdminStorage } from "@/lib/firebase/admin";
import { verifyCreatorImage } from "@/lib/server/creator-image-verification";
import { inspectVideoBytes, validateInspectedMedia } from "@/lib/server/media-inspection";

export async function verifyTournamentBuilderMedia(tournament: Record<string, unknown>, ownerId: string) {
  const coverMedia = tournament.coverMedia as Record<string, unknown> | undefined;
  const cover = await verifyCreatorImage(String(tournament.coverImagePath ?? coverMedia?.path ?? ""), ownerId);
  const gallery = Array.isArray(tournament.galleryMedia) ? tournament.galleryMedia : [];
  if (gallery.length > 2) throw new Error("TOURNAMENT_GALLERY_LIMIT");
  const additional = await Promise.all(gallery.map(media => verifyCreatorImage(String((media as Record<string, unknown>).path ?? ""), ownerId)));
  const trailerMedia = tournament.trailerMedia as Record<string, unknown> | undefined;
  const path = String(tournament.trailerPath ?? trailerMedia?.path ?? "");
  if (!path) return { cover, gallery: additional, trailer: null };
  if (!path.startsWith(`tournaments/drafts/${ownerId}/trailer/`) || path.includes("..")) throw new Error("MEDIA_OWNERSHIP_INVALID");
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
