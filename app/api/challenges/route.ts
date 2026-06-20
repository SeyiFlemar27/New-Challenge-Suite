import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser, requireRole } from "@/lib/server/auth";
import { createNotification } from "@/lib/server/notifications";
import { ok, serverUnavailable, readJson, validationError } from "@/lib/server/responses";
import { getChallengeDisplayStatus } from "@/lib/challenge-status";
import { canCreateChallenge, getUserPlanAccess } from "@/lib/plan-access";
import { fail } from "@/lib/server/responses";

export async function GET() {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge listing");
  const snap = await db.collection("challenges").orderBy("createdAt", "desc").limit(100).get();
  const challenges = snap.docs.map((doc) => {
    const data = doc.data();
    return { ...data, id: doc.id, computedStatus: getChallengeDisplayStatus(data as any) };
  });
  return ok({ challenges }, "Challenges loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge creation");
  const permission = requireRole(user, ["user", "creator", "sponsor"]);
  if (permission) return permission;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const fieldErrors: Record<string, string> = {};
  if (!body?.title) fieldErrors.title = "Title is required.";
  if (!body?.description) fieldErrors.description = "Description is required.";
  if (!body?.category) fieldErrors.category = "Category is required.";
  if (body?.acceptedSubmissionTypes && !Array.isArray(body.acceptedSubmissionTypes)) fieldErrors.acceptedSubmissionTypes = "Accepted submission types must be an array.";
  if (Object.keys(fieldErrors).length) return validationError(fieldErrors);

  const now = new Date().toISOString();
  const [accountSnap, profileSnap, ownedChallengesSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get(),
    db.collection("challenges").where("creatorId", "==", user.uid).limit(100).get()
  ]);
  const planProfile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) };
  const planAccess = getUserPlanAccess(planProfile);
  const activeChallengeCount = ownedChallengesSnap.docs.filter((doc) => {
    const data = doc.data();
    const status = String(data.status ?? "").toLowerCase();
    const visibility = String(data.visibility ?? data.type ?? "public").toLowerCase();
    return ["published", "active", "upcoming"].includes(status) && !visibility.includes("private");
  }).length;
  const creationAccess = canCreateChallenge(planProfile, body as Record<string, unknown>, activeChallengeCount);
  if (!creationAccess.allowed) {
    return fail(creationAccess.message, creationAccess.code === "PLAN_LIMIT_REACHED" ? 409 : 403, { plan: planAccess, activeChallengeCount }, creationAccess.code ?? "PLAN_ACCESS_DENIED");
  }

  const ref = db.collection("challenges").doc();
  const challenge = {
    id: ref.id,
    creatorId: user.uid,
    title: body.title,
    description: body.description,
    category: body.category,
    type: body.type ?? "public",
    visibility: body.visibility ?? body.type ?? "public",
    premiumOnly: Boolean(body.premiumOnly),
    planRequired: body.premiumOnly ? "premium" : null,
    status: body.publish ? "published" : "draft",
    registrationDeadline: body.registrationDeadline,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    votingEndsAt: body.votingEndsAt,
    acceptedSubmissionTypes: body.acceptedSubmissionTypes ?? ["image"],
    rules: body.rules ?? [],
    prizeType: body.prizeType ?? "Bragging Rights (Leaderboard Ranking)",
    entryFee: Number(body.entryFee ?? 0),
    prizePool: Number(body.prizePool ?? 0),
    participantCount: 0,
    submissionCount: 0,
    voteCount: 0,
    weightedVoteCount: 0,
    requiresSubmissionApproval: true,
    creatorPlanId: planAccess.planId,
    createdAt: now,
    updatedAt: now
  };
  await ref.set(challenge);
  await createNotification(db, { userId: user.uid, type: "challenge_created", title: "Challenge saved", body: `${challenge.title} was ${challenge.status}.`, targetId: ref.id });
  return ok({ challenge }, challenge.status === "published" ? "Challenge published." : "Challenge draft saved.");
}
