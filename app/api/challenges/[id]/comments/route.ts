import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { getUserPlanAccess } from "@/lib/plan-access";
import { getChallengePhaseSummary } from "@/lib/challenge-status";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge comments");
  const snap = await db.collection("challengeComments").where("challengeId", "==", id).limit(100).get();
  const comments = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>))
    .filter((comment) => ["active", "approved"].includes(String(comment.status ?? "")))
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
  return ok({ comments }, "Comments loaded.");
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
  const challengeSnap = await db.collection("challenges").doc(id).get();
  if (!challengeSnap.exists) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
  const phase = getChallengePhaseSummary(challengeSnap.data() ?? {});
  if (["completed", "winners_announced", "voting_closed"].includes(phase.phase)) {
    return fail("Comments are closed for completed challenges.", 409, undefined, "CHALLENGE_INTERACTIONS_CLOSED");
  }
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
    displayName: profile.displayName ?? profile.name ?? "Challenge Suite member",
    username: profile.username ?? null,
    avatarUrl: profile.avatarUrl ?? null,
    planId: plan.normalizedPlanId,
    verified: Boolean(profile.verified || profile.verificationStatus === "verified"),
    body,
    status: "active",
    moderationStatus: "unreviewed",
    createdAt: now,
    updatedAt: now
  };
  await ref.set(comment);
  return ok({ comment }, "Comment added.");
}
