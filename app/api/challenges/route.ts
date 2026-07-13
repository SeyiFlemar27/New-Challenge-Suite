import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser, requireRole } from "@/lib/server/auth";
import { createNotification } from "@/lib/server/notifications";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { getChallengeDisplayStatus } from "@/lib/challenge-status";
import { canCreateChallenge, getPlanExperience, getUserPlanAccess } from "@/lib/plan-access";
import { normalizeMoneyLockedChallengeFields, resolveInitialChallengeStatus, shouldCountAgainstActiveChallengeLimit } from "@/lib/server/challenge-lifecycle";
import { serverChallengeCreateSchema, validateChallengeForDraft, validateChallengeForPublish, zodFieldErrors } from "@/lib/server/challenge-validation";
import { writeAuditLog } from "@/lib/server/audit";
import { writeCashTransactionPlaceholder } from "@/lib/server/cash-transactions";
import { writeChallengePrizePoolFoundation } from "@/lib/server/prize-pools";
import { isPublicChallenge, publicChallengeFields } from "@/lib/server/public-challenge";
import { FREE_BASIC_CHALLENGE_LIFETIME_LIMIT, freeBasicLimitMessage, freeBasicRemaining, freeBasicUsage } from "@/lib/server/free-challenge-limits";
import { createPrivateChallengeInvite } from "@/lib/server/private-invites";
import { revenueShareFoundation } from "@/lib/server/revenue-sharing";

