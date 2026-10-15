import { Readable } from "node:stream";
import { getAdminDb, getAdminStorage } from "@/lib/firebase/admin";
import { isPublicChallenge, isPublicSubmission } from "@/lib/server/public-challenge";
import { hasPublicVotingAccess, isPrivateChallengeRecord, userOwnsChallenge } from "@/lib/server/challenge-access";
import { getRequestUser } from "@/lib/server/auth";
import { requireEnterpriseChallengeAccess } from "@/lib/server/enterprise-access";
import { challengeMediaPaths, isPublicPrivatePreviewRecord, publicChallengeImagePaths } from "@/lib/server/challenge-media-delivery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const privateParticipantStatuses = new Set(["registered", "approved", "active", "entered", "enrolled", "winner"]);
const publicMediaTypes = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/avi", "video/x-msvideo"]);

function safePath(value: string) {
  return value.length > 700 || !value || value.startsWith("/") || value.includes("\\") || value.split("/").some((part) => !part || part === "." || part === "..")
    ? null : value;
}

function isPrivatePreviewCover(challenge: Record<string, unknown>, path: string) {
  return isPublicPrivatePreviewRecord(challenge) && challenge.coverImagePath === path;
}

function isPublicCoverOrGallery(challenge: Record<string, unknown>, path: string) {
  return isImageAssetPath(path) && publicChallengeImagePaths(challenge).has(path);
}

function isImageAssetPath(path: string) {
  return /^verified-challenge-media\/[^/]+\/images\/[^/]+$/.test(path)
    || /^challenges\/(drafts|host-drafts|hybrid-drafts)\/[^/]+\/(banner|gallery)\/[^/]+$/.test(path)
    || /^challenges\/[^/]+\/banner\/[^/]+$/.test(path);
}

async function hasPrivateViewerAccess(db: FirebaseFirestore.Firestore, challengeId: string, uid: string) {
  const [grantSnap, participantSnap] = await Promise.all([
    db.collection("privateChallengeAccess").doc(`${challengeId}_${uid}`).get(),
    db.collection("challengeParticipants").doc(`${challengeId}_${uid}`).get()
  ]);
  return grantSnap.data()?.status === "approved"
    || privateParticipantStatuses.has(String(participantSnap.data()?.status ?? "").toLowerCase());
}

async function authorizedEnterpriseManager(request: Request, challengeId: string) {
  const access = await requireEnterpriseChallengeAccess(request, challengeId, "challenge.view", false);
  if (access.response || !access.access?.organizationId) return false;
  const organization = await access.db!.collection("enterpriseOrganizations").doc(access.access.organizationId).get();
  return organization.exists && String(organization.data()?.status ?? "").toLowerCase() === "active";
}

async function canReadChallengeAsset(request: Request, db: FirebaseFirestore.Firestore, uid: string | null, challengeId: string, path: string) {
  const challengeSnap = await db.collection("challenges").doc(challengeId).get();
  if (!challengeSnap.exists) return { allowed: false, isPublic: false };
  const challenge = { id: challengeId, ...challengeSnap.data() } as Record<string, unknown>;
  const draftOwner = /^challenges\/(?:drafts|host-drafts|hybrid-drafts)\/([^/]+)\/(?:banner|gallery)\/[^/]+$/.exec(path)?.[1];
  if (draftOwner && !userOwnsChallenge(challenge, draftOwner)) return { allowed: false, isPublic: false };
  const referenced = challengeMediaPaths(challenge).has(path);
  if (!referenced) return { allowed: false, isPublic: false };

  const privateChallenge = isPrivateChallengeRecord(challenge);
  const publicPreview = isImageAssetPath(path) && isPrivatePreviewCover(challenge, path);
  const publicImage = !privateChallenge && isPublicChallenge(challengeId, challenge) && isPublicCoverOrGallery(challenge, path);
  const publiclyReadable = publicPreview || publicImage;
  if (publiclyReadable) return { allowed: true, isPublic: true };
  if (!uid) return { allowed: false, isPublic: false };

  const user = await getRequestUser(request);
  if (!user || user.uid !== uid) return { allowed: false, isPublic: false };
  if (user.isAdmin || userOwnsChallenge(challenge, uid)) return { allowed: true, isPublic: publiclyReadable };
  if (privateChallenge && await hasPrivateViewerAccess(db, challengeId, uid)) return { allowed: true, isPublic: false };
  const participant = !privateChallenge ? await db.collection("challengeParticipants").doc(`${challengeId}_${uid}`).get() : null;
  if (!privateChallenge && privateParticipantStatuses.has(String(participant?.data()?.status ?? "").toLowerCase())) {
    return { allowed: true, isPublic: publiclyReadable };
  }
  if (challenge.officialChallenge === true && await authorizedEnterpriseManager(request, challengeId)) {
    return { allowed: true, isPublic: publiclyReadable };
  }
  return { allowed: false, isPublic: false };
}

