import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

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
  const challengeSnap = await db.collection("challenges").doc(id).get();
  if (!challengeSnap.exists) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");

  const now = new Date().toISOString();
  const ref = db.collection("challengeEngagements").doc(`${id}_${user.uid}`);
  const field = action === "save_challenge" ? "saved" : action === "watch_later" ? "watchLater" : "interested";
  const update: Record<string, unknown> = { id: ref.id, challengeId: id, userId: user.uid, [field]: enabled, updatedAt: now };
  if (action === "interested") {
    update.reminderOffsetsMinutes = enabled ? [60, 30, 5, 0] : [];
    update.reminderStatus = enabled ? "pending_worker" : "disabled";
    update.notificationDeliveryActive = false;
  }
  await ref.set(update, { merge: true });
  return ok({ action, enabled, reminderStatus: update.reminderStatus ?? null }, action === "interested" && enabled ? "Reminder preference saved. Notification delivery will begin when the reminder worker is connected." : "Challenge preference saved.");
}
