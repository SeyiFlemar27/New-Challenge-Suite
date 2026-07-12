import { requireSponsorContext } from "@/lib/server/sponsor";
import { ok, readJson, serverError, validationError } from "@/lib/server/responses";

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const challengeId = String(parsed.body?.challengeId ?? "").trim();
  if (!challengeId) return validationError({ challengeId: "Challenge ID is required." });
  try {
    const challengeSnap = await context.db.collection("challenges").doc(challengeId).get();
    const challenge = challengeSnap.exists ? challengeSnap.data() ?? {} : {};
    const now = new Date().toISOString();
    const id = `${context.user.uid}_${challengeId}`;
    const payload = { id, sponsorId: context.user.uid, ownerUid: context.user.uid, challengeId, challengeTitle: challenge.title ?? "Challenge", creatorId: challenge.creatorId ?? null, creatorName: challenge.creatorName ?? "Creator pending", category: challenge.category ?? "Not available yet", status: challenge.status ?? "not_available", savedAt: now, updatedAt: now };
    await context.db.collection("sponsorSavedChallenges").doc(id).set(payload, { merge: true });
    return ok({ savedChallenge: payload }, "Challenge saved.");
  } catch (error) {
    console.error("[sponsor-save-challenge:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Challenge could not be saved.");
  }
}

