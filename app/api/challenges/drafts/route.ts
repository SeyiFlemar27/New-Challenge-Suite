import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser, requireRole } from "@/lib/server/auth";
import { ok, serverUnavailable, fail, readJson } from "@/lib/server/responses";
import { writeAuditLog } from "@/lib/server/audit";
import { getUserPlanAccess } from "@/lib/plan-access";
import { calculateChallengeDraftProgress, resolveChallengeManagementState } from "@/lib/server/challenge-drafts";
import { isQaOrDemoRecord, publicChallengeFields } from "@/lib/server/public-challenge";
import { DEFAULT_CHALLENGE_TIME_ZONE } from "@/lib/challenge-date-time";
import { canCreateBuilderType, draftLimitForPlan, isUnfinishedChallengeDraft, normalizeBuilderChallengeType } from "@/lib/challenge-builder-foundation";
import { getNormalChallengeReadiness } from "@/lib/normal-challenge-readiness";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge drafts");
  const snap = await db.collection("challenges").where("creatorId", "==", user.uid).limit(100).get();
  const challenges = snap.docs
    .filter((doc) => !isQaOrDemoRecord(doc.id, doc.data()))
    .map((doc) => {
      const data = doc.data();
      const progress = calculateChallengeDraftProgress(data);
      return { id: doc.id, ...publicChallengeFields(data), status: data.status ?? "draft", managementState: resolveChallengeManagementState(data), completionPercentage: Number(data.completionPercentage ?? progress.completionPercentage), nextIncompleteSection: data.nextIncompleteSection ?? progress.nextIncompleteSection, lastAutosavedAt: data.lastAutosavedAt ?? data.updatedAt ?? null };
    });
  return ok({ challenges }, "Challenge drafts loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const permission = requireRole(user, ["user", "creator", "host"]);
  if (permission) return permission;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge draft creation");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = (parsed.body ?? {}) as Record<string, unknown>;
  const challengeType = normalizeBuilderChallengeType(body.challengeType ?? body.type);
  if (challengeType !== "normal") return fail("Use the dedicated builder for this challenge type.", 422, { challengeType }, "DEDICATED_BUILDER_REQUIRED");
  const basics = getNormalChallengeReadiness({ ...body, competitionFormat: "Public Voting", numberOfWinners: body.numberOfWinners ?? 1, winnerSplits: body.winnerSplits ?? [100] });
  const basicsErrors = basics.issues.filter((issue) => issue.step === 0);
  if (basicsErrors.length) return fail(basicsErrors[0].message, 422, { fieldErrors: Object.fromEntries(basicsErrors.map((issue) => [issue.field, issue.message])) }, "BASICS_INCOMPLETE");
  const [accountSnap, profileSnap] = await Promise.all([db.collection("users").doc(user.uid).get(), db.collection("profiles").doc(user.uid).get()]);
  const profile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) };
  const planAccess = getUserPlanAccess(profile);
  if (planAccess.isSponsor) return fail("Sponsor accounts manage campaigns from the sponsor dashboard.", 403, { redirectTo: "/sponsor/dashboard" }, "SPONSOR_NOT_ALLOWED");
  if (!canCreateBuilderType(planAccess.normalizedPlanId, challengeType)) return fail("This challenge type isn't included in your plan.", 403, { challengeType }, "CHALLENGE_TYPE_NOT_INCLUDED");
  const now = new Date().toISOString();
  const ref = db.collection("challenges").doc();
  const draft = {
    ...body,
    id: ref.id,
    creatorId: user.uid,
    ownerId: user.uid,
    status: "draft",
    lifecycleStatus: "draft",
    visibility: "public",
    type: "Public Challenge",
    challengeType,
    challengeTypeLocked: true,
    builderVersion: "normal_v1",
    timeZone: String(body.timeZone ?? body.timezone ?? DEFAULT_CHALLENGE_TIME_ZONE),
    timezone: String(body.timeZone ?? body.timezone ?? DEFAULT_CHALLENGE_TIME_ZONE),
    title: String(body.title ?? "").trim(),
    description: String(body.description ?? "").trim(),
    category: String(body.category ?? "").trim(),
    acceptedSubmissionTypes: Array.isArray(body.acceptedSubmissionTypes) ? body.acceptedSubmissionTypes : ["image"],
    participantApprovalMode: "automatic",
    requiresParticipantApproval: false,
    requiresSubmissionApproval: false,
    participantCount: 0,
    reservedSlotCount: 0,
    submissionCount: 0,
    voteCount: 0,
    completionPercentage: 0,
    nextIncompleteSection: "Participation",
    creationStep: 1,
    builderCurrentStep: 1,
    maxUnlockedStep: 1,
    draftAutosaveEnabled: true,
    entitlementConsumed: false,
    createdAt: now,
    updatedAt: now,
    lastAutosavedAt: now
  };
  const limit = draftLimitForPlan(planAccess.normalizedPlanId);
  try {
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(db.collection("challenges").where("creatorId", "==", user.uid).limit(100));
      const unfinished = existing.docs.filter((doc) => isUnfinishedChallengeDraft(doc.data())).length;
      if (unfinished >= limit) throw new Error("DRAFT_LIMIT_REACHED");
      transaction.create(ref, draft);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DRAFT_LIMIT_REACHED") return fail("You've reached your draft limit. Continue an existing draft, delete a draft you no longer need, or upgrade your plan.", 409, { limit, redirectTo: "/my-challenges" }, "DRAFT_LIMIT_REACHED");
    throw error;
  }
  await Promise.all([
    writeAuditLog({ actorId: user.uid, actorType: "user", action: "challenge_draft_created", targetType: "challenge", targetId: ref.id, after: { status: "draft", challengeType }, metadata: { source: "api/challenges/drafts" } }, db).catch(() => undefined),
    writeAuditLog({ actorId: user.uid, actorType: "user", action: "challenge_type_locked", targetType: "challenge", targetId: ref.id, after: { challengeType }, metadata: { source: "api/challenges/drafts" } }, db).catch(() => undefined)
  ]);
  return ok({ challenge: draft }, "Challenge draft created.");
}
