import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { getUserPlanAccess } from "@/lib/plan-access";
import { canAccessChallenge } from "@/lib/plan-access";
import { challengeForPlanAccess } from "@/lib/server/challenge-access";
import { canCreateChallengeComment, isVisibleChallengeCommentStatus } from "@/lib/server/challenge-comments";
import { isPublicChallenge } from "@/lib/server/public-challenge";
import { awardDoroCoinEngagementSafely, reverseDoroCoinRewardForAction } from "@/lib/server/economy-dorocoin";
import { FieldPath, type DocumentSnapshot, type QueryDocumentSnapshot } from "firebase-admin/firestore";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 40;

async function authorizeChallengeComments(request: Request, challengeId: string) {
  const db = getAdminDb();
  if (!db) return { db: null, challenge: null, user: null, profile: {}, allowed: false };
  const challengeSnap = await db.collection("challenges").doc(challengeId).get();
  if (!challengeSnap.exists) return { db, challenge: null, user: null, profile: {}, allowed: false };
  const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
  const user = await getOptionalRequestUser(request);
  if (isPublicChallenge(challengeId, challenge)) return { db, challenge, user, profile: {}, allowed: true };
  if (!user) return { db, challenge, user, profile: {}, allowed: false };
  const [accountSnap, profileSnap, accessContext] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get(),
    challengeForPlanAccess(db, challenge, user.uid)
  ]);
  const profile = { ...(profileSnap.data() ?? {}), ...(accountSnap.data() ?? {}) };
  const access = canAccessChallenge(profile, accessContext.challenge);
  return { db, challenge, user, profile, allowed: accessContext.hasAccessGrant && access.allowed };
}

