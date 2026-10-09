import sharp from "sharp";
import { NORMAL_MEDIA_LIMITS } from "../normal-challenge-media-policy.js";

export type InspectedMedia = {
  mediaType: "image" | "video";
  format: "jpeg" | "png" | "webp" | "mp4" | "avi";
  width: number;
  height: number;
  durationSeconds?: number;
  codec?: string;
  dpiX?: number;
  dpiY?: number;
  dpiStatus?: "available" | "unavailable";
};

export function validateInspectedMedia(candidate: { expectedType: "image" | "video"; field: string }, inspected: InspectedMedia, size: number) {
  if (candidate.expectedType !== inspected.mediaType) throw new Error(`MEDIA_TYPE_MISMATCH:${candidate.field}`);
  if (candidate.expectedType === "image") {
    if (size > NORMAL_MEDIA_LIMITS.imageBytes) throw new Error(`MEDIA_IMAGE_TOO_LARGE:${candidate.field}`);
    if (inspected.width < NORMAL_MEDIA_LIMITS.imageMinWidth || inspected.height < NORMAL_MEDIA_LIMITS.imageMinHeight || inspected.width > NORMAL_MEDIA_LIMITS.imageMaxWidth || inspected.height > NORMAL_MEDIA_LIMITS.imageMaxHeight) throw new Error(`MEDIA_IMAGE_DIMENSIONS_INVALID:${candidate.field}`);
    if (inspected.dpiStatus === "available" && ((inspected.dpiX ?? 0) > 0 && Math.abs((inspected.dpiX ?? 0) - 72) > 1 || (inspected.dpiY ?? 0) > 0 && Math.abs((inspected.dpiY ?? 0) - 72) > 1)) throw new Error(`MEDIA_IMAGE_DPI_INVALID:${candidate.field}`);
  } else {
    if (size >= NORMAL_MEDIA_LIMITS.videoBytes) throw new Error(`MEDIA_VIDEO_TOO_LARGE:${candidate.field}`);
    if (inspected.width < NORMAL_MEDIA_LIMITS.videoMinWidth || inspected.height < NORMAL_MEDIA_LIMITS.videoMinHeight || inspected.width <= inspected.height) throw new Error(`MEDIA_VIDEO_DIMENSIONS_INVALID:${candidate.field}`);
    if (!Number.isFinite(inspected.durationSeconds) || (inspected.durationSeconds ?? Infinity) > NORMAL_MEDIA_LIMITS.videoMaxDurationSeconds) throw new Error(`MEDIA_VIDEO_DURATION_INVALID:${candidate.field}`);
    const codecAllowed = inspected.format === "mp4" ? ["avc1", "hvc1", "hev1"] : ["H264", "XVID", "MJPG"];
    if (!codecAllowed.includes(inspected.codec ?? "")) throw new Error(`MEDIA_VIDEO_CODEC_INVALID:${candidate.field}`);
  }
}

function dpiFromImageBuffer(bytes: Buffer, format: string, exif?: Buffer) {
  if (format === "png") {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      const data = offset + 8;
      if (type === "pHYs" && length >= 9 && bytes[data + 8] === 1) return { dpiX: bytes.readUInt32BE(data) * 0.0254, dpiY: bytes.readUInt32BE(data + 4) * 0.0254 };
      if (length > bytes.length - data - 4) break;
      offset = data + length + 4;
    }
  }
  if (format === "jpeg") {
    let offset = 2;
    while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const length = bytes.readUInt16BE(offset + 2);
      const data = offset + 4;
      if (length < 2 || data + length - 2 > bytes.length) break;
      if (marker === 0xe0 && bytes.toString("ascii", data, data + 5) === "JFIF\0") {
        const units = bytes[data + 7];
        const scale = units === 1 ? 1 : units === 2 ? 2.54 : 0;
        if (scale) return { dpiX: bytes.readUInt16BE(data + 8) * scale, dpiY: bytes.readUInt16BE(data + 10) * scale };
      }
      offset = data + length - 2;
    }
  }
  if (exif?.length) {
    let tiffOffset = 0;
    if (exif.subarray(0, 6).toString("ascii") === "Exif\0\0") tiffOffset = 6;
    if (exif.length >= tiffOffset + 8) {
      const little = exif.toString("ascii", tiffOffset, tiffOffset + 2) === "II";
      const u16 = (position: number) => little ? exif.readUInt16LE(position) : exif.readUInt16BE(position);
      const u32 = (position: number) => little ? exif.readUInt32LE(position) : exif.readUInt32BE(position);
      const firstIfd = tiffOffset + u32(tiffOffset + 4);
      if (firstIfd + 2 <= exif.length) {
        const count = Math.min(u16(firstIfd), 256);
        let x: number | undefined;
        let y: number | undefined;
        let unit = 2;
        for (let index = 0; index < count; index += 1) {
          const entry = firstIfd + 2 + index * 12;
          if (entry + 12 > exif.length) break;
          const tag = u16(entry);
          const type = u16(entry + 2);
          const dataOffset = tiffOffset + u32(entry + 8);
          if ((tag === 0x011a || tag === 0x011b) && type === 5 && dataOffset + 8 <= exif.length) {
            const numerator = u32(dataOffset);
            const denominator = u32(dataOffset + 4);
            const value = denominator ? numerator / denominator : 0;
            if (tag === 0x011a) x = value;
            if (tag === 0x011b) y = value;
          } else if (tag === 0x0128 && type === 3) unit = u16(entry + 8);
        }
        if (x && y && (unit === 2 || unit === 3)) {
          const scale = unit === 3 ? 2.54 : 1;
          return { dpiX: x * scale, dpiY: y * scale };
        }
      }
    }
  }
  return null;
}

