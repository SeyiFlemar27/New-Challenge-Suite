import { NORMAL_MEDIA_LIMITS } from "@/lib/normal-challenge-config";
import type { UploadFileValidation } from "@/components/media-upload-field";

function loadImage(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("IMAGE_METADATA_FAILED")); };
    image.src = url;
  });
}

function loadVideo(file: File) {
  return new Promise<{ width: number; height: number; durationSeconds: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve({ width: video.videoWidth, height: video.videoHeight, durationSeconds: video.duration }); };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("VIDEO_METADATA_FAILED")); };
    video.src = url;
  });
}

export async function validateNormalChallengeImage(file: File): Promise<UploadFileValidation> {
  try {
    const dimensions = await loadImage(file);
    if (dimensions.width < NORMAL_MEDIA_LIMITS.imageMinWidth || dimensions.height < NORMAL_MEDIA_LIMITS.imageMinHeight) return { ok: false, code: "image_too_small", message: "Image must be at least 712 x 430 pixels." };
    if (dimensions.width > NORMAL_MEDIA_LIMITS.imageMaxWidth || dimensions.height > NORMAL_MEDIA_LIMITS.imageMaxHeight) return { ok: false, code: "image_too_large", message: "Image must be no larger than 4000 x 2416 pixels." };
    return { ok: true, metadata: dimensions };
  } catch { return { ok: false, code: "image_metadata_failed", message: "We couldn't read this image. Choose another JPEG, PNG, or WebP file." }; }
}

export async function validateNormalChallengeVideo(file: File): Promise<UploadFileValidation> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!(["mp4", "avi"].includes(extension || ""))) return { ok: false, code: "invalid_video_type", message: "Video must be an MP4 or AVI file." };
  try {
    const metadata = await loadVideo(file);
    if (metadata.width < NORMAL_MEDIA_LIMITS.videoMinWidth || metadata.height < NORMAL_MEDIA_LIMITS.videoMinHeight) return { ok: false, code: "video_too_small", message: "Video must be at least 1280 x 720 pixels." };
    if (!Number.isFinite(metadata.durationSeconds) || metadata.durationSeconds > NORMAL_MEDIA_LIMITS.videoMaxDurationSeconds) return { ok: false, code: "video_too_long", message: "Video must be 75 seconds or shorter." };
    return { ok: true, metadata };
  } catch { return { ok: false, code: "video_metadata_failed", message: "We couldn't read this video. Choose another MP4 or AVI file." }; }
}
