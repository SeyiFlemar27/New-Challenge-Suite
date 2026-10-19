import { getAdminDb } from "@/lib/firebase/admin";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
import { canAccessChallenge } from "@/lib/plan-access";
import { isPublicChallenge, publicChallengeFields } from "@/lib/server/public-challenge";
import { publicPrizePoolFields } from "@/lib/server/prize-pools";
import { challengeForPlanAccess } from "@/lib/server/challenge-access";
import { isPaidEntryChallenge, paidEntryAmountCents } from "@/lib/server/monetization-payments";
import { isChallengeJoinable, isSponsorProfile } from "@/lib/server/submission-lifecycle";
import { getChallengeLifecycleState, getChallengePhaseSummary } from "@/lib/challenge-status";
import { resolveChallengeSubmissionAccess, resolveChallengeViewerState } from "@/lib/server/challenge-viewer-state";
import { getParticipantJourneyState } from "@/lib/server/participant-journey";
import { isEnteredParticipantStatus } from "@/lib/server/submission-lifecycle";
import { buildPublicChallengeParticipants } from "@/lib/server/challenge-participants";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { predictionAccessForViewer } from "@/lib/server/predictions";
import { freeVoteGuardId, nextVoteResetAt, validVotingTimeZone, voteDateKeyForTimeZone } from "@/lib/server/voting";
import { getChallengeBoostAccess } from "@/lib/server/boosts";
import { hasExplicitNoWinnersOutcome } from "@/lib/server/official-winner-records";
import { usesAutomaticVoting } from "@/lib/automatic-voting-policy";