export async function inspectImageBytes(bytes: Buffer): Promise<InspectedMedia> {
  const metadata = await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 }).metadata();
  const format = metadata.format;
  if (!format || !["jpeg", "png", "webp"].includes(format) || !metadata.width || !metadata.height) throw new Error("MEDIA_IMAGE_FORMAT_INVALID");
  const density = dpiFromImageBuffer(bytes, format, metadata.exif);
  const fallbackDpi = Number.isFinite(metadata.density) && Number(metadata.density) > 0 ? Number(metadata.density) : undefined;
  return {
    mediaType: "image",
    format: format as "jpeg" | "png" | "webp",
    width: metadata.width,
    height: metadata.height,
    ...(density ? { ...density, dpiStatus: "available" as const } : fallbackDpi ? { dpiX: fallbackDpi, dpiY: fallbackDpi, dpiStatus: "available" as const } : { dpiStatus: "unavailable" as const })
  };
}

export function readImageDpi(bytes: Buffer, format: string, exif?: Buffer) {
  return dpiFromImageBuffer(bytes, format, exif);
}

export async function normalizeImageBytes(bytes: Buffer) {
  const normalized = await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 }).rotate().withMetadata({ density: 72 }).toBuffer();
  const metadata = await sharp(normalized, { failOn: "error", limitInputPixels: 40_000_000 }).metadata();
  if (!metadata.format || !metadata.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format)) throw new Error("MEDIA_IMAGE_FORMAT_INVALID");
  const dpi = readImageDpi(normalized, metadata.format, metadata.exif);
  const density = Number.isFinite(metadata.density) && Number(metadata.density) > 0 ? Number(metadata.density) : undefined;
  const inspected: InspectedMedia = {
    mediaType: "image",
    format: metadata.format as "jpeg" | "png" | "webp",
    width: metadata.width,
    height: metadata.height,
    ...(dpi ? { ...dpi, dpiStatus: "available" } : density ? { dpiX: density, dpiY: density, dpiStatus: "available" } : { dpiStatus: "unavailable" })
  };
  return { bytes: normalized, inspected };
}

type Box = { type: string; start: number; dataStart: number; end: number };
function boxes(bytes: Buffer, start: number, end: number): Box[] {
  const found: Box[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      const extended = bytes.readBigUInt64BE(offset + 8);
      if (extended > BigInt(Number.MAX_SAFE_INTEGER)) break;
      size = Number(extended);
      header = 16;
    } else if (size === 0) size = end - offset;
    if (size < header || size > end - offset) break;
    found.push({ type, start: offset, dataStart: offset + header, end: offset + size });
    offset += size;
  }
  return found;
}

function child(parent: Box | undefined, type: string, bytes: Buffer) {
  return parent ? boxes(bytes, parent.dataStart, parent.end).find((item) => item.type === type) : undefined;
}

