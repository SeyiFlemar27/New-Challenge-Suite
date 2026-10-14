import { z } from "zod";
import { requireChallengeManagementAccess } from "@/lib/server/challenge-management-access";
import { fail, ok, readJson, validationError } from "@/lib/server/responses";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
const schema = z.object({ title: z.string().trim().min(3).max(120), description: z.string().trim().min(20).max(1200), reason: z.string().trim().min(8).max(1000), expectedUpdatedAt: z.string() }).strict();
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireChallengeManagementAccess(request, id, "challenge.edit");
  if (access.response || !access.user || !access.db || !access.challenge) return access.response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = schema.safeParse(parsed.body);
  if (!body.success) return validationError({ request: "Only the title and full description can be edited here. Provide a reason and refresh stale records." });
  try {
    const update = await access.db.runTransaction(async transaction => {
      const ref = access.db!.collection("challenges").doc(id);
      const snap = await transaction.get(ref);
      const challenge = snap.data() ?? {};
      if (!snap.exists || challenge.builderVersion !== "normal_v3" || ["draft", "pending_review", "changes_requested"].includes(String(challenge.status))) throw new Error("PUBLISHED_NORMAL_REQUIRED");
      if (!userOwnsChallenge(challenge, access.user!.uid) && !access.user!.isAdmin && !access.enterpriseAccess) throw new Error("PERMISSION_DENIED");
      if (challenge.updatedAt !== body.data.expectedUpdatedAt) throw new Error("CHALLENGE_STATE_CHANGED");
      const now = new Date().toISOString();
      const next = { title: body.data.title, description: body.data.description, normalContentRevision: Number(challenge.normalContentRevision ?? 0) + 1, updatedAt: now };
      transaction.update(ref, next);
      transaction.create(access.db!.collection("auditLogs").doc(), { actorId: access.user!.uid, action: "normal.published_description_updated", challengeId: id, before: { title: challenge.title, description: challenge.description }, after: next, reason: body.data.reason, createdAt: now });
      return next;
    });
    return ok(update, "Published description updated. Competition and financial terms remain authoritative.");
  } catch { return fail("This challenge changed or is not eligible for this edit. Refresh before retrying.", 409, undefined, "CHALLENGE_STATE_CHANGED"); }
}
