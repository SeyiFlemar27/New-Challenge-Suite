import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser, requireRole } from "@/lib/server/auth";
import { createNotification } from "@/lib/server/notifications";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { getChallengeDisplayStatus } from "@/lib/challenge-status";
import { canCreateChallenge, getUserPlanAccess } from "@/lib/plan-access";
import { normalizeMoneyLockedChallengeFields, resolveInitialChallengeStatus, shouldCountAgainstActiveChallengeLimit } from "@/lib/server/challenge-lifecycle";
import { serverChallengeCreateSchema, zodFieldErrors } from "@/lib/server/challenge-validation";
import { writeAuditLog } from "@/lib/server/audit";
import { writeCashTransactionPlaceholder } from "@/lib/server/cash-transactions";
import { writeDisabledPrizePoolFoundation } from "@/lib/server/prize-pools";

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
  const permission = requireRole(user, ["user", "creator"]);
  if (permission) return permission;

  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const validation = serverChallengeCreateSchema.safeParse(parsed.body);
  if (!validation.success) return validationError(zodFieldErrors(validation.error));
  const body = validation.data;

  const now = new Date().toISOString();
  const [accountSnap, profileSnap, ownedChallengesSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get(),
    db.collection("challenges").where("creatorId", "==", user.uid).limit(200).get()
  ]);
  const planProfile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) };
  const planAccess = getUserPlanAccess(planProfile);

  if (planAccess.isSponsor) {
    return fail("Sponsors manage campaigns from the Brand Command Center. Use /sponsor instead of normal challenge creation.", 403, { redirectTo: "/sponsor/dashboard" }, "USER_ACCOUNT_REQUIRED");
  }

  const activeChallengeCount = ownedChallengesSnap.docs.filter((doc) => shouldCountAgainstActiveChallengeLimit(doc.data().status)).length;
  const lifecycleStatus = resolveInitialChallengeStatus({
    publish: body.publish,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    submissionDeadline: body.submissionDeadline,
    votingDeadline: body.votingDeadline,
    sponsorEnabled: body.sponsorEnabled,
    visibility: body.visibility,
    competitionFormat: body.competitionFormat,
    premiumOnly: body.premiumOnly
  });
  const moneyLocks = normalizeMoneyLockedChallengeFields();
  const challengeInputForAccess = { ...body, ...moneyLocks, status: lifecycleStatus };
  const creationAccess = canCreateChallenge(planProfile, challengeInputForAccess as Record<string, unknown>, activeChallengeCount);
  if (!creationAccess.allowed) {
    return fail(creationAccess.message, creationAccess.code === "PLAN_LIMIT_REACHED" ? 409 : 403, { plan: planAccess, activeChallengeCount }, creationAccess.code ?? "PLAN_ACCESS_DENIED");
  }

  const ref = db.collection("challenges").doc();
  const sponsorEnabled = Boolean(body.sponsorEnabled && planAccess.canCreateSponsoredChallenges);
  const challenge = {
    id: ref.id,
    creatorId: user.uid,
    title: body.title,
    description: body.description,
    category: body.category === "Other" ? body.customCategory : body.category,
    customCategory: body.category === "Other" ? body.customCategory ?? null : null,
    type: body.type ?? (body.visibility === "private" ? "Private / Exclusive" : "Public Challenge"),
    visibility: body.visibility,
    premiumOnly: Boolean(body.premiumOnly),
    planRequired: body.premiumOnly ? "pro" : null,
    status: lifecycleStatus,
    lifecycleStatus,
    submissionDeadline: body.submissionDeadline,
    registrationDeadline: body.submissionDeadline,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    votingDeadline: body.votingDeadline,
    votingEndsAt: body.votingDeadline,
    acceptedSubmissionTypes: body.acceptedSubmissionTypes,
    competitionFormat: body.competitionFormat,
    bestOf: body.bestOf,
    votingSettings: body.votingSettings,
    rules: [],
    prizeType: "Bragging Rights (Leaderboard Ranking)",
    ...moneyLocks,
    sponsorEnabled,
    sponsorSlots: sponsorEnabled ? Number(body.sponsorSlots ?? 0) : 0,
    minimumSponsorshipAmount: sponsorEnabled ? Number(body.minimumSponsorshipAmount ?? 0) : 0,
    sponsorPlacementOptions: sponsorEnabled ? body.sponsorPlacementOptions : [],
    sponsorMoneyCaptureEnabled: false,
    sponsorMoneyReleaseEnabled: false,
    participantCount: 0,
    submissionCount: 0,
    voteCount: 0,
    weightedVoteCount: 0,
    requiresSubmissionApproval: true,
    creatorPlanId: planAccess.normalizedPlanId,
    creatorLegacyPlanId: planAccess.planId,
    createdAt: now,
    updatedAt: now,
    submittedForReviewAt: lifecycleStatus === "pending_review" ? now : null,
    publishedAt: body.publish && lifecycleStatus !== "pending_review" ? now : null
  };

  await Promise.all([
    ref.set(challenge),
    writeDisabledPrizePoolFoundation(db, ref.id, now),
    writeCashTransactionPlaceholder(db, {
      id: `challenge_${ref.id}_prize_placeholder`,
      userId: user.uid,
      type: "prize_placeholder_created",
      status: "recorded",
      amountCents: 0,
      currency: "USD",
      sourceType: "challenge",
      sourceId: ref.id,
      challengeId: ref.id,
      description: `Prize foundation placeholder created for challenge ${ref.id}. No cash prize or payout movement is active.`,
      now
    })
  ]);
  await createNotification(db, { userId: user.uid, type: "challenge_created", title: body.publish ? "Challenge submitted" : "Challenge draft saved", body: `${challenge.title} is ${challenge.status.replaceAll("_", " ")}.`, targetId: ref.id });
  await writeAuditLog({
    actorId: user.uid,
    actorType: user.role === "creator" ? "creator" : "user",
    action: body.publish ? lifecycleStatus === "pending_review" ? "challenge.updated" : "challenge.created" : "challenge.created",
    targetType: "challenge",
    targetId: ref.id,
    after: { status: lifecycleStatus, title: challenge.title, sponsorEnabled },
    reason: body.publish ? lifecycleStatus === "pending_review" ? "Challenge submitted for review." : "Challenge created." : "Challenge saved as draft.",
    metadata: { source: "api/challenges", lifecycleStatus, moneyLocked: true }
  }, db).catch((error) => console.warn("[audit] challenge create log failed", error instanceof Error ? error.message : String(error)));

  return ok({ challenge }, body.publish ? lifecycleStatus === "pending_review" ? "Challenge submitted for review." : "Challenge scheduled." : "Challenge draft saved.");
}