export async function GET() {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge listing");
  const snap = await db.collection("challenges").orderBy("createdAt", "desc").limit(100).get();
  const challenges = snap.docs.flatMap((doc) => {
    const data = doc.data();
    if (!isPublicChallenge(doc.id, data)) return [];
    return [{ ...publicChallengeFields(data), id: doc.id, computedStatus: getChallengeDisplayStatus(data as any) }];
  });
  return ok({ challenges }, "Challenges loaded.");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge creation");
  const permission = requireRole(user, ["user", "creator", "host"]);
  if (permission) return permission;

  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const validation = serverChallengeCreateSchema.safeParse(parsed.body);
  if (!validation.success) return validationError(zodFieldErrors(validation.error));
  const body = validation.data;

  const draftValidation = validateChallengeForDraft({ ...body, creatorId: user.uid });
  if (!draftValidation.valid) {
    return fail("Draft contains invalid data.", 400, { publishValidation: draftValidation, fieldErrors: Object.fromEntries(draftValidation.errors.map((issue) => [issue.field, issue.message])) }, "DRAFT_VALIDATION_FAILED");
  }
  if (body.publish) {
    const publishValidation = validateChallengeForPublish({ ...body, creatorId: user.uid }, { mode: "publish", userId: user.uid });
    if (!publishValidation.valid) {
      return fail("Challenge is not ready to publish.", 422, { publishValidation, fieldErrors: Object.fromEntries(publishValidation.errors.map((issue) => [issue.field, issue.message])) }, "PUBLISH_VALIDATION_FAILED");
    }
  }

  const now = new Date().toISOString();
  const [accountSnap, profileSnap, ownedChallengesSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get(),
    db.collection("challenges").where("creatorId", "==", user.uid).limit(200).get()
  ]);
  const planProfile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) };
  const planAccess = getUserPlanAccess(planProfile);
  const planExperience = getPlanExperience(planProfile);
  const freeBasicChallengeCount = freeBasicUsage(ownedChallengesSnap.docs);
  const freePlan = planAccess.normalizedPlanId === "free";

  if (planAccess.isSponsor) {
    return fail("Sponsors manage campaigns from the Brand Command Center. Use /sponsor instead of normal challenge creation.", 403, { redirectTo: "/sponsor/dashboard" }, "USER_ACCOUNT_REQUIRED");
  }

  const activeChallengeCount = ownedChallengesSnap.docs.filter((doc) => shouldCountAgainstActiveChallengeLimit(doc.data().status)).length;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const challengesCreatedThisMonth = ownedChallengesSnap.docs.filter((document) => {
    const data = document.data();
    const createdAt = Date.parse(String(data.createdAt ?? ""));
    return Number.isFinite(createdAt) && createdAt >= monthStart.getTime() && !["draft", "cancelled"].includes(String(data.status ?? ""));
  });
  const privateChallengesThisMonth = challengesCreatedThisMonth.filter((document) => {
    const data = document.data();
    return String(data.visibility ?? data.type ?? "").toLowerCase().includes("private");
  }).length;
  if (!freePlan && body.publish && planExperience.monthlyChallengeLimit !== null && challengesCreatedThisMonth.length >= planExperience.monthlyChallengeLimit) {
    return fail(`Your ${planAccess.planName} plan allows ${planExperience.challengeLimitLabel}.`, 409, undefined, "PLAN_LIMIT_REACHED");
  }
  if (freePlan && body.publish && freeBasicChallengeCount >= FREE_BASIC_CHALLENGE_LIFETIME_LIMIT) {
    return fail("You have used all 3 lifetime Free Basic Challenges. Upgrade to Creator or Host to keep creating.", 409, { used: freeBasicChallengeCount, limit: FREE_BASIC_CHALLENGE_LIFETIME_LIMIT, redirectTo: "/subscriptions" }, "FREE_BASIC_LIMIT_REACHED");
  }
  if (freePlan && body.visibility !== "public") {
    return fail("Free Basic Challenges must be public. Upgrade to Creator or Host for private invite-only challenges.", 403, undefined, "PRIVATE_CHALLENGE_LOCKED");
  }
  if (freePlan && (body.sponsorEnabled || body.isLiveEvent || body.tournamentType !== "none" || body.prizeType !== "bragging_rights" || body.requiresSubmissionApproval || body.votingSettings.weightedVotes)) {
    return fail("Free Basic Challenges are public, non-monetized, and do not include prizes, sponsors, tournaments, live events, revenue sharing, or advanced voting.", 403, undefined, "FREE_BASIC_ADVANCED_LOCKED");
  }
  if (body.publish && body.visibility === "private" && planExperience.monthlyPrivateChallengeLimit !== null && privateChallengesThisMonth >= planExperience.monthlyPrivateChallengeLimit) {
    return fail(`Your ${planAccess.planName} plan allows ${planExperience.privateChallengeLimitLabel}.`, 409, undefined, "PRIVATE_CHALLENGE_LIMIT_REACHED");
  }
  let lifecycleStatus = resolveInitialChallengeStatus({
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
  const advancedReviewRequired = body.prizeType === "money"
    || body.prizeType === "physical_product"
    || body.isLiveEvent
    || body.tournamentType !== "none"
    || body.competitionFormat.toLowerCase().includes("tournament");
  if (body.publish && advancedReviewRequired) lifecycleStatus = "pending_review";
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
    registrationDeadline: body.registrationDeadline || body.submissionDeadline,
    timeZone: body.timeZone,
    lateRegistrationEnabled: body.lateRegistrationEnabled,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    votingDeadline: body.votingDeadline,
    votingEndsAt: body.votingDeadline,
    acceptedSubmissionTypes: body.acceptedSubmissionTypes,
    competitionFormat: body.competitionFormat,
    bestOf: body.bestOf,
    numberOfWinners: body.numberOfWinners,
    winnerSelection: body.winnerSelection,
    votingSettings: body.votingSettings,
    rules: body.standardRules
      ? body.standardRules.split("\n").map((rule, index) => ({ id: `rule_${index + 1}`, editableText: rule.trim() })).filter((rule) => rule.editableText)
      : [],
    standardRules: body.standardRules,
    policyTerms: body.policyTerms,
    challengeGuidelines: body.challengeGuidelines,
    prizeType: body.prizeType,
    prizeTitle: body.prizeTitle || null,
    prizeDescription: body.prizeDescription || null,
    prizeValue: body.prizeValue,
    prizeDeliveryNotes: body.prizeDeliveryNotes || null,
    prizeApprovalStatus: ["none", "bragging_rights"].includes(body.prizeType) ? "not_required" : "pending_admin_review",
    publicPrizeStatus: ["none", "bragging_rights"].includes(body.prizeType) ? "available" : "pending_review",
    jackpotAllocationPercent: 85,
    publicJackpotEstimateCents: 0,
    platformFeePercent: 15,
    platformFeeVisibility: "admin_only",
    ...moneyLocks,
    sponsorEnabled,
    sponsorSlots: sponsorEnabled ? Number(body.sponsorSlots ?? 0) : 0,
    minimumSponsorshipAmount: sponsorEnabled ? Number(body.minimumSponsorshipAmount ?? 0) : 0,
    sponsorPlacementOptions: sponsorEnabled ? body.sponsorPlacementOptions : [],
    sponsorPackages: sponsorEnabled ? body.sponsorPackages.map((item) => ({
      ...item,
      priceCents: Math.round(item.price * 100),
      availableSlots: item.slotLimit,
      moneyCaptureStatus: "not_active",
      releaseStatus: "not_active"
    })) : [],
    sponsorshipSplitDefaults: sponsorEnabled ? {
      sponsorReturnPercent: 12,
      creatorPercent: 3,
      status: "draft",
      moneyMovementEnabled: false
    } : null,
    sponsorMoneyCaptureEnabled: false,
    sponsorMoneyReleaseEnabled: false,
    freeBasicChallenge: freePlan,
    freeBasicChallengeLimit: freePlan ? FREE_BASIC_CHALLENGE_LIFETIME_LIMIT : null,
    freeBasicChallengesUsedAtCreation: freePlan ? freeBasicChallengeCount + (body.publish ? 1 : 0) : null,
    freeBasicChallengeLimitLabel: freePlan ? freeBasicLimitMessage(freeBasicChallengeCount + (body.publish ? 1 : 0)) : null,
    freeBasicChallengesRemainingAfterPublish: freePlan && body.publish ? freeBasicRemaining(freeBasicChallengeCount + 1) : null,
    participantCount: 0,
    submissionCount: 0,
    voteCount: 0,
    weightedVoteCount: 0,
    requiresSubmissionApproval: body.requiresSubmissionApproval || body.isLiveEvent || body.tournamentType !== "none",
    coverImageUrl: body.coverImageUrl || null,
    coverImagePath: body.coverImagePath || null,
    promoImageUrl: body.promoImageUrl || null,
    promoImagePath: body.promoImagePath || null,
    trailerVideoUrl: body.trailerVideoUrl || null,
    trailerVideoPath: body.trailerVideoPath || null,
    promoVideoUrl: body.promoVideoUrl || null,
    promoVideoPath: body.promoVideoPath || null,
    mediaStorageStatus: [body.coverImagePath, body.promoImagePath, body.trailerVideoPath, body.promoVideoPath].some(Boolean) ? "uploaded" : "metadata_only",
    isLiveEvent: body.isLiveEvent,
    venueName: body.venueName || null,
    eventAddress: body.eventAddress || null,
    eventCity: body.eventCity || null,
    eventState: body.eventState || null,
    eventCountry: body.eventCountry || null,
    eventMapUrl: body.eventMapUrl || null,
    eventCapacity: body.eventCapacity,
    eventMode: body.isLiveEvent ? "physical_first_external_livestream" : "online",
    externalLiveUrl: body.externalLiveUrl || null,
    externalLiveProvider: body.externalLiveProvider || null,
    externalLiveStatus: body.externalLiveStatus,
    externalLiveOpensAt: body.externalLiveOpensAt || null,
    externalLiveCtaLabel: body.externalLiveCtaLabel || "Watch live on partner site",
    nativeLiveStreamingEnabled: false,
    eventSyncStatus: body.isLiveEvent ? "pending_review" : "not_applicable",
    eventVisibility: body.isLiveEvent ? "hidden_until_approved" : "not_applicable",
    eventApprovalStatus: body.isLiveEvent ? "pending_admin_review" : "not_required",
    tournamentType: body.tournamentType,
    tournamentModel: body.tournamentType !== "none" ? "multi_stage_competition" : "not_applicable",
    tournamentStages: body.tournamentStages.length ? body.tournamentStages : body.tournamentType !== "none" ? [
      { id: "registration", name: "Registration", order: 1, status: "draft", advancementRule: "Participants register or request approval." },
      { id: "round_1", name: "Round 1", order: 2, status: "draft", advancementRule: "Submissions and/or voting determine advancement." },
      { id: "final", name: "Final", order: 3, status: "draft", advancementRule: "Final winner requires host and admin review." }
    ] : [],
    tournamentCurrentStage: body.tournamentType !== "none" ? "registration" : null,
    tournamentExecutionEnabled: false,
    divisionFormat: body.divisionFormat,
    maxParticipants: body.maxParticipants,
    scoringMode: body.scoringMode,
    bestOfRounds: body.bestOfRounds,
    pointsToWin: body.pointsToWin,
    timerEnabled: body.timerEnabled,
    timerDuration: body.timerDuration,
    roundDuration: body.roundDuration,
    judgeScoringEnabled: body.judgeScoringEnabled,
    hostOperations: body.hostOperations ? {
      ...body.hostOperations,
      financialExecutionEnabled: false,
      moderationActionsEnabled: false,
      winnerPublishingEnabled: false,
      exportsEnabled: false
    } : null,
    votingStartsAt: body.votingStartsAt || body.submissionDeadline,
    adminReviewRequired: lifecycleStatus === "pending_review",
    adminPriceApprovalStatus: body.prizeType === "money" ? "pending_review" : "not_required",
    creatorPlanId: planAccess.normalizedPlanId,
    creatorLegacyPlanId: planAccess.planId,
    createdAt: now,
    updatedAt: now,
    submittedForReviewAt: lifecycleStatus === "pending_review" ? now : null,
    publishedAt: body.publish && lifecycleStatus !== "pending_review" ? now : null
  };
  const privateInvitePromise = challenge.visibility === "private" || challenge.visibility === "exclusive"
    ? createPrivateChallengeInvite(db, { challengeId: ref.id, creatorId: user.uid, now })
    : Promise.resolve(null);

  await Promise.all([
    ref.set(challenge),
    db.collection("revenueShareLedgers").doc(`revenue_share_${ref.id}`).set(revenueShareFoundation({ challengeId: ref.id, creatorId: user.uid, sponsorEnabled, now }), { merge: true }),
    privateInvitePromise,
    writeChallengePrizePoolFoundation(db, {
      challengeId: ref.id,
      prizeType: body.prizeType,
      prizeValueCents: Math.round(body.prizeValue * 100),
      sponsorEnabled,
      now
    }),
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
