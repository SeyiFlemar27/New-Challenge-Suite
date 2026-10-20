import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { canEditTournament } from "@/lib/server/tournament-permissions";
import { requireChallengeManagementAccess } from "@/lib/server/challenge-management-access";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestUser(request); if (auth.response) return auth.response;
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const reason = String(parsed.body?.reason ?? "").trim();
  if (reason.length < 10 || reason.length > 2000) return fail("Explain the appeal in 10–2,000 characters.", 422);
  const db = getAdminDb(); if (!db) return serverUnavailable("Moderation appeal");
  const { id } = await context.params, source = parsed.body?.source === "tournaments" ? "tournaments" : "challenges";
  const record = await db.collection(source).doc(id).get();
  if (!record.exists) return fail("Challenge not found.", 404);
  if (source === "challenges") { const access = await requireChallengeManagementAccess(request, id, "challenge.edit"); if (access.response) return access.response; }
  else if (!canEditTournament({ ...auth.user }, record.data()!).allowed) return fail("Permission denied.", 403);
  if (!["held", "removed", "suspended"].includes(String(record.data()?.moderationStatus))) return fail("There is no moderation restriction to appeal.", 409);
  const now = new Date().toISOString(), appealId = `publication_${source}_${id}`;
  await db.runTransaction(async tx => {
    const ref = db.collection("appeals").doc(appealId), previous = await tx.get(ref);
    if (previous.exists && previous.data()?.status === "submitted") return;
    tx.set(ref, { targetId: id, source, userId: auth.user.uid, reason, status: "submitted", createdAt: previous.data()?.createdAt ?? now, updatedAt: now });
    tx.set(db.collection("challengeModerationCases").doc(appealId), { targetId: id, source, sourceType: "creator_appeal", reason, status: "open", updatedAt: now });
  });
  return ok({ appealId }, "Appeal submitted. The restriction remains in place during investigation.");
}