async function flagMissingOfficialWinners(db: NonNullable<ReturnType<typeof getAdminDb>>, challengeId: string) {
  const ref = db.collection("adminActionTasks").doc(`challenge_results_missing_${challengeId}`);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) return;
    const now = new Date().toISOString();
    transaction.create(ref, {
      id: ref.id,
      type: "challenge_results_integrity_review",
      challengeId,
      issue: "official_winner_records_missing",
      status: "open",
      createdAt: now,
      updatedAt: now
    });
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge details");

  const challengeSnap = await db.collection("challenges").doc(id).get();
  if (!challengeSnap.exists) {
    return fail("Challenge not found.", 404, { fieldErrors: { id: "Challenge does not exist." } }, "NOT_FOUND");
  }

  const challengeData = challengeSnap.data() ?? {};
  const creatorId = String(challengeData.creatorId ?? challengeData.ownerId ?? challengeData.hostId ?? challengeData.userId ?? "");
  const publiclyVisible = isPublicChallenge(challengeSnap.id, challengeData);
  const user = await getOptionalRequestUser(request);
  if ((challengeData.adminReviewRequired === true || ["pending_review", "changes_requested", "rejected"].includes(String(challengeData.adminApprovalStatus ?? challengeData.reviewStatus ?? "")))
    && user?.uid !== creatorId && user?.role !== "admin" && !user?.isAdmin) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
  let requestProfile: Record<string, unknown> = {};
  let hasPrivateAccess = false;
  if (!user && !publiclyVisible) {
    return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
  }
  if (user) {
    const [accountSnap, profileSnap] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get()
    ]);
    requestProfile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) };
    const accessContext = await challengeForPlanAccess(db, { id: challengeSnap.id, ...challengeData }, user.uid);
    hasPrivateAccess = accessContext.hasAccessGrant;
    if (accessContext.privateOnly && !accessContext.hasAccessGrant) {
      return fail("A valid private challenge invite or approval is required.", 403, { redirectTo: "/private-exclusive" }, "PRIVATE_INVITE_REQUIRED");
    }
    const access = canAccessChallenge(requestProfile, accessContext.challenge);
    if (!access.allowed) {
      return fail(access.code === "PREMIUM_REQUIRED" ? "Premium membership is required to view this challenge." : "Plan access is required for this challenge.", 403, undefined, access.code ?? "PLAN_ACCESS_DENIED");
    }
  }

  const entryPaymentId = user ? `challenge_entry_fee_${id}_${user.uid}` : null;
  const legacyEntryPaymentId = user ? `challenge_entry_${id}_${user.uid}` : null;
  const eligibleSubmissionQuery = db.collection("submissions").where("challengeId", "==", id).where("leaderboardEligible", "==", true).where("visibility", "==", "public");
  const confirmedParticipantStatuses = ["registered", "entered", "enrolled", "approved", "active", "joined", "checked_in", "submitted", "winner"];
  let confirmedParticipantQuery = db.collection("challengeParticipants").where("challengeId", "==", id).where("status", "in", confirmedParticipantStatuses);
  if (isPaidEntryChallenge(challengeData)) confirmedParticipantQuery = confirmedParticipantQuery.where("entryPaymentStatus", "in", ["paid", "confirmed"]);
  const [sponsorshipsSnap, votesCountSnap, freeVotesCountSnap, paidVotesCountSnap, userVotesSnap, confirmedParticipantCountSnap, approvedSubmissionCountSnap, activeSubmissionCountSnap, participantSnap, engagementSnap, prizePoolSnap, entryPaymentSnap, legacyEntryPaymentSnap, userSubmissionSnap, entryRequestSnap, creatorProfileSnap, creatorAccountSnap, winnersSnap] = await Promise.all([
    Promise.all([db.collection("sponsorships").where("challengeId", "==", id).limit(20).get(), db.collection("sponsorships").where("linkedChallengeId", "==", id).limit(20).get()]).then(([canonical, linked]) => ({ docs: [...canonical.docs, ...linked.docs.filter((doc) => !canonical.docs.some((item) => item.id === doc.id))] })),
    db.collection("votes").where("challengeId", "==", id).where("status", "==", "counted").count().get(),
    db.collection("votes").where("challengeId", "==", id).where("status", "==", "counted").where("voteMode", "==", "free").count().get(),
    db.collection("votes").where("challengeId", "==", id).where("status", "==", "counted").where("voteMode", "in", ["dorocoin", "credits", "paid"]).count().get(),
    user ? db.collection("votes").where("challengeId", "==", id).where("voterId", "==", user.uid).get() : Promise.resolve(null),
    confirmedParticipantQuery.count().get(),
    eligibleSubmissionQuery.where("status", "==", "approved").count().get(),
    eligibleSubmissionQuery.where("status", "in", ["active", "winner"]).count().get(),
    user ? db.collection("challengeParticipants").doc(`${id}_${user.uid}`).get() : Promise.resolve(null),
    user ? db.collection("challengeEngagements").doc(`${id}_${user.uid}`).get() : Promise.resolve(null),
    db.collection("prizePools").doc(id).get(),
    entryPaymentId ? db.collection("challengeEntryPayments").doc(entryPaymentId).get() : Promise.resolve(null),
    legacyEntryPaymentId ? db.collection("challengeEntryPayments").doc(legacyEntryPaymentId).get() : Promise.resolve(null),
    user ? db.collection("submissions").doc(`${id}_${user.uid}`).get() : Promise.resolve(null),
    user ? db.collection("challengeEntryRequests").doc(`${id}_${user.uid}`).get() : Promise.resolve(null),
    creatorId ? db.collection("profiles").doc(creatorId).get() : Promise.resolve(null),
    creatorId ? db.collection("users").doc(creatorId).get() : Promise.resolve(null),
    ["winners_announced", "completed"].includes(String(challengeData.status ?? challengeData.lifecycleStatus ?? "").toLowerCase())
      ? db.collection("winners").where("challengeId", "==", id).limit(20).get()
      : Promise.resolve(null)
  ]);

  const sponsorOrganizationIds = [...new Set(sponsorshipsSnap.docs.map((doc) => String(doc.data().sponsorOrganizationId ?? doc.data().sponsorId ?? "")).filter(Boolean))];
  const sponsorProfileSnaps = sponsorOrganizationIds.length ? await db.getAll(...sponsorOrganizationIds.map((sponsorId) => db.collection("sponsorProfiles").doc(sponsorId))) : [];
  const sponsorProfiles = new Map(sponsorProfileSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, snap.data() ?? {}]));
  const sponsorships = sponsorshipsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>))
    .filter((item) => ["approved", "active", "live", "completion_review"].includes(String(item.status ?? "").toLowerCase()))
    .map((item) => {
      const sponsorProfile = sponsorProfiles.get(String(item.sponsorOrganizationId ?? item.sponsorId ?? "")) ?? {};
      return {
      id: item.id,
      brandName: item.brandName ?? item.sponsorName ?? sponsorProfile.brandName ?? "Sponsor",
      brandLogoUrl: item.brandLogoUrl ?? item.logoUrl ?? sponsorProfile.squareIconUrl ?? sponsorProfile.logoUrl ?? null,
      sponsorRole: item.sponsorRole ?? "supporting",
      placementId: Array.isArray((item.visibility as Record<string, unknown> | undefined)?.requestedPlacements) ? String(((item.visibility as Record<string, unknown>).requestedPlacements as unknown[])[0] ?? "challenge_sidebar") : "challenge_sidebar",
      packageName: item.packageName ?? null,
      ctaButtonText: item.ctaButtonText ?? sponsorProfile.ctaButtonText ?? null,
      ctaDestinationLink: item.ctaDestinationLink ?? sponsorProfile.ctaDestinationLink ?? null,
      status: item.status
      };
    });
  const voteCount = votesCountSnap.data().count;
  const freeVoteCount = freeVotesCountSnap.data().count;
  const paidVoteCount = paidVotesCountSnap.data().count;
  const userVotes = userVotesSnap?.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>)).filter((vote) => vote.status === "counted") ?? [];
  const voteTimeZone = validVotingTimeZone(requestProfile.timeZone ?? requestProfile.timezone ?? "UTC");
  const voteDate = voteDateKeyForTimeZone(new Date(), voteTimeZone);
  const freeVoteGuardSnap = user ? await db.collection("freeVoteDailyGuards").doc(freeVoteGuardId(user.uid, id, voteDate)).get() : null;
  let publicParticipantPage: Awaited<ReturnType<typeof buildPublicChallengeParticipants>> | null = null;
  try {
    publicParticipantPage = await buildPublicChallengeParticipants(db, id, {
      sort: "highest_votes",
      page: 1,
      pageSize: 5
    });
  } catch (error) {
    const errorCode = typeof error === "object" && error && "code" in error ? String(error.code) : "UNKNOWN";
    const correlationId = crypto.randomUUID();
    console.error("[challenge-details] optional leaderboard unavailable", {
      route: "/api/challenges/[id]",
      category: errorCode === "9" || errorCode.includes("FAILED_PRECONDITION") ? "firestore_index" : "leaderboard_query",
      errorCode,
      correlationId,
      challengeId: id
    });
  }
  const eligibleSubmissionCount = publicParticipantPage?.eligibleTotal
    ?? approvedSubmissionCountSnap.data().count + activeSubmissionCountSnap.data().count;
  const leaderboardPayload = publicParticipantPage ? {
    status: publicParticipantPage.leaderboard.status,
    visibilityMode: publicParticipantPage.leaderboard.visibilityMode,
    visible: publicParticipantPage.leaderboard.visible,
    hasVerifiedVotes: publicParticipantPage.hasVerifiedVotes,
    participantDiscoveryAllowed: publicParticipantPage.participantDiscoveryAllowed,
    unavailable: false,
    message: publicParticipantPage.leaderboard.message,
    pagination: { ...publicParticipantPage.pagination, eligibleTotal: publicParticipantPage.eligibleTotal, nextCursor: undefined }
  } : {
    status: "unavailable",
    visibilityMode: "unavailable",
    visible: false,
    hasVerifiedVotes: false,
    participantDiscoveryAllowed: true,
    unavailable: true,
    message: "Audience rankings are temporarily unavailable.",
    pagination: null
  };

  const publicChallenge = publicChallengeFields(challengeData, id);
  const creatorProfile = { ...(creatorAccountSnap?.exists ? creatorAccountSnap.data() ?? {} : {}), ...(creatorProfileSnap?.exists ? creatorProfileSnap.data() ?? {} : {}) };
  const confirmedParticipantCount = Math.max(0, confirmedParticipantCountSnap.data().count);
  if (challengeData.hideParticipantList !== true) publicChallenge.participantCount = confirmedParticipantCount;
  const officialWinnerRows = (winnersSnap?.docs ?? [])
    .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>))
    .filter((winner) => ["announced", "paid"].includes(String(winner.status ?? "").toLowerCase()))
    .sort((left, right) => Number(left.position ?? left.rank ?? 0) - Number(right.position ?? right.rank ?? 0));
  const winnerUserIds = [...new Set(officialWinnerRows.map((winner) => String(winner.userId ?? "")).filter(Boolean))];
  const winnerProfileSnaps = winnerUserIds.length ? await db.getAll(...winnerUserIds.map((winnerUserId) => db.collection("profiles").doc(winnerUserId))) : [];
  const winnerProfiles = new Map(winnerProfileSnaps.map((snap) => [snap.id, snap.data() ?? {}]));
  const officialWinners = officialWinnerRows.map((winner) => {
    const profile = winnerProfiles.get(String(winner.userId ?? ""));
    const isPublicProfile = profile && profile.publicProfile !== false && profile.profileVisibility !== "private" && profile.status !== "suspended";
    const displayName = isPublicProfile
      ? String(profile.displayName ?? profile.username ?? winner.publicDisplayName ?? "Winner")
      : typeof winner.publicDisplayName === "string" && winner.publicDisplayName.trim() ? winner.publicDisplayName.trim() : "Winner";
    return {
      id: winner.id,
      submissionId: typeof winner.submissionId === "string" ? winner.submissionId : null,
      position: winner.position ?? winner.rank ?? null,
      status: winner.status,
      prizeAmountCents: winner.prizeAmountCents ?? null,
      currency: winner.currency ?? null,
      publicDisplayName: displayName,
      username: isPublicProfile && typeof profile.username === "string" ? profile.username : null,
      avatarUrl: isPublicProfile && typeof profile.avatarUrl === "string" ? profile.avatarUrl : null
    };
  });
  const resultsUnavailable = !hasExplicitNoWinnersOutcome(challengeData) && ["winners_announced", "completed"].includes(String(challengeData.status ?? challengeData.lifecycleStatus ?? "").toLowerCase()) && officialWinners.length === 0;
  if (resultsUnavailable) await flagMissingOfficialWinners(db, id).catch(() => undefined);
  const creatorPublic = creatorProfile.publicProfile !== false && creatorProfile.profileVisibility !== "private";
  const creatorDisplayName = [creatorPublic ? creatorProfile.displayName : null, creatorPublic ? creatorProfile.username : null, creatorPublic ? challengeData.creatorUsername : null]
    .map((value) => typeof value === "string" ? value.trim() : "")
    .find(Boolean) ?? "Challenge creator";
  const creatorUsername = creatorPublic ? typeof creatorProfile.username === "string" ? creatorProfile.username : typeof challengeData.creatorUsername === "string" ? challengeData.creatorUsername : null : null;
  const creatorAvatarUrl = creatorPublic ? typeof creatorProfile.avatarUrl === "string" ? creatorProfile.avatarUrl : typeof creatorProfile.photoURL === "string" ? creatorProfile.photoURL : typeof challengeData.creatorAvatarUrl === "string" ? challengeData.creatorAvatarUrl : null : null;
  const activeEntryPaymentSnap = entryPaymentSnap?.exists ? entryPaymentSnap : legacyEntryPaymentSnap;
  const entryPayment = activeEntryPaymentSnap?.exists ? { id: activeEntryPaymentSnap.id, ...activeEntryPaymentSnap.data() } as Record<string, unknown> : null;
  const participantData = participantSnap?.exists ? participantSnap.data() ?? {} : null;
  const participantEntered = Boolean(participantData && isEnteredParticipantStatus(participantData.status));
  const entryRequestData = entryRequestSnap?.exists ? entryRequestSnap.data() ?? {} : null;
  const paidEntryRequired = isPaidEntryChallenge(challengeData);
  const paidEntryAmountCentsValue = paidEntryAmountCents(challengeData);
  const entryPaymentStatus = participantData && ["paid", "confirmed"].includes(String(participantData.entryPaymentStatus ?? "")) ? "paid" : String(entryPayment?.status ?? participantData?.entryPaymentStatus ?? "not_started");
  const paidEntryEnrolled = entryPaymentStatus === "paid" || entryPaymentStatus === "confirmed";
  const joinable = isChallengeJoinable({ id: challengeSnap.id, ...challengeData });
  const phaseSummary = getChallengePhaseSummary({ id: challengeSnap.id, ...challengeData }, new Date(), { eligibleSubmissionCount });
  const lifecycle = getChallengeLifecycleState({ id: challengeSnap.id, ...challengeData });
  const sponsorAccount = isSponsorProfile(requestProfile);
  const ownerAccount = Boolean(user && userOwnsChallenge({ id: challengeSnap.id, ...challengeData }, user.uid));
  const hideParticipantList = (challengeData.hideParticipantList === true && !ownerAccount)
    || publicParticipantPage?.participantDiscoveryAllowed === false;
  const voteTotalsVisible = challengeData.hideVoteTotals !== true || ownerAccount;
  publicChallenge.participantCountVisible = !hideParticipantList;
  const boostAccess = getChallengeBoostAccess({ challenge: { id: challengeSnap.id, ...challengeData }, userId: user?.uid, profile: requestProfile });
  const submitted = Boolean(userSubmissionSnap?.exists);
  const paymentPending = entryPaymentStatus === "pending";
  const paymentRequired = paidEntryRequired && !paidEntryEnrolled;
  const baseBlockReason = sponsorAccount ? "sponsor_blocked" : submitted ? "already_submitted" : paymentPending ? "payment_pending" : paymentRequired ? "payment_required" : !lifecycle.canSubmit && lifecycle.submissionStatus === "submissions_not_open" ? "submission_not_open" : !lifecycle.canSubmit && lifecycle.submissionStatus === "submissions_closed" ? "submission_closed" : !participantSnap?.exists && !paidEntryEnrolled ? "not_enrolled" : lifecycle.disabledReason ? "ineligible" : null;
  const paidEntryState = {
    required: paidEntryRequired,
    amountCents: paidEntryRequired ? paidEntryAmountCentsValue : 0,
    currency: "usd",
    paymentStatus: paidEntryRequired ? entryPaymentStatus : "not_required",
    reservationStatus: entryPayment?.reservationStatus ?? null,
    canPay: Boolean(user && paidEntryRequired && !paidEntryEnrolled && entryPaymentStatus !== "pending" && joinable.allowed && !sponsorAccount),
    canSubmit: Boolean(lifecycle.canSubmit && (!paidEntryRequired || paidEntryEnrolled) && !submitted && !sponsorAccount),
    joinWindowOpen: joinable.allowed,
    blockedReason: paidEntryRequired && sponsorAccount
      ? "sponsor_account_blocked"
      : paidEntryRequired && !joinable.allowed
        ? joinable.code ?? "registration_closed"
        : null
  };
  const capacityParticipantCount = Math.max(0, Number(challengeData.participantCount ?? 0));
  const viewerState = resolveChallengeViewerState({ challenge: { id: challengeSnap.id, ...challengeData }, userId: user?.uid ?? null, profile: requestProfile, participant: participantData, submission: userSubmissionSnap?.exists ? userSubmissionSnap.data() ?? {} : null, entryPayment, entryRequest: entryRequestData, hasPrivateAccess, participantCount: capacityParticipantCount, eligibleSubmissionCount });
  const submissionAccess = resolveChallengeSubmissionAccess({ challenge: { id: challengeSnap.id, ...challengeData }, userId: user?.uid ?? null, profile: requestProfile, participant: participantData, submission: userSubmissionSnap?.exists ? userSubmissionSnap.data() ?? {} : null, entryPayment, hasPrivateAccess, participantCount: capacityParticipantCount, eligibleSubmissionCount });
  const participantJourney = getParticipantJourneyState({ challenge: { id: challengeSnap.id, ...challengeData }, userId: user?.uid ?? null, profile: requestProfile, participant: participantData, entryRequest: entryRequestData, payment: entryPayment, submission: userSubmissionSnap?.exists ? { id: userSubmissionSnap.id, ...userSubmissionSnap.data() } : null, phaseSummary, participantCount: capacityParticipantCount });
  const approvedSubmissionCount = approvedSubmissionCountSnap.data().count;
  const activeSubmissionCount = activeSubmissionCountSnap.data().count;
  const votingAccess = {
    automaticFreeFirst: usesAutomaticVoting(challengeData),
    authenticated: Boolean(user),
    canVote: Boolean(user && phaseSummary.votingOpen && eligibleSubmissionCount > 0 && !sponsorAccount && !ownerAccount),
    reason: eligibleSubmissionCount <= 0
      ? "no_eligible_submissions"
      : !phaseSummary.votingOpen
        ? "voting_not_open"
        : !user
          ? "auth_required"
          : ownerAccount
            ? "owner_blocked"
            : sponsorAccount
              ? "sponsor_blocked"
              : null,
    eligibleSubmissionCount,
    approvedSubmissionCount,
    activeSubmissionCount,
    freeVote: {
      available: Boolean(user && !freeVoteGuardSnap?.exists),
      used: Boolean(freeVoteGuardSnap?.exists),
      voteDate,
      timeZone: voteTimeZone,
      resetsAt: nextVoteResetAt(new Date(), voteTimeZone)
    },
    loginPath: `/auth/login?next=${encodeURIComponent(`/challenges/${id}`)}`
  };
  const predictionAccess = predictionAccessForViewer({
    challengeId: id,
    challenge: { id: challengeSnap.id, ...challengeData },
    userId: user?.uid ?? null,
    user,
    profile: requestProfile,
    eligibleSubmissionCount
  });
  const participationState = {
    phase: phaseSummary.phase,
    participationStatus: lifecycle.participationStatus,
    submissionStatus: lifecycle.submissionStatus,
    votingStatus: lifecycle.votingStatus,
    canJoin: Boolean(phaseSummary.canJoin && !sponsorAccount && !participantSnap?.exists),
    canPay: paidEntryState.canPay,
    canSubmit: Boolean(participantJourney.canSubmit && paidEntryState.canSubmit),
    canVote: Boolean(user && phaseSummary.canVote && !sponsorAccount && !ownerAccount),
    blockReason: baseBlockReason,
    message: phaseSummary.label
  };

  return ok({
    phaseSummary: hideParticipantList ? { ...phaseSummary, eligibleSubmissionCount: null } : phaseSummary,
    challenge: { id: challengeSnap.id, ...publicChallenge, creatorDisplayName, creatorUsername, creatorAvatarUrl, paidEntry: { required: paidEntryState.required, amountCents: paidEntryState.amountCents, currency: paidEntryState.currency, joinWindowOpen: paidEntryState.joinWindowOpen } },
    submissions: hideParticipantList ? [] : publicParticipantPage?.entries ?? [],
    topParticipants: hideParticipantList || !publicParticipantPage?.leaderboard.visible || !publicParticipantPage.hasVerifiedVotes
      ? []
      : publicParticipantPage.entries.filter((entry) => entry.rank !== null).slice(0, 5),
    officialWinners,
    resultsUnavailable,
    leaderboard: hideParticipantList ? { ...leaderboardPayload, pagination: leaderboardPayload.pagination ? { ...leaderboardPayload.pagination, total: null, eligibleTotal: null, hasMore: false } : null } : leaderboardPayload,
    sponsorships,
    prizePool: publicPrizePoolFields(prizePoolSnap.exists ? prizePoolSnap.data() : null),
    voteCount: voteTotalsVisible ? voteCount : null,
    voteCountVisible: voteTotalsVisible,
    voteBreakdown: voteTotalsVisible ? { freeVoteCount, paidVoteCount, paidVoteCurrency: "challenge_credits", paidVoteCostCredits: 10 } : null,
    userState: user ? {
      authenticated: true,
      joined: participantEntered,
      registered: Boolean(participantSnap?.exists),
      entryPaymentStatus,
      entryPaymentReservationStatus: entryPayment?.reservationStatus ?? null,
      entryPaymentId: entryPayment?.id ?? null,
      entryPaymentPending: paymentPending,
      paidEntryEnrolled,
      paidEntry: paidEntryState,
      viewerState,
      submissionAccess,
      participantJourney,
      ownerAccount,
      boostAccess,
      votingAccess: hideParticipantList ? { ...votingAccess, eligibleSubmissionCount: null, approvedSubmissionCount: null, activeSubmissionCount: null } : votingAccess,
      predictionAccess,
      participation: participationState,
      submitted,
      submissionId: userSubmissionSnap?.exists ? userSubmissionSnap.id : null,
      votedSubmissionIds: userVotes.map((vote) => vote.submissionId).filter(Boolean),
      voteCount: userVotes.length,
      saved: Boolean(engagementSnap?.data()?.saved),
      watchLater: Boolean(engagementSnap?.data()?.watchLater),
      interested: Boolean(engagementSnap?.data()?.interested),
      reminderStatus: engagementSnap?.data()?.reminderStatus ?? null
    } : {
      authenticated: false,
      joined: false,
      viewerState,
      submissionAccess,
      participantJourney,
      votingAccess: hideParticipantList ? { ...votingAccess, eligibleSubmissionCount: null, approvedSubmissionCount: null, activeSubmissionCount: null } : votingAccess,
      predictionAccess,
      participation: {
        phase: phaseSummary.phase,
        participationStatus: lifecycle.participationStatus,
        submissionStatus: lifecycle.submissionStatus,
        votingStatus: lifecycle.votingStatus,
        canJoin: phaseSummary.canJoin,
        canPay: false,
        canSubmit: false,
        canVote: false,
        blockReason: lifecycle.disabledReason,
        message: phaseSummary.label
      },
      votedSubmissionIds: [],
      voteCount: 0
    }
  }, "Challenge details loaded.");
}














