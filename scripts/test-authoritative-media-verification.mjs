import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
let sharp;
try { sharp = (await import("sharp")).default; } catch { console.log("BLOCKED sharp dependency could not load"); process.exit(2); }
import { inspectImageBytes, inspectVideoBytes, validateInspectedMedia } from "../lib/server/media-inspection.ts";
import { NORMAL_MEDIA_LIMITS } from "../lib/normal-challenge-media-policy.js";

const png = await sharp({ create: { width: 800, height: 500, channels: 3, background: "#357" } }).png().withMetadata({ density: 72 }).toBuffer();
const image = await inspectImageBytes(png);
assert.equal(image.mediaType, "image");
assert.equal(image.format, "png");
assert.equal(image.width, 800);
assert.equal(image.height, 500);
validateInspectedMedia({ expectedType: "image", field: "cover" }, image, png.length);

const undersizedPng = await sharp({ create: { width: NORMAL_MEDIA_LIMITS.imageMinWidth - 1, height: NORMAL_MEDIA_LIMITS.imageMinHeight, channels: 3, background: "#357" } }).png().toBuffer();
await assert.rejects(async () => validateInspectedMedia({ expectedType: "image", field: "cover" }, await inspectImageBytes(undersizedPng), undersizedPng.length), /MEDIA_IMAGE_DIMENSIONS_INVALID/);
const oversizedDimensionsPng = await sharp({ create: { width: NORMAL_MEDIA_LIMITS.imageMaxWidth + 1, height: NORMAL_MEDIA_LIMITS.imageMinHeight, channels: 3, background: "#357" } }).png().toBuffer();
await assert.rejects(async () => validateInspectedMedia({ expectedType: "image", field: "cover" }, await inspectImageBytes(oversizedDimensionsPng), oversizedDimensionsPng.length), /MEDIA_IMAGE_DIMENSIONS_INVALID/);
assert.throws(() => validateInspectedMedia({ expectedType: "image", field: "cover" }, image, NORMAL_MEDIA_LIMITS.imageBytes + 1), /MEDIA_IMAGE_TOO_LARGE/);
const nonCanonicalDpiPng = await sharp({ create: { width: 800, height: 500, channels: 3, background: "#357" } }).png().withMetadata({ density: 96 }).toBuffer();
const nonCanonicalDpiImage = await inspectImageBytes(nonCanonicalDpiPng);
assert.equal(nonCanonicalDpiImage.dpiStatus, "available");
assert.throws(() => validateInspectedMedia({ expectedType: "image", field: "cover" }, nonCanonicalDpiImage, nonCanonicalDpiPng.length), /MEDIA_IMAGE_DPI_INVALID/);