async function canReadSubmissionAsset(request: Request, db: FirebaseFirestore.Firestore, uid: string | null, path: string) {
  const segments = path.split("/");
  if (segments.length !== 6 || segments[0] !== "challenges" || segments[2] !== "submissions") return { allowed: false, isPublic: false };
  const [, challengeId, , ownerId] = segments;
  const matches = await db.collection("submissions").where("mediaStoragePath", "==", path).limit(2).get();
  const submissionSnap = matches.docs.find((doc) => String(doc.data().challengeId ?? "") === challengeId && String(doc.data().userId ?? "") === ownerId);
  if (!submissionSnap) return { allowed: false, isPublic: false };
  const submission = { id: submissionSnap.id, ...submissionSnap.data() } as Record<string, unknown>;
  const challengeSnap = await db.collection("challenges").doc(challengeId).get();
  if (!challengeSnap.exists) return { allowed: false, isPublic: false };
  const challenge = { id: challengeId, ...challengeSnap.data() } as Record<string, unknown>;
  const publicSubmission = isPublicSubmission(submissionSnap.id, submission);
  if (publicSubmission && !isPrivateChallengeRecord(challenge) && !isQaChallenge(challengeId, challenge) && !uid) return { allowed: true, isPublic: true };
  if (!uid) return { allowed: false, isPublic: false };
  const user = await getRequestUser(request);
  if (!user || user.uid !== uid) return { allowed: false, isPublic: false };
  if (publicSubmission && hasPublicVotingAccess(challenge) && !isQaChallenge(challengeId, challenge)) return { allowed: true, isPublic: false };
  if (user.isAdmin || uid === ownerId || userOwnsChallenge(challenge, uid)) return { allowed: true, isPublic: publicSubmission };
  if (isPrivateChallengeRecord(challenge) && await hasPrivateViewerAccess(db, challengeId, uid)) return { allowed: true, isPublic: false };
  if (challenge.officialChallenge === true && await authorizedEnterpriseManager(request, challengeId)) return { allowed: true, isPublic: publicSubmission };
  return { allowed: false, isPublic: false };
}

function isQaChallenge(id: string, challenge: Record<string, unknown>) {
  return id.toLowerCase().startsWith("demo-") || id.toLowerCase().startsWith("qa-") || id.toLowerCase().startsWith("qa_")
    || challenge.isQaSeed === true || challenge.isDemo === true || challenge.isTest === true || challenge.isPlaceholder === true;
}

async function authorizeMediaRequest(request: Request, db: FirebaseFirestore.Firestore, path: string) {
  const requestUser = await getRequestUser(request);
  const uid = requestUser?.uid ?? null;
  const draftMatch = /^challenges\/(?:drafts|host-drafts|hybrid-drafts)\/([^/]+)\/(banner|gallery|video|documents)\/[^/]+$/.exec(path);
  if (draftMatch) {
    if (uid && (uid === draftMatch[1] || requestUser?.isAdmin)) return { allowed: true, isPublic: false };
    if (!["banner", "gallery"].includes(draftMatch[2])) return { allowed: false, isPublic: false };
    // Historical published challenges can still reference owned draft objects.
    // Resolve exact persisted references, never publish an entire draft prefix.
    const matches = await Promise.all([
      db.collection("challenges").where("coverImagePath", "==", path).limit(5).get(),
      db.collection("challenges").where("publicMediaPaths", "array-contains", path).limit(5).get()
    ]);
    for (const challengeId of new Set(matches.flatMap((snapshot) => snapshot.docs.map((doc) => doc.id)))) {
      const access = await canReadChallengeAsset(request, db, uid, challengeId, path);
      if (access.allowed) return access;
    }
    return { allowed: false, isPublic: false };
  }
  const challengeMatch = /^verified-challenge-media\/([^/]+)\/(images|videos)\/[^/]+$/.exec(path);
  if (challengeMatch) return canReadChallengeAsset(request, db, uid, challengeMatch[1], path);
  const legacyChallengeMatch = /^challenges\/([^/]+)\/(banner|trailers|promo-flyer|promo-video)\/[^/]+$/.exec(path);
  if (legacyChallengeMatch) return canReadChallengeAsset(request, db, uid, legacyChallengeMatch[1], path);
  if (/^challenges\/[^/]+\/submissions\/[^/]+\/(images|videos|documents)\/[^/]+$/.test(path)) {
    return canReadSubmissionAsset(request, db, uid, path);
  }
  return { allowed: false, isPublic: false };
}

export async function GET(request: Request) {
  const path = safePath(new URL(request.url).searchParams.get("path") ?? "");
  if (!path) return new Response("Not found", { status: 404 });
  const db = getAdminDb();
  const storage = getAdminStorage();
  if (!db || !storage) return new Response("Media service unavailable", { status: 503 });
  try {
    const authorization = await authorizeMediaRequest(request, db, path);
    if (!authorization.allowed) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

    const file = storage.bucket().file(path);
    const [exists] = await file.exists();
    if (!exists) return new Response("Not found", { status: 404 });
    const [metadata] = await file.getMetadata();
    const contentType = String(metadata.contentType ?? "application/octet-stream").toLowerCase();
    if (!publicMediaTypes.has(contentType)) return new Response("Unsupported media type", { status: 415 });
    const size = Number(metadata.size ?? 0);
    if (!Number.isSafeInteger(size) || size < 0) return new Response("Media unavailable", { status: 404 });

    const rangeHeader = request.headers.get("range");
    let status = 200;
    let start = 0;
    let end = Math.max(0, size - 1);
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (!match || (!match[1] && !match[2]) || size === 0) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      if (match[1]) {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : end;
      } else {
        const suffix = Number(match[2]);
        start = Math.max(0, size - suffix);
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      }
      end = Math.min(end, size - 1);
      status = 206;
    }
    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Length": String(status === 206 ? end - start + 1 : size),
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      // Visibility can change from public to restricted. Avoid shared/browser
      // caches retaining bytes after the authorization decision changes.
      "Cache-Control": "no-store"
    });
    if (status === 206) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    const stream = file.createReadStream(status === 206 ? { start, end } : {});
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status, headers });
  } catch {
    return new Response("Media unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
