import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { canCreateChallenge, getPlanExperience, getUserPlanAccess } from "@/lib/plan-access";
import { normalizeMoneyLockedChallengeFields, shouldCountAgainstActiveChallengeLimit } from "@/lib/server/challenge-lifecycle";
import { serverChallengeCreateSchema, validateChallengeForPublish, zodFieldErrors } from "@/lib/server/challenge-validation";
import { writeAuditLog } from "@/lib/server/audit";
import { createNotification } from "@/lib/server/notifications";
import { writeChallengePrizePoolFoundation } from "@/lib/server/prize-pools";
import { revenueShareFoundation } from "@/lib/server/revenue-sharing";
import { FREE_BASIC_CHALLENGE_LIFETIME_LIMIT, freeBasicRemaining, freeBasicUsage } from "@/lib/server/free-challenge-limits";
import { createPrivateChallengeInvite } from "@/lib/server/private-invites";
import { editableDraftStatus, calculateChallengeDraftProgress } from "@/lib/server/challenge-drafts";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { getChallengeMonetizationAccess, validateEntryFee } from "@/lib/server/payout-structure";
import { normalizeChallengeTimelineForStorage } from "@/lib/challenge-date-time";
import { imageLessChallengePublishingAllowed } from "@/lib/server/provider-readiness";
import { getActiveEconomyRules } from "@/lib/server/economy-rules";
import { isKycRequiredForAction } from "@/lib/server/kyc-policy";
import { awardDoroCoinEngagement } from "@/lib/server/economy-dorocoin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge publishing");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const rawBody = normalizeChallengeTimelineForStorage({ ...((parsed.body ?? {}) as Record<string, unknown>), publish: true });
  const validation = serverChallengeCreateSchema.safeParse(rawBody);
  if (!validation.success) return validationError(zodFieldErrors(validation.error));
  const body = validation.data;
  if (body.usesPlaceholderMedia && process.env.NODE_ENV === "production" && !imageLessChallengePublishingAllowed()) return fail("Challenge media uploads are not available yet. Add a storage-confirmed challenge image before publishing.", 503, { provider: "firebase_storage", setupRequired: true }, "CHALLENGE_MEDIA_UNAVAILABLE");
  const { id } = await params;
  const now = new Date().toISOString();

  const [challengeSnap, accountSnap, profileSnap, ownedChallengesSnap] = await Promise.all([
    db.collection("challenges").doc(id).get(),
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get(),
    db.collection("challenges").where("creatorId", "==", user.uid).limit(200).get()
  ]);
  if (!challengeSnap.exists) return fail("Challenge draft not found.", 404, undefined, "CHALLENGE_NOT_FOUND");
  const current = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
  if (!userOwnsChallenge(current, user.uid)) return fail("You can only publish your own challenge drafts.", 403, undefined, "PERMISSION_DENIED");
  if (String(current.status ?? current.lifecycleStatus ?? "") === "pending_review") return fail("This challenge is already under review.", 409, undefined, "ALREADY_UNDER_REVIEW");
  if (!editableDraftStatus(current) && current.status !== "pending_review") return fail("This challenge is not editable for publishing.", 409, undefined, "CHALLENGE_NOT_EDITABLE");

  const publishValidation = validateChallengeForPublish({ ...body, creatorId: user.uid }, { mode: "publish", userId: user.uid });
  if (!publishValidation.valid) {
    return fail("Challenge is not ready to publish.", 422, { publishValidation, fieldErrors: Object.fromEntries(publishValidation.errors.map((issue) => [issue.field, issue.message])) }, "PUBLISH_VALIDATION_FAILED");
  }

  const planProfile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) };
  const planAccess = getUserPlanAccess(planProfile);
  const planExperience = getPlanExperience(planProfile);
  const monetizationAccess = getChallengeMonetizationAccess(planProfile);
  if (planAccess.isSponsor) return fail("Sponsor accounts manage campaigns from the sponsor dashboard.", 403, { redirectTo: "/sponsor/dashboard" }, "SPONSOR_NOT_ALLOWED");

  const freePlan = planAccess.normalizedPlanId === "free";
  const freeBasicChallengeCount = freeBasicUsage(ownedChallengesSnap.docs.filter((doc) => doc.id !== id));
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const publishedThisMonth = ownedChallengesSnap.docs.filter((document) => {
    if (document.id === id) return false;
    const data = document.data();
    const createdAt = Date.parse(String(data.createdAt ?? ""));
    return Number.isFinite(createdAt) && createdAt >= monthStart.getTime() && !["draft", "cancelled"].includes(String(data.status ?? ""));
  });
  if (!freePlan && planExperience.monthlyChallengeLimit !== null && publishedThisMonth.length >= planExperience.monthlyChallengeLimit) {
    return fail(`Your ${planAccess.planName} plan allows ${planExperience.challengeLimitLabel}.`, 409, undefined, "PLAN_LIMIT_REACHED");
  }
  if (freePlan && freeBasicChallengeCount >= FREE_BASIC_CHALLENGE_LIFETIME_LIMIT) {
    return fail("You have used all 3 lifetime Free Basic Challenges. Upgrade to Creator or Host to keep creating.", 409, { used: freeBasicChallengeCount, limit: FREE_BASIC_CHALLENGE_LIFETIME_LIMIT, redirectTo: "/subscriptions" }, "FREE_BASIC_LIMIT_REACHED");
  }
  if (freePlan && body.visibility !== "public") return fail("Free Basic Challenges must be public.", 403, undefined, "PRIVATE_CHALLENGE_LOCKED");

  const monetizationIntent = body.monetization;
  const requestedMonetization = Boolean(monetizationIntent.paidEntryRequested || monetizationIntent.sponsorReady || monetizationIntent.prizePoolRequested || monetizationIntent.paidVotesRequested);
  const paidEntryValidation = validateEntryFee(monetizationIntent.entryFeeAmountCents);
  if (requestedMonetization && !(monetizationAccess.canPreparePaidEntry || monetizationAccess.canPrepareSponsorReady || monetizationAccess.canPreparePrizePool || monetizationAccess.canPreparePaidVotes)) return fail("Monetized challenges are available to Creator, Host, and approved Enterprise accounts.", 403, undefined, "MONETIZATION_LOCKED");
  if (monetizationIntent.paidEntryRequested && (!monetizationAccess.canPreparePaidEntry || !paidEntryValidation.valid)) return fail(paidEntryValidation.message || "Paid entry setup is not available for this account.", 422, { minimumEntryFeeCents: paidEntryValidation.minimumEntryFeeCents }, "ENTRY_FEE_MINIMUM");
  const currentMonetization = current.monetization && typeof current.monetization === "object" ? current.monetization as Record<string, unknown> : {};
  const requiredCreatorFundingCents = Math.max(0, Number(currentMonetization.creatorPrizeFundingRequiredCents ?? 0));
  const confirmedCreatorFundingCents = Math.max(0, Number(current.confirmedCreatorPrizeFundingCents ?? currentMonetization.confirmedCreatorPrizeFundingCents ?? 0));
  const confirmedPlatformFundingCents = Math.max(0, Number(current.confirmedPlatformPromotionalPrizeCents ?? 0));
  if (requiredCreatorFundingCents > confirmedCreatorFundingCents) return fail("Confirm the full creator-funded prize amount before publishing this challenge.", 409, { requiredCreatorFundingCents, confirmedCreatorFundingCents }, "PRIZE_FUNDING_REQUIRED");
  if (monetizationIntent.prizePoolRequested && !monetizationIntent.paidEntryRequested && !monetizationIntent.sponsorReady && confirmedCreatorFundingCents + confirmedPlatformFundingCents <= 0) return fail("Confirm an approved prize funding source before publishing this challenge.", 409, { approvedSources: ["creator_funded", "entry_fee_allocated", "sponsor_funded", "platform_promotional"] }, "PRIZE_FUNDING_REQUIRED");

  const lifecycleStatus = "pending_review";
  const moneyLocks = normalizeMoneyLockedChallengeFields();
  const creationAccess = canCreateChallenge(planProfile, { ...body, ...moneyLocks, status: lifecycleStatus }, ownedChallengesSnap.docs.filter((doc) => shouldCountAgainstActiveChallengeLimit(doc.data().status) && doc.id !== id).length);
  if (!creationAccess.allowed) return fail(creationAccess.message, creationAccess.code === "PLAN_LIMIT_REACHED" ? 409 : 403, { plan: planAccess }, creationAccess.code ?? "PLAN_ACCESS_DENIED");

  const sponsorEnabled = Boolean(body.sponsorEnabled && planAccess.canCreateSponsoredChallenges);
  const safeMonetization = {
    ...currentMonetization,
    ...body.monetization,
    enabled: requestedMonetization,
    paidEntryRequested: Boolean(monetizationIntent.paidEntryRequested && monetizationAccess.canPreparePaidEntry),
    entryFeeAmountCents: monetizationIntent.paidEntryRequested ? paidEntryValidation.entryFeeCents : 0,
    currency: "USD",
    sponsorReady: sponsorEnabled,
    prizePoolRequested: Boolean(monetizationIntent.prizePoolRequested && monetizationAccess.canPreparePrizePool),
    paidVotesRequested: Boolean(monetizationIntent.paidVotesRequested && monetizationAccess.canPreparePaidVotes),
    status: requestedMonetization ? "setup_required" : "not_requested",
    paymentActive: false,
    checkoutActive: false,
    ledgerCreationEnabled: Boolean(requestedMonetization),
    prizeReleaseActive: false,
    payoutReleaseActive: false,
    adminApprovalRequired: Boolean(requestedMonetization),
    kycRequiredBeforeWithdrawal: isKycRequiredForAction("withdrawalRequest"),
    cashHoldHours: 24,
    creatorPrizeFundingRequiredCents: requiredCreatorFundingCents,
    confirmedCreatorPrizeFundingCents: confirmedCreatorFundingCents,
    creatorPrizeFundingStatus: requiredCreatorFundingCents > 0 ? confirmedCreatorFundingCents >= requiredCreatorFundingCents ? "fully_funded" : "funding_required" : String(currentMonetization.creatorPrizeFundingStatus ?? "not_requested"),
    prizePoolFundingSource: currentMonetization.prizePoolFundingSource ?? null
  };
  const progress = calculateChallengeDraftProgress(body as unknown as Record<string, unknown>);
  const economyRules = await getActiveEconomyRules(db);
  const simpleVotingStartAt = !body.isLiveEvent && body.tournamentType === "none" ? body.submissionStartAt || body.startsAt : body.votingStartsAt || body.submissionStartAt || body.startsAt;
  const update = {
    ...body,
    submissionStartAt: body.submissionStartAt || body.startsAt,
    votingStartsAt: simpleVotingStartAt,
    winnerAnnouncementAt: body.winnerAnnouncementAt || body.endsAt,
    timezone: body.timeZone,
    ...moneyLocks,
    id,
    creatorId: user.uid,
    ownerId: user.uid,
    status: lifecycleStatus,
    lifecycleStatus,
    economyRuleVersion: current.economyRuleVersion ?? economyRules.version,
    votingSettings: {
      ...body.votingSettings,
      allowPaidVotes: body.votingSettings.allowPaidVotes ?? body.votingSettings.allowDoroCoinVotes,
      allowDoroCoinVotes: undefined
    },
    monetization: safeMonetization,
    sponsorEnabled,
    participantApprovalMode: body.requiresParticipantApproval ? "manual" : "automatic",
    reviewStatus: lifecycleStatus === "pending_review" ? "pending_review" : "approved",
    adminReviewRequired: lifecycleStatus === "pending_review",
    submittedForReviewAt: lifecycleStatus === "pending_review" ? now : current.submittedForReviewAt ?? null,
    publishedAt: lifecycleStatus !== "pending_review" ? current.publishedAt ?? now : current.publishedAt ?? null,
    entitlementConsumed: true,
    freeBasicChallenge: freePlan,
    freeBasicChallengeLimit: freePlan ? FREE_BASIC_CHALLENGE_LIFETIME_LIMIT : null,
    freeBasicChallengesUsedAtCreation: freePlan ? freeBasicChallengeCount + 1 : null,
    freeBasicChallengesRemainingAfterPublish: freePlan ? freeBasicRemaining(freeBasicChallengeCount + 1) : null,
    completionPercentage: progress.completionPercentage,
    nextIncompleteSection: progress.nextIncompleteSection,
    updatedAt: now,
    lastPublishedAt: now
  };

  try {
    await Promise.all([
      db.collection("challenges").doc(id).set(update, { merge: true }),
      (body.visibility === "private" || body.visibility === "exclusive") ? createPrivateChallengeInvite(db, { challengeId: id, creatorId: user.uid, now }) : Promise.resolve(null),
      db.collection("revenueShareLedgers").doc(`revenue_share_${id}`).set(revenueShareFoundation({ challengeId: id, creatorId: user.uid, sponsorEnabled, now }), { merge: true }),
      writeChallengePrizePoolFoundation(db, { challengeId: id, prizeType: body.prizeType, prizeValueCents: Math.round(body.prizeValue * 100), sponsorEnabled, paidEntryEnabled: safeMonetization.paidEntryRequested, now })
    ]);
  } catch (error) {
    return serverError("Challenge could not be submitted for review.", error instanceof Error ? error.message : error);
  }
  await createNotification(db, { userId: user.uid, type: "challenge_submitted", title: "Challenge submitted", body: "Your challenge is awaiting review.", targetId: id }).catch(() => undefined);
  await writeAuditLog({ actorId: user.uid, actorType: "user", action: "challenge.published", targetType: "challenge", targetId: id, after: { status: lifecycleStatus, title: body.title }, reason: lifecycleStatus === "pending_review" ? "Challenge submitted for review." : "Challenge published from draft.", metadata: { source: "api/challenges/[id]/publish", idempotentDraftPublish: true } }, db).catch(() => undefined);
  if (lifecycleStatus !== "pending_review" && !safeMonetization.paidEntryRequested) {
    await awardDoroCoinEngagement(db, { userId: user.uid, sourceType: "create_free_challenge", actionId: id, challengeId: id }).catch(async (error) => {
      await db.collection("adminActionTasks").doc(`doro_create_${id}`).set({ type: "dorocoin_reward_delivery_failure", sourceType: "create_free_challenge", challengeId: id, userId: user.uid, status: "open", message: error instanceof Error ? error.message : "Reward delivery failed.", createdAt: now }, { merge: true });
    });
  }
  return ok({ challenge: update }, lifecycleStatus === "pending_review" ? "Challenge submitted for review." : "Challenge scheduled.");
}
