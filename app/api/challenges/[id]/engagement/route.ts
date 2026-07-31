import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { getChallengePhaseSummary } from "@/lib/challenge-status";

const actions = new Set(["save_challenge", "watch_later", "interested"]);

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
  const now = new Date().toISOString();
  const ref = db.collection("challengeEngagements").doc(`${id}_${user.uid}`);
  const field = action === "save_challenge" ? "saved" : action === "watch_later" ? "watchLater" : "interested";
  const update: Record<string, unknown> = { id: ref.id, challengeId: id, userId: user.uid, [field]: enabled, updatedAt: now };
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
    const phase = getChallengePhaseSummary(challengeSnap.data() ?? {});
    if (["completed", "winners_announced", "voting_closed"].includes(phase.phase)) return { blocked: true, interestedCount: Number(challengeSnap.data()?.interestedCount ?? 0) };
    const wasEnabled = Boolean(engagementSnap.data()?.[field]);
    transaction.set(ref, update, { merge: true });
    let interestedCount = Number(challengeSnap.data()?.interestedCount ?? 0);
    if (action === "interested" && wasEnabled !== enabled) {
      interestedCount = Math.max(0, interestedCount + (enabled ? 1 : -1));
      transaction.set(challengeRef, { interestedCount, updatedAt: now }, { merge: true });
    }
    return { blocked: false, interestedCount };
  });
  if (!result) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
  if (result.blocked) return fail("Saving and reminder actions are closed for completed challenges.", 409, undefined, "CHALLENGE_INTERACTIONS_CLOSED");
  const message = action === "save_challenge"
    ? enabled ? "Challenge saved to Favorites." : "Challenge removed from Favorites."
    : action === "watch_later"
      ? enabled ? "Added to Watch Later." : "Removed from Watch Later."
      : enabled
        ? "Interest and in-app reminder preferences saved."
        : "Watching interest removed.";
  return ok({ action, enabled, reminderStatus: update.reminderStatus ?? null, interestedCount: result.interestedCount }, message);
}
