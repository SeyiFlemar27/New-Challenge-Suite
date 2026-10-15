import { createHash } from "node:crypto";
import { getAdminStorage } from "@/lib/firebase/admin";
import { CREATOR_IMAGE_MAX_BYTES, isCreatorImageFolder } from "@/lib/creator-media-policy";
import { inspectImageBytes, normalizeImageBytes, validateInspectedMedia } from "@/lib/server/media-inspection";

export async function verifyCreatorImage(path: string, ownerId: string) {
  const parts = path.split("/");
  const folder = parts.slice(0, -1).join("/");
  if (!isCreatorImageFolder(folder) || parts[2] !== ownerId || path.includes("..") || !parts.at(-1)) throw new Error("MEDIA_OWNERSHIP_INVALID");
  const storage = getAdminStorage();
  if (!storage) throw new Error("MEDIA_STORAGE_UNAVAILABLE");
  const file = storage.bucket().file(path);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  if (!Number.isSafeInteger(size) || size <= 0 || size > CREATOR_IMAGE_MAX_BYTES) throw new Error("MEDIA_IMAGE_TOO_LARGE");
  if (!["image/jpeg", "image/png", "image/webp"].includes(String(metadata.contentType))) throw new Error("MEDIA_IMAGE_FORMAT_INVALID");
  const [bytes] = await file.download();
  const [after] = await file.getMetadata();
  if (String(after.generation) !== String(metadata.generation) || bytes.length !== size) throw new Error("MEDIA_OBJECT_CHANGED");
  const inspected = await inspectImageBytes(bytes);
  validateInspectedMedia({ expectedType: "image", field: "coverImagePath" }, inspected, bytes.length);
  if (`image/${inspected.format}` !== metadata.contentType) throw new Error("MEDIA_IMAGE_FORMAT_INVALID");
  await normalizeImageBytes(bytes); // Force safe decoding, not just header parsing.
  return { status: "verified", path, generation: String(metadata.generation), size, sha256: createHash("sha256").update(bytes).digest("hex"), width: inspected.width, height: inspected.height, verifiedAt: new Date().toISOString() };
}
