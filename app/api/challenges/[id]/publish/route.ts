import { getAdminDb } from "@/lib/firebase/admin";
import { randomUUID } from "node:crypto";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverError, serverUnavailable } from "@/lib/server/responses";
import { canCreateChallenge, getPlanExperience, getUserPlanAccess } from "@/lib/plan-access";
import { normalizeMoneyLockedChallengeFields, shouldCountAgainstActiveChallengeLimit } from "@/lib/server/challenge-lifecycle";
import { serverChallengeCreateSchema, validateChallengeForPublish, zodFieldErrors } from "@/lib/server/challenge-validation";
import { createAuditLogRecord, writeAuditLog } from "@/lib/server/audit";
import { createNotification } from "@/lib/server/notifications";
import { revenueShareFoundation } from "@/lib/server/revenue-sharing";
import { FREE_BASIC_CHALLENGE_LIFETIME_LIMIT, freeBasicRemaining, freeBasicUsage } from "@/lib/server/free-challenge-limits";
import { createPrivateChallengeInvite } from "@/lib/server/private-invites";
import { calculateChallengeDraftProgress, resolveChallengeManagementState } from "@/lib/server/challenge-drafts";
import { requireChallengeManagementAccess } from "@/lib/server/challenge-management-access";
import { getChallengeMonetizationAccess, validateEntryFee } from "@/lib/server/payout-structure";
import { normalizeChallengeTimelineForStorage } from "@/lib/challenge-date-time";
import { imageLessChallengePublishingAllowed } from "@/lib/server/provider-readiness";
import { getActiveEconomyRules } from "@/lib/server/economy-rules";
import { isKycRequiredForAction } from "@/lib/server/kyc-policy";
import { awardDoroCoinEngagement } from "@/lib/server/economy-dorocoin";
import { getChallengePublishBlocker } from "@/lib/challenge-publish-readiness";
import { normalizeBuilderChallengeType } from "@/lib/challenge-builder-foundation";
import { getNormalChallengeReadiness } from "@/lib/normal-challenge-readiness";
import { buildStoredVotingSettings } from "@/lib/server/challenge-publish-payload";
import { InvalidFirestorePayloadError, sanitizeFirestorePayload } from "@/lib/server/firestore-payload";
import { ChallengeReviewTransitionError, commitChallengeReviewSubmission } from "@/lib/server/challenge-review-submission";
import { ENTERPRISE_WORKSPACE_LIMITS } from "@/lib/enterprise-access";
import { applyVerifiedChallengeMedia, persistChallengeMediaVerification, recordChallengeMediaVerificationFailure, verifyChallengeMedia } from "@/lib/server/media-verification";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  if (!user) return fail("Your session expired. Please sign in again.", 401, undefined, "AUTHENTICATION_REQUIRED");
  const actorId = user.uid;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge publishing");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const rawBody = normalizeChallengeTimelineForStorage({ ...((parsed.body ?? {}) as Record<string, unknown>), publish: true }) as Record<string, unknown>;
  const { id } = await params;
  const now = new Date().toISOString();
  const publishRequestId = `PUB-${randomUUID().slice(0, 8).toUpperCase()}`;

  const [challengeSnap, accountSnap, profileSnap, ownedChallengesSnap] = await Promise.all([
    db.collection("challenges").doc(id).get(),
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get(),
    db.collection("challenges").where("creatorId", "==", user.uid).limit(200).get()
  ]);
  if (!challengeSnap.exists) return fail("Challenge draft not found.", 404, undefined, "CHALLENGE_NOT_FOUND");
  const current = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
  const managementAccess = await requireChallengeManagementAccess(request, id, "challenge.edit");
  if (managementAccess.response) return managementAccess.response;
  const currentStatus = String(current.status ?? current.lifecycleStatus ?? "draft").toLowerCase();
  if (currentStatus === "pending_review") return ok({ challenge: current, idempotent: true }, "Challenge is already submitted for review.");
  const lockedType = normalizeBuilderChallengeType(current.challengeType ?? current.type);
  const usesNormalBuilderFoundation = lockedType === "normal" && (
    String(current.builderVersion ?? "") === "normal_v1" || String(current.challengeType ?? "") === "normal"
  );
  if (normalizeBuilderChallengeType(rawBody.challengeType ?? rawBody.type) !== lockedType) return fail("Challenge type can't be changed after the draft is created.", 409, undefined, "CHALLENGE_TYPE_LOCKED");
  const planProfile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) };
  const planAccess = getUserPlanAccess(planProfile);
  const planExperience = getPlanExperience(planProfile);
  const monetizationAccess = getChallengeMonetizationAccess(planProfile);
  const rawMonetization = rawBody.monetization && typeof rawBody.monetization === "object" ? rawBody.monetization as Record<string, unknown> : {};
  const mediaSummary = {
    coverReady: Boolean(rawBody.coverImageUrl && rawBody.coverImagePath),
    uploadStatus: String(rawBody.mediaUploadStatus ?? "unknown"),
    mediaStatus: String(rawBody.mediaStatus ?? "unknown"),
    placeholderRequested: rawBody.usesPlaceholderMedia === true
  };
  async function rejectPublish(message: string, status: number, details: unknown, code: string, supportDiagnostic?: { requestId: string; stage: string; payloadName: string; safePath: string }) {
    await writeAuditLog({
      actorId,
      actorType: "creator",
      action: "challenge.publish_failed",
      targetType: "challenge",
      targetId: id,
      before: { status: String(current.status ?? current.lifecycleStatus ?? "unknown") },
      after: { attemptedStatus: "pending_review" },
      reason: message,
      metadata: {
        action: "publish_challenge",
        causeCode: code,
        safeMessage: message,
        planId: planAccess.normalizedPlanId,
        accountType: planAccess.accountType,
        media: mediaSummary,
        paidEntry: { requested: rawMonetization.paidEntryRequested === true, amountConfigured: Number(rawMonetization.entryFeeAmountCents ?? 0) > 0 },
        sponsorReady: { requested: rawMonetization.sponsorReady === true },
        prizePool: { requested: rawMonetization.prizePoolRequested === true, confirmedFundingPresent: Number(current.confirmedCreatorPrizeFundingCents ?? 0) > 0 },
        ...(supportDiagnostic ? { supportDiagnostic } : {}),
        occurredAt: now
      },
      createdAt: now
    }, db).catch(() => undefined);
    return fail(message, status, details, code);
  }

  const validation = serverChallengeCreateSchema.safeParse(rawBody);
  if (!validation.success) return rejectPublish("Some required details are missing.", 400, { fieldErrors: zodFieldErrors(validation.error) }, "VALIDATION_ERROR");
  const body = validation.data;
  const privateAccessMethod = body.privateAccessMethod === "link_and_code" || body.privateAccessMethod === "access_code" ? "invitation_code" : body.privateAccessMethod;
  let privateAccess: Record<string, unknown> | null = null;
  const judgeAccountIds = body.hostOperations?.judgeAccountIds ?? [];
  if (body.isLiveEvent && body.hostOperations?.winnerSelection === "judge_selection") {
    if (!judgeAccountIds.length) return rejectPublish("Assign at least one registered judge before submitting this event.", 422, { fieldErrors: { judgeAccountIds: "Assign at least one registered judge." } }, "REGISTERED_JUDGE_REQUIRED");
    const judgeSnaps = await db.getAll(...judgeAccountIds.map((judgeId) => db.collection("users").doc(judgeId)));
    if (judgeSnaps.some((snap) => !snap.exists || String(snap.data()?.accountStatus ?? "active") !== "active")) return rejectPublish("One or more assigned judges are no longer available. Choose registered accounts and try again.", 422, { fieldErrors: { judgeAccountIds: "Choose active registered accounts." } }, "REGISTERED_JUDGE_INVALID");
  }
  if (body.usesPlaceholderMedia && process.env.NODE_ENV === "production" && !imageLessChallengePublishingAllowed()) return rejectPublish("Please add challenge media before publishing.", 503, { setupRequired: true }, "CHALLENGE_MEDIA_UNAVAILABLE");
  if (planAccess.isSponsor) return rejectPublish("You can't publish this challenge.", 403, { redirectTo: "/sponsor/dashboard" }, "SPONSOR_NOT_ALLOWED");

  const publishValidation = validateChallengeForPublish({ ...body, creatorId: user.uid }, { mode: "publish", userId: user.uid });
  const normalReadiness = usesNormalBuilderFoundation ? getNormalChallengeReadiness({ ...current, ...rawBody, ...body, creatorId: user.uid }) : null;
  if (normalReadiness && !normalReadiness.ready) return rejectPublish(normalReadiness.issues[0]?.message ?? "Some required details are missing.", 422, { readiness: normalReadiness, fieldErrors: Object.fromEntries(normalReadiness.issues.map((issue) => [issue.field, issue.message])) }, "NORMAL_CHALLENGE_NOT_READY");

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
    return rejectPublish("This feature isn't included in your plan.", 409, undefined, "PLAN_LIMIT_REACHED");
  }
  if (freePlan && freeBasicChallengeCount >= FREE_BASIC_CHALLENGE_LIFETIME_LIMIT) {
    return rejectPublish("This feature isn't included in your plan.", 409, { used: freeBasicChallengeCount, limit: FREE_BASIC_CHALLENGE_LIFETIME_LIMIT, redirectTo: "/subscriptions" }, "FREE_BASIC_LIMIT_REACHED");
  }
  if (freePlan && body.visibility !== "public") return rejectPublish("This feature isn't included in your plan.", 403, undefined, "PRIVATE_CHALLENGE_LOCKED");

  const monetizationIntent = body.monetization;
  const requestedMonetization = Boolean(monetizationIntent.paidEntryRequested || monetizationIntent.sponsorReady || monetizationIntent.prizePoolRequested || monetizationIntent.paidVotesRequested);
  const paidEntryValidation = validateEntryFee(monetizationIntent.entryFeeAmountCents);
  const currentMonetization = current.monetization && typeof current.monetization === "object" ? current.monetization as Record<string, unknown> : {};
  const requiredCreatorFundingCents = Math.max(0, Number(currentMonetization.creatorPrizeFundingRequiredCents ?? 0));
  const confirmedCreatorFundingCents = Math.max(0, Number(current.confirmedCreatorPrizeFundingCents ?? currentMonetization.confirmedCreatorPrizeFundingCents ?? 0));
  const planAllowsRequestedFeatures = !planAccess.isSponsor
    && (!monetizationIntent.paidEntryRequested || monetizationAccess.canPreparePaidEntry)
    && (!monetizationIntent.sponsorReady || monetizationAccess.canPrepareSponsorReady)
    && (!monetizationIntent.prizePoolRequested || monetizationAccess.canPreparePrizePool)
    && (!monetizationIntent.paidVotesRequested || monetizationAccess.canPreparePaidVotes);
  const sharedBlocker = getChallengePublishBlocker({
    authenticated: true,
    ownsChallenge: true,
    status: resolveChallengeManagementState(current),
    planAllowsChallenge: planAllowsRequestedFeatures,
    validation: publishValidation,
    mediaMissing: false,
    mediaProcessing: false,
    mediaFailed: false,
    paidEntryRequested: monetizationIntent.paidEntryRequested,
    entryFeeValid: !monetizationIntent.paidEntryRequested || paidEntryValidation.valid
  });
  if (sharedBlocker) {
    const status = sharedBlocker.code === "PERMISSION_DENIED" || sharedBlocker.code === "PLAN_ACCESS_DENIED" ? 403 : sharedBlocker.code === "MISSING_REQUIRED_DETAILS" || sharedBlocker.code === "INVALID_TIMELINE" || sharedBlocker.code === "MEDIA_REQUIRED" || sharedBlocker.code === "PAID_ENTRY_INVALID" || sharedBlocker.code === "PRIZE_CONFIGURATION_INVALID" ? 422 : 409;
    return rejectPublish(sharedBlocker.message, status, { publishValidation, fieldErrors: Object.fromEntries(publishValidation.errors.map((issue) => [issue.field, issue.message])) }, sharedBlocker.code);
  }

  const lifecycleStatus = "pending_review";
  const moneyLocks = normalizeMoneyLockedChallengeFields();
  const creationAccess = canCreateChallenge(planProfile, { ...body, ...moneyLocks, paidEntryEnabled: monetizationIntent.paidEntryRequested, entryFee: paidEntryValidation.entryFeeCents / 100, prizePoolEnabled: monetizationIntent.prizePoolRequested, status: lifecycleStatus }, ownedChallengesSnap.docs.filter((doc) => shouldCountAgainstActiveChallengeLimit(doc.data().status) && doc.id !== id).length);
  if (!creationAccess.allowed) return rejectPublish("This feature isn't included in your plan.", creationAccess.code === "PLAN_LIMIT_REACHED" ? 409 : 403, { planId: planAccess.normalizedPlanId }, creationAccess.code ?? "PLAN_ACCESS_DENIED");

  const sponsorEnabled = Boolean((body.sponsorEnabled || monetizationIntent.sponsorReady) && planAccess.canCreateSponsoredChallenges);
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
  const normalV2 = body.builderVersion === "normal_v2";
  const simpleVotingStartAt = !body.isLiveEvent && body.tournamentType === "none" && !normalV2 ? body.submissionStartAt || body.startsAt : body.votingStartsAt || body.submissionStartAt || body.startsAt;
  const reviewRevisionNumber = currentStatus === "changes_requested" || currentStatus === "requires_changes"
    ? Math.max(1, Number(current.reviewRevisionNumber ?? 1)) + 1
    : 1;
  const revisionSuffix = reviewRevisionNumber === 1 ? "initial" : `revision_${reviewRevisionNumber}`;
  const storedChallengeFields = sanitizeFirestorePayload(body, "challengeUpdate");
  const update: Record<string, unknown> = {
    ...storedChallengeFields,
    officialChallenge: current.officialChallenge === true,
    ownershipType: current.ownershipType ?? "creator_personal",
    organizationOwnerId: current.officialChallenge === true ? current.organizationOwnerId ?? null : null,
    enterpriseOrganizationId: current.officialChallenge === true ? current.enterpriseOrganizationId ?? current.organizationOwnerId ?? null : null,
    enterpriseFinanceContextId: current.officialChallenge === true ? current.enterpriseFinanceContextId ?? current.organizationOwnerId ?? null : null,
    enterpriseChallengeLeadId: current.officialChallenge === true ? current.enterpriseChallengeLeadId ?? current.creatorId ?? user.uid : null,
    enterpriseAssignedUserIds: current.officialChallenge === true ? [...new Set([
      String(current.enterpriseChallengeLeadId ?? current.creatorId ?? user.uid),
      ...(Array.isArray(current.enterpriseAssignments) ? current.enterpriseAssignments as Array<Record<string, unknown>> : []).filter((assignment) => assignment.status !== "removed").map((assignment) => String(assignment.userId ?? "")).filter(Boolean),
    ])] : [],
    privateAccessMethod,
    privateAccessCode: "",
    privateDirectInvitees: [],
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
    votingSettings: buildStoredVotingSettings(body.votingSettings),
    monetization: safeMonetization,
    sponsorEnabled,
    participantApprovalMode: "automatic",
    requiresParticipantApproval: false,
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
    lastPublishedAt: now,
    reviewRevisionId: `challenge_review_${id}_${revisionSuffix}`,
    reviewRevisionNumber,
    reviewReason: null
  };

  const revisionId = `challenge_review_${id}_${revisionSuffix}`;
  const submitAuditRef = db.collection("auditLogs").doc(`challenge_submit_${id}_${revisionSuffix}`);
  const revisionAuditRef = db.collection("auditLogs").doc(`challenge_revision_${id}_${revisionSuffix}`);
  const revision = { id: revisionId, challengeId: id, creatorId: user.uid, status: "pending_review", revision: reviewRevisionNumber, submittedAt: now, createdAt: now, updatedAt: now };
  const revenue = revenueShareFoundation({ challengeId: id, creatorId: user.uid, sponsorEnabled, now });
  const submitAudit = createAuditLogRecord({ actorId: user.uid, actorType: "user", action: "challenge_submitted_for_review", targetType: "challenge", targetId: id, before: { status: currentStatus }, after: { status: lifecycleStatus, title: body.title }, reason: "Challenge submitted for review.", metadata: { source: "api/challenges/[id]/publish", idempotentDraftPublish: true }, createdAt: now }, submitAuditRef.id, now);
  const revisionAudit = createAuditLogRecord({ actorId: user.uid, actorType: "user", action: "challenge_review_revision_created", targetType: "challenge", targetId: id, after: { revisionId, revision: reviewRevisionNumber }, metadata: { source: "api/challenges/[id]/publish" }, createdAt: now }, revisionAuditRef.id, now);

  let mediaVerification: Record<string, unknown>;
  try {
    mediaVerification = await verifyChallengeMedia(db, id, { ...current, ...body }, user.uid);
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":")[0] : "MEDIA_VERIFICATION_FAILED";
    await recordChallengeMediaVerificationFailure(db, id, code).catch(() => undefined);
    return rejectPublish("Challenge media could not be verified from storage. Replace the media and try again.", 422, undefined, code);
  }
  update.mediaVerification = mediaVerification;
  applyVerifiedChallengeMedia(update, mediaVerification);
  if (body.visibility === "private" || body.visibility === "exclusive") {
    try {
      privateAccess = await createPrivateChallengeInvite(db, {
        challengeId: id,
        creatorId: user.uid,
        now,
        code: privateAccessMethod === "invitation_code" ? body.privateAccessCode : undefined,
        expiresAt: body.privateAccessCodeExpiresAt ?? null,
        maxUses: body.privateAccessCodeMaxUses ?? 100,
        method: privateAccessMethod as "invite_link" | "invitation_code" | "direct_invitations",
        allowedEmails: privateAccessMethod === "direct_invitations" ? body.privateDirectInvitees : []
      });
    } catch (error) {
      return rejectPublish("Private access invitations could not be provisioned. Review the access settings and try again.", 422, undefined, error instanceof Error ? error.message : "PRIVATE_INVITE_PROVISION_FAILED");
    }
  }

  let transition: { idempotent: boolean; challenge: Record<string, unknown> };
  try {
    transition = await commitChallengeReviewSubmission(db, {
      challengeId: id,
      userId: user.uid,
      expectedStatus: currentStatus,
      update,
      revision,
      revenue,
      submitAudit: { ...submitAudit },
      revisionAudit: { ...revisionAudit },
      prizePool: { prizeType: body.prizeType, prizeValueCents: Math.round(body.prizeValue * 100), sponsorEnabled, paidEntryEnabled: safeMonetization.paidEntryRequested, now }
    });
  } catch (error) {
    if (error instanceof Error && error.name === "EnterpriseActiveChallengeLimitError") {
      return rejectPublish(error.message, 409, { activeChallengeLimit: ENTERPRISE_WORKSPACE_LIMITS.activeChallengeLimit }, "ENTERPRISE_ACTIVE_CHALLENGE_LIMIT_REACHED");
    }
    if (error instanceof Error && error.message === "ENTERPRISE_PRIZE_LIMIT_EXCEEDED") {
      return rejectPublish("Enterprise challenge prize and funding commitments cannot exceed $10,000.", 422, { maximumPrizeAmountCents: ENTERPRISE_WORKSPACE_LIMITS.maximumPrizeAmountCents }, "ENTERPRISE_PRIZE_LIMIT_EXCEEDED");
    }
    if (error instanceof Error && ["ENTERPRISE_ORGANIZATION_REQUIRED", "ENTERPRISE_FINANCE_OWNER_MISMATCH"].includes(error.message)) {
      return rejectPublish("Enterprise financial ownership could not be verified.", 409, undefined, error.message);
    }
    if (error instanceof InvalidFirestorePayloadError) {
      const payloadName = error.fieldPath.split(/[.[]/, 1)[0] || "submitPayload";
      const supportDiagnostic = { requestId: publishRequestId, stage: "payload_validation", payloadName, safePath: error.fieldPath };
      console.error("[challenge.publish] invalid Firestore payload", { challengeId: id, userId: user.uid, action: "publish_challenge", code: "SUBMIT_PAYLOAD_INVALID", ...supportDiagnostic });
      return rejectPublish("We couldn't submit this challenge because some saved details need attention.", 422, { reference: publishRequestId }, "SUBMIT_PAYLOAD_INVALID", supportDiagnostic);
    }
    if (error instanceof ChallengeReviewTransitionError) {
      const status = error.code === "CHALLENGE_NOT_FOUND" ? 404 : error.code === "PERMISSION_DENIED" ? 403 : 409;
      return rejectPublish(error.message, status, undefined, error.code);
    }
    await writeAuditLog({ actorId: user.uid, actorType: "creator", action: "challenge.publish_failed", targetType: "challenge", targetId: id, before: { status: String(current.status ?? current.lifecycleStatus ?? "unknown") }, after: { attemptedStatus: lifecycleStatus }, reason: "Challenge submission write failed.", metadata: { action: "publish_challenge", causeCode: "PUBLISH_WRITE_FAILED", planId: planAccess.normalizedPlanId, accountType: planAccess.accountType, media: mediaSummary, paidEntry: { requested: monetizationIntent.paidEntryRequested }, sponsorReady: { requested: monetizationIntent.sponsorReady }, prizePool: { requested: monetizationIntent.prizePoolRequested }, occurredAt: now }, createdAt: now }, db).catch(() => undefined);
    return serverError("Challenge could not be submitted for review.", error instanceof Error ? error.message : error);
  }
  if (transition.idempotent) return ok({ challenge: transition.challenge, idempotent: true }, "Challenge is already submitted for review.");
  await persistChallengeMediaVerification(db, id, mediaVerification);
  await createNotification(db, { userId: user.uid, type: "challenge_submitted", title: "Challenge submitted", body: "Your challenge is awaiting review.", targetId: id }).catch(() => undefined);
  if (lifecycleStatus !== "pending_review" && !safeMonetization.paidEntryRequested) {
    await awardDoroCoinEngagement(db, { userId: user.uid, sourceType: "create_free_challenge", actionId: id, challengeId: id }).catch(async (error) => {
      await db.collection("adminActionTasks").doc(`doro_create_${id}`).set({ type: "dorocoin_reward_delivery_failure", sourceType: "create_free_challenge", challengeId: id, userId: user.uid, status: "open", message: error instanceof Error ? error.message : "Reward delivery failed.", createdAt: now }, { merge: true });
    });
  }
  return ok({ challenge: update, privateAccess }, lifecycleStatus === "pending_review" ? "Challenge submitted for review." : "Challenge scheduled.");
}
