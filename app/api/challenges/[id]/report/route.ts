import { createHash } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { isPublicChallenge } from "@/lib/server/public-challenge";
import { isPublicPrivatePreviewRecord } from "@/lib/server/challenge-media-delivery";
import { isPublishedTournament } from "@/lib/server/tournament-public-policy";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestUser(request); if (auth.response) return auth.response;
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const reason = String(parsed.body?.reason ?? "").trim();
  if (reason.length < 10 || reason.length > 2000) return fail("Explain the safety concern in 10–2,000 characters.", 422);
  const db = getAdminDb(); if (!db) return serverUnavailable("Challenge reporting");
  const { id } = await context.params, source = parsed.body?.source === "tournaments" ? "tournaments" : "challenges";
  const target = await db.collection(source).doc(id).get(), data = target.data();
  if (!data || !(source === "tournaments" ? isPublishedTournament(data) : isPublicChallenge(id, data) || isPublicPrivatePreviewRecord(data))) return fail("Challenge not found.", 404);
  const caseId = createHash("sha256").update(`${source}:${id}:${auth.user.uid}`).digest("hex");
  const now = new Date().toISOString();
  await db.runTransaction(async tx => {
    const ref = db.collection("challengeModerationCases").doc(caseId), previous = await tx.get(ref);
    if (previous.exists) return;
    tx.create(ref, { targetId: id, source, reporterId: auth.user.uid, sourceType: "user_report", status: "open", reason, createdAt: now, updatedAt: now });
    tx.create(db.collection("safetyReports").doc(caseId), { targetId: id, targetType: source === "tournaments" ? "tournament" : "challenge", userId: auth.user.uid, category: "challenge_content", reason, status: "submitted", createdAt: now });
  });
  return ok({ reported: true }, "Report received for investigation. Reporting does not automatically restrict this challenge.");
}
