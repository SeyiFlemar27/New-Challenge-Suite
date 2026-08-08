import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { getChallengePhaseSummary } from "@/lib/challenge-status";
import { awardDoroCoinEngagementSafely, reverseDoroCoinRewardForAction } from "@/lib/server/economy-dorocoin";

const actions = new Set(["save_challenge", "watch_later", "interested", "like_challenge", "share_challenge", "watch_challenge_video"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge engagement");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const action = String(parsed.body?.action ?? "");
  const enabled = parsed.body?.enabled !== false;
  if (!actions.has(action)) return validationError({ action: "Select a valid challenge action." });
  const sharePlatform = String(parsed.body?.platform ?? "native").toLowerCase();
  const mediaId = String(parsed.body?.mediaId ?? "").trim();
  const watchEventId = String(parsed.body?.watchEventId ?? "").trim();
  let watchedSeconds = Number(parsed.body?.watchedSeconds ?? 0);
  if (action === "share_challenge" && !["native", "facebook", "x", "linkedin", "whatsapp", "copy_link"].includes(sharePlatform)) return validationError({ platform: "Select a supported share destination." });
  if (action === "watch_challenge_video" && (!mediaId || !watchEventId)) return validationError({ watch: "A server-verified challenge video watch event is required." });
  if (action === "watch_challenge_video") {
    const verifiedWatch = await db.collection("challengeVideoWatchVerifications").doc(watchEventId).get();
    const verification = verifiedWatch.data() ?? {};
    if (!verifiedWatch.exists || verification.status !== "verified" || verification.userId !== user.uid || verification.challengeId !== id || verification.mediaId !== mediaId) return fail("Video reward is awaiting server verification.", 409, undefined, "WATCH_VERIFICATION_REQUIRED");
    if (verification.rewardClaimedAt) return fail("This verified video watch has already been processed.", 409, undefined, "WATCH_REWARD_ALREADY_PROCESSED");
    watchedSeconds = Number(verification.watchedSeconds ?? 0);
  }
  const now = new Date().toISOString();
  const ref = db.collection("challengeEngagements").doc(`${id}_${user.uid}`);
  const field = action === "save_challenge" ? "saved" : action === "watch_later" ? "watchLater" : action === "interested" ? "interested" : action === "like_challenge" ? "liked" : action === "share_challenge" ? "lastSharedAt" : "lastVideoWatchAt";
  const update: Record<string, unknown> = { id: ref.id, challengeId: id, userId: user.uid, [field]: ["share_challenge", "watch_challenge_video"].includes(action) ? now : enabled, updatedAt: now };
  if (action === "interested") {
    const requestedOffsets: number[] = Array.isArray(parsed.body?.reminderOffsetsMinutes) ? parsed.body.reminderOffsetsMinutes.map(Number) : [60, 30, 5, 0];
    const allowedOffsets = requestedOffsets.filter((value: number) => [60, 30, 5, 0].includes(value));
    update.reminderOffsetsMinutes = enabled ? [...new Set(allowedOffsets)] : [];
    update.reminderStatus = enabled ? "pending_worker" : "disabled";
    update.notificationDeliveryActive = false;
  }
  const result = await db.runTransaction(async (transaction) => {
    const challengeRef = db.collection("challenges").doc(id);
    const [challengeSnap, engagementSnap] = await Promise.all([transaction.get(challengeRef), transaction.get(ref)]);
    if (!challengeSnap.exists) return null;
    const challenge = challengeSnap.data() ?? {};
    const phase = getChallengePhaseSummary(challenge);
    if (["completed", "winners_announced", "voting_closed"].includes(phase.phase)) return { blocked: true, interestedCount: Number(challengeSnap.data()?.interestedCount ?? 0) };
    const challengeOwnerId = String(challenge.creatorId ?? challenge.ownerId ?? challenge.hostId ?? "");
    if (action === "watch_challenge_video" && !JSON.stringify(challenge).includes(mediaId)) return { blocked: true, interestedCount: Number(challenge.interestedCount ?? 0), invalidMedia: true, challengeOwnerId };
    const wasEnabled = Boolean(engagementSnap.data()?.[field]);
    transaction.set(ref, update, { merge: true });
    let interestedCount = Number(challengeSnap.data()?.interestedCount ?? 0);
    if (action === "interested" && wasEnabled !== enabled) {
      interestedCount = Math.max(0, interestedCount + (enabled ? 1 : -1));
      transaction.set(challengeRef, { interestedCount, updatedAt: now }, { merge: true });
    }
    return { blocked: false, interestedCount, challengeOwnerId };
  });
  if (!result) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
  if (result.blocked) return fail(result.invalidMedia ? "The watched video is not attached to this challenge." : "Saving and reminder actions are closed for completed challenges.", 409, undefined, result.invalidMedia ? "CHALLENGE_VIDEO_NOT_FOUND" : "CHALLENGE_INTERACTIONS_CLOSED");
  let reward = null;
  if (action === "like_challenge") {
    reward = enabled
      ? await awardDoroCoinEngagementSafely(db, { userId: user.uid, sourceType: "like_challenge", actionId: id, challengeId: id, challengeOwnerId: result.challengeOwnerId })
      : await reverseDoroCoinRewardForAction(db, { userId: user.uid, sourceType: "like_challenge", actionId: id, reversedBy: user.uid, reason: "Challenge like was removed by the user." });
  }
  if (action === "share_challenge" && enabled) reward = await awardDoroCoinEngagementSafely(db, { userId: user.uid, sourceType: "share_challenge", actionId: `${id}:${sharePlatform}`, challengeId: id, challengeOwnerId: result.challengeOwnerId });
  if (action === "watch_challenge_video" && enabled) {
    reward = await awardDoroCoinEngagementSafely(db, { userId: user.uid, sourceType: "watch_challenge_video", actionId: `${id}:${mediaId}`, challengeId: id, challengeOwnerId: result.challengeOwnerId, watchedSeconds, requiredWatchSeconds: 30, providerVerified: true });
    await db.collection("challengeVideoWatchVerifications").doc(watchEventId).set({ rewardClaimedAt: now, rewardStatus: reward.status, updatedAt: now }, { merge: true });
  }
  const message = action === "save_challenge"
    ? enabled ? "Challenge saved to Favorites." : "Challenge removed from Favorites."
    : action === "watch_later"
      ? enabled ? "Added to Watch Later." : "Removed from Watch Later."
      : enabled
        ? "Interest and in-app reminder preferences saved."
        : "Watching interest removed.";
  return ok({ action, enabled, reminderStatus: update.reminderStatus ?? null, interestedCount: result.interestedCount, reward }, message);
}