function parseMp4(bytes: Buffer): InspectedMedia {
  const root = boxes(bytes, 0, bytes.length);
  if (!root.some((item) => item.type === "ftyp")) throw new Error("MEDIA_VIDEO_FORMAT_INVALID");
  const moov = root.find((item) => item.type === "moov");
  if (!moov) throw new Error("MEDIA_VIDEO_METADATA_INVALID");
  const mvhd = child(moov, "mvhd", bytes);
  if (!mvhd) throw new Error("MEDIA_VIDEO_METADATA_INVALID");
  const version = bytes[mvhd.dataStart];
  const timeOffset = mvhd.dataStart + (version === 1 ? 20 : 12);
  const durationOffset = timeOffset + 4;
  if (durationOffset + (version === 1 ? 8 : 4) > mvhd.end) throw new Error("MEDIA_VIDEO_METADATA_INVALID");
  const timeScale = bytes.readUInt32BE(timeOffset);
  const duration = version === 1 ? Number(bytes.readBigUInt64BE(durationOffset)) : bytes.readUInt32BE(durationOffset);
  const durationSeconds = timeScale > 0 ? duration / timeScale : NaN;
  let video: { width: number; height: number; codec: string } | null = null;
  for (const track of boxes(bytes, moov.dataStart, moov.end).filter((item) => item.type === "trak")) {
    const mdia = child(track, "mdia", bytes);
    const hdlr = child(mdia, "hdlr", bytes);
    if (!hdlr || bytes.toString("ascii", hdlr.dataStart + 8, hdlr.dataStart + 12) !== "vide") continue;
    const tkhd = child(track, "tkhd", bytes);
    const minf = child(mdia, "minf", bytes);
    const stbl = child(minf, "stbl", bytes);
    const stsd = child(stbl, "stsd", bytes);
    if (!tkhd || !stsd || stsd.dataStart + 16 > stsd.end) continue;
    const tkVersion = bytes[tkhd.dataStart];
    const dimensionsOffset = tkhd.dataStart + (tkVersion === 1 ? 80 : 76);
    if (dimensionsOffset + 8 > tkhd.end) continue;
    const width = bytes.readUInt32BE(dimensionsOffset) / 65536;
    const height = bytes.readUInt32BE(dimensionsOffset + 4) / 65536;
    const codec = bytes.toString("ascii", stsd.dataStart + 12, stsd.dataStart + 16);
    video = { width, height, codec };
    break;
  }
  if (!video || !Number.isFinite(durationSeconds)) throw new Error("MEDIA_VIDEO_METADATA_INVALID");
  return { mediaType: "video", format: "mp4", ...video, durationSeconds };
}

function parseAvi(bytes: Buffer): InspectedMedia {
  if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "AVI ") throw new Error("MEDIA_VIDEO_FORMAT_INVALID");
  const chunks: Array<{ id: string; data: number; size: number }> = [];
  const walk = (start: number, end: number) => {
    let offset = start;
    while (offset + 8 <= end) {
      const id = bytes.toString("ascii", offset, offset + 4);
      const size = bytes.readUInt32LE(offset + 4);
      const data = offset + 8;
      if (size > end - data) break;
      if (id === "LIST" && size >= 4) walk(data + 4, data + size);
      else chunks.push({ id, data, size });
      offset = data + size + (size & 1);
    }
  };
  walk(12, Math.min(bytes.length, 8 + bytes.readUInt32LE(4)));
  const main = chunks.find((chunk) => chunk.id === "avih");
  if (!main || main.size < 40) throw new Error("MEDIA_VIDEO_METADATA_INVALID");
  const microsecondsPerFrame = bytes.readUInt32LE(main.data);
  const totalFrames = bytes.readUInt32LE(main.data + 16);
  const width = bytes.readUInt32LE(main.data + 32);
  const height = bytes.readUInt32LE(main.data + 36);
  const durationSeconds = microsecondsPerFrame > 0 ? totalFrames * microsecondsPerFrame / 1_000_000 : NaN;
  const stream = chunks.find((chunk) => chunk.id === "strh" && chunk.size >= 8 && bytes.toString("ascii", chunk.data, chunk.data + 4) === "vids");
  const codec = stream ? bytes.toString("ascii", stream.data + 4, stream.data + 8) : "";
  if (!width || !height || !Number.isFinite(durationSeconds) || !codec) throw new Error("MEDIA_VIDEO_METADATA_INVALID");
  return { mediaType: "video", format: "avi", width, height, durationSeconds, codec };
}

export function inspectVideoBytes(bytes: Buffer): InspectedMedia {
  if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") return parseMp4(bytes);
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF") return parseAvi(bytes);
  throw new Error("MEDIA_VIDEO_FORMAT_INVALID");
}
