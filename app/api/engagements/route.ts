import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { isPublicChallenge, publicChallengeFields } from "@/lib/server/public-challenge";

function toMillis(value: unknown) {
  if (typeof value === "string") return Date.parse(value) || 0;
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  return 0;
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Saved challenges");

  try {
    const engagementSnap = await db.collection("challengeEngagements").where("userId", "==", user.uid).limit(200).get();
    const engagements = engagementSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>))
      .filter((item) => item.saved || item.watchLater || item.interested)
      .sort((left, right) => toMillis(right.updatedAt) - toMillis(left.updatedAt));
    const challengeIds = [...new Set(engagements.map((item) => String(item.challengeId ?? "")).filter(Boolean))];
    const challengeSnaps = challengeIds.length
      ? await db.getAll(...challengeIds.map((id) => db.collection("challenges").doc(id)))
      : [];
    const challenges = new Map(challengeSnaps.flatMap((snap) => {
      if (!snap.exists) return [];
      const data = snap.data() ?? {};
      if (!isPublicChallenge(snap.id, data)) return [];
      return [[snap.id, { id: snap.id, ...publicChallengeFields(data) }]];
    }));
    const items = engagements
      .map((engagement) => {
        const challenge = challenges.get(String(engagement.challengeId ?? ""));
        if (!challenge) return null;
        return {
          engagementId: engagement.id,
          challenge,
          saved: Boolean(engagement.saved),
          watchLater: Boolean(engagement.watchLater),
          interested: Boolean(engagement.interested),
          reminderOffsetsMinutes: Array.isArray(engagement.reminderOffsetsMinutes) ? engagement.reminderOffsetsMinutes : [],
          reminderStatus: engagement.reminderStatus ?? null,
          updatedAt: engagement.updatedAt ?? null
        };
      })
      .filter(Boolean);
    return ok({ items }, "Saved challenge activity loaded.");
  } catch (error) {
    return serverError("Saved challenges could not be loaded.", error instanceof Error ? error.message : error);
  }
}