function mp4Box(type, payload) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8, 0);
  header.write(type, 4, 4, "ascii");
  return Buffer.concat([header, payload]);
}
function fullBox(type, body) { return mp4Box(type, Buffer.concat([Buffer.alloc(4), body])); }
function makeMp4({ width = 1280, height = 720, duration = 60, codec = "avc1" } = {}) {
  const mvhdBody = Buffer.alloc(16);
  mvhdBody.writeUInt32BE(1000, 8);
  mvhdBody.writeUInt32BE(duration * 1000, 12);
  const hdlrBody = Buffer.alloc(12);
  hdlrBody.write("vide", 4, 4, "ascii");
  const tkhdBody = Buffer.alloc(84);
  tkhdBody.writeUInt32BE(width * 65536, 72);
  tkhdBody.writeUInt32BE(height * 65536, 76);
  const stsdBody = Buffer.alloc(12);
  stsdBody.writeUInt32BE(8, 4);
  stsdBody.write(codec, 8, 4, "ascii");
  const moov = mp4Box("moov", Buffer.concat([
    fullBox("mvhd", mvhdBody),
    mp4Box("trak", Buffer.concat([
      fullBox("tkhd", tkhdBody),
      mp4Box("mdia", Buffer.concat([fullBox("hdlr", hdlrBody), mp4Box("minf", mp4Box("stbl", fullBox("stsd", stsdBody)))]))
    ]))
  ]));
  return Buffer.concat([mp4Box("ftyp", Buffer.from("isom0000", "ascii")), moov]);
}
const mp4 = makeMp4();
const video = inspectVideoBytes(mp4);
assert.equal(video.format, "mp4");
assert.equal(video.width, 1280);
assert.equal(video.height, 720);
assert.equal(video.durationSeconds, 60);
assert.equal(video.codec, "avc1");
validateInspectedMedia({ expectedType: "video", field: "trailer" }, video, mp4.length);
const portraitVideo = inspectVideoBytes(makeMp4({ width: 720, height: 1280 }));
assert.throws(() => validateInspectedMedia({ expectedType: "video", field: "trailer" }, portraitVideo, 100), /MEDIA_VIDEO_DIMENSIONS_INVALID/);
const lowResolutionVideo = inspectVideoBytes(makeMp4({ width: 960, height: 540 }));
assert.throws(() => validateInspectedMedia({ expectedType: "video", field: "trailer" }, lowResolutionVideo, 100), /MEDIA_VIDEO_DIMENSIONS_INVALID/);
const longVideo = inspectVideoBytes(makeMp4({ duration: 76 }));
assert.throws(() => validateInspectedMedia({ expectedType: "video", field: "trailer" }, longVideo, 100), /MEDIA_VIDEO_DURATION_INVALID/);
const maxLengthVideo = inspectVideoBytes(makeMp4({ duration: 75 }));
assert.doesNotThrow(() => validateInspectedMedia({ expectedType: "video", field: "trailer" }, maxLengthVideo, 100));
assert.throws(() => validateInspectedMedia({ expectedType: "video", field: "trailer" }, video, NORMAL_MEDIA_LIMITS.videoBytes), /MEDIA_VIDEO_TOO_LARGE/);
const unsupportedCodec = inspectVideoBytes(makeMp4({ codec: "vp09" }));
assert.throws(() => validateInspectedMedia({ expectedType: "video", field: "trailer" }, unsupportedCodec, 100), /MEDIA_VIDEO_CODEC_INVALID/);

const avi = Buffer.alloc(12 + 8 + 40 + 8 + 56);
avi.write("RIFF", 0, 4, "ascii");
avi.writeUInt32LE(avi.length - 8, 4);
avi.write("AVI ", 8, 4, "ascii");
avi.write("avih", 12, 4, "ascii");
avi.writeUInt32LE(40, 16);
avi.writeUInt32LE(1_000_000, 20);
avi.writeUInt32LE(60, 36);
avi.writeUInt32LE(1280, 52);
avi.writeUInt32LE(720, 56);
avi.write("strh", 60, 4, "ascii");
avi.writeUInt32LE(56, 64);
avi.write("vids", 68, 4, "ascii");
avi.write("H264", 72, 4, "ascii");
const aviVideo = inspectVideoBytes(avi);
assert.equal(aviVideo.format, "avi");
assert.equal(aviVideo.width, 1280);
assert.equal(aviVideo.height, 720);
assert.equal(aviVideo.durationSeconds, 60);
assert.equal(aviVideo.codec, "H264");
validateInspectedMedia({ expectedType: "video", field: "trailer" }, aviVideo, avi.length);

assert.throws(() => inspectVideoBytes(Buffer.from("not a video")), /MEDIA_VIDEO_FORMAT_INVALID/);

const verification = await readFile(new URL("../lib/server/media-verification.ts", import.meta.url), "utf8");
const createRoute = await readFile(new URL("../app/api/challenges/route.ts", import.meta.url), "utf8");
const publishRoute = await readFile(new URL("../app/api/challenges/[id]/publish/route.ts", import.meta.url), "utf8");
assert.match(verification, /getAdminStorage\(\)/);
assert.match(verification, /sha256/);
assert.match(verification, /MEDIA_OBJECT_MISSING/);
assert.match(verification, /verified-challenge-media/);
assert.match(verification, /preconditionOpts: \{ ifGenerationMatch: 0 \}/);
assert.match(verification, /firebaseStorageDownloadTokens/);
assert.match(createRoute, /verifyChallengeMedia\(db, ref\.id/);
assert.match(publishRoute, /verifyChallengeMedia\(db, id/);
console.log("PASS authoritative media byte inspection, parsers, and publish gates");