function visibleCommentFields(doc: DocumentSnapshot, profile?: Record<string, unknown>) {
  const data = doc.data() ?? {};
  const publicIdentity = profile?.publicProfile !== false && profile?.profileVisibility !== "private";
  return {
    id: doc.id,
    username: publicIdentity && typeof (profile?.username ?? data.username) === "string" ? String(profile?.username ?? data.username) : null,
    avatarUrl: publicIdentity && typeof (profile?.avatarUrl ?? data.avatarUrl) === "string" ? String(profile?.avatarUrl ?? data.avatarUrl) : null,
    body: typeof data.body === "string" ? data.body : "",
    createdAt: data.createdAt ?? null
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorizeChallengeComments(request, id);
  if (!access.db) return serverUnavailable("Challenge comments");
  if (!access.allowed || !access.challenge) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
  const url = new URL(request.url);
  const requestedSize = Number(url.searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE);
  if (!Number.isInteger(requestedSize) || requestedSize < 1) return validationError({ pageSize: "Page size must be a positive integer." });
  const pageSize = Math.min(requestedSize, MAX_PAGE_SIZE);
  const cursorId = url.searchParams.get("cursor");
  let cursor: QueryDocumentSnapshot | null = null;
  if (cursorId) {
    const cursorSnap = await access.db.collection("challengeComments").doc(cursorId).get();
    if (!cursorSnap.exists || cursorSnap.data()?.challengeId !== id || !isVisibleChallengeCommentStatus(cursorSnap.data()?.status)) {
      return validationError({ cursor: "Comment cursor is invalid." });
    }
    cursor = cursorSnap as QueryDocumentSnapshot;
  }
  const baseQuery = access.db.collection("challengeComments")
    .where("challengeId", "==", id)
    .where("status", "in", ["active", "approved"]);
  const [pageSnap, countSnap] = await Promise.all([
    (cursor ? baseQuery.orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc").startAfter(cursor) : baseQuery.orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc"))
      .limit(pageSize + 1).get(),
    baseQuery.count().get()
  ]);
  const hasMore = pageSnap.docs.length > pageSize;
  const pageDocs = hasMore ? pageSnap.docs.slice(0, pageSize) : pageSnap.docs;
  const authorIds = [...new Set(pageDocs.map((doc) => String(doc.data().userId ?? "")).filter(Boolean))];
  const authorSnaps = authorIds.length ? await access.db.getAll(...authorIds.map((authorId) => access.db!.collection("profiles").doc(authorId))) : [];
  const authorProfiles = new Map(authorSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, snap.data() ?? {}]));
  return ok({
    comments: pageDocs.map((doc) => visibleCommentFields(doc, authorProfiles.get(String(doc.data().userId ?? "")))),
    pagination: { pageSize, total: countSnap.data().count, hasMore, nextCursor: hasMore ? pageDocs.at(-1)?.id ?? null : null }
  }, "Comments loaded.");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge comments");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = typeof parsed.body?.body === "string" ? parsed.body.body.trim() : "";
  if (body.length < 2 || body.length > 1000) return validationError({ body: "Comment must be between 2 and 1,000 characters." });
  const access = await authorizeChallengeComments(request, id);
  if (!access.allowed || !access.challenge) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
  if (!canCreateChallengeComment(access.challenge)) return fail("Comments are not available in this challenge state.", 409, undefined, "CHALLENGE_INTERACTIONS_CLOSED");
  const recent = await db.collection("challengeComments").where("userId", "==", user.uid).limit(50).get();
  if (recent.docs.some((doc) => doc.data().challengeId === id && doc.data().status === "active" && String(doc.data().body ?? "").trim().toLowerCase() === body.toLowerCase())) return fail("Duplicate comments are not eligible and were not posted.", 409, undefined, "DUPLICATE_COMMENT");
  const [userSnap, profileSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get()
  ]);
  const profile = { ...(userSnap.data() ?? {}), ...(profileSnap.data() ?? {}) };
  const plan = getUserPlanAccess(profile);
  const now = new Date().toISOString();
  const ref = db.collection("challengeComments").doc();
  const comment = {
    id: ref.id,
    challengeId: id,
    userId: user.uid,
    username: profile.publicProfile === false || profile.profileVisibility === "private" ? null : profile.username ?? null,
    avatarUrl: profile.publicProfile === false || profile.profileVisibility === "private" ? null : profile.avatarUrl ?? null,
    planId: plan.normalizedPlanId,
    body,
    status: "active",
    moderationStatus: "unreviewed",
    createdAt: now,
    updatedAt: now
  };
  await ref.set(comment);
  const challengeOwnerId = String(access.challenge.creatorId ?? access.challenge.ownerId ?? access.challenge.hostId ?? "");
  const reward = await awardDoroCoinEngagementSafely(db, { userId: user.uid, sourceType: "comment_challenge", actionId: ref.id, challengeId: id, challengeOwnerId, suspiciousSignals: body.length < 8 ? ["very_short_comment"] : [] });
  const created = await ref.get();
  return ok({ comment: visibleCommentFields(created, profile), reward }, "Comment added.");
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const commentId = String(parsed.body?.commentId ?? "");
  if (!commentId) return validationError({ commentId: "Comment is required." });
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge comments");
  const access = await authorizeChallengeComments(request, id);
  if (!access.allowed || !access.challenge) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
  const ref = db.collection("challengeComments").doc(commentId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.challengeId !== id) return fail("Comment not found.", 404, undefined, "NOT_FOUND");
  if (snap.data()?.userId !== user.uid && !user.isAdmin) return fail("You cannot remove this comment.", 403, undefined, "PERMISSION_DENIED");
  await ref.set({ status: "removed", removedAt: new Date().toISOString(), removedBy: user.uid, updatedAt: new Date().toISOString() }, { merge: true });
  const reversal = await reverseDoroCoinRewardForAction(db, { userId: String(snap.data()?.userId), sourceType: "comment_challenge", actionId: commentId, reversedBy: user.uid, reason: user.isAdmin ? "Comment was removed during moderation review." : "Comment was deleted by its author." });
  return ok({ commentId, reversal }, "Comment removed.");
}
