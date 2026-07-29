import { getAdminDb } from "@/lib/firebase/admin";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
import { canAccessChallenge } from "@/lib/plan-access";
import { buildChallengeLeaderboard } from "@/lib/server/leaderboard";
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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge details");

  const challengeSnap = await db.collection("challenges").doc(id).get();
  if (!challengeSnap.exists) {
    return fail("Challenge not found.", 404, { fieldErrors: { id: "Challenge does not exist." } }, "NOT_FOUND");
  }

  const challengeData = challengeSnap.data() ?? {};
  const publiclyVisible = isPublicChallenge(challengeSnap.id, challengeData);
  const user = await getOptionalRequestUser(request);
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
  const [leaderboard, sponsorshipsSnap, votesSnap, publicParticipantsSnap, participantSnap, engagementSnap, prizePoolSnap, entryPaymentSnap, legacyEntryPaymentSnap, userSubmissionSnap, entryRequestSnap] = await Promise.all([
    buildChallengeLeaderboard(db, id, { limit: 50 }),
    db.collection("sponsorships").where("challengeId", "==", id).limit(20).get(),
    db.collection("votes").where("challengeId", "==", id).limit(500).get(),
    db.collection("challengeParticipants").where("challengeId", "==", id).limit(250).get(),
    user ? db.collection("challengeParticipants").doc(`${id}_${user.uid}`).get() : Promise.resolve(null),
    user ? db.collection("challengeEngagements").doc(`${id}_${user.uid}`).get() : Promise.resolve(null),
    db.collection("prizePools").doc(id).get(),
    entryPaymentId ? db.collection("challengeEntryPayments").doc(entryPaymentId).get() : Promise.resolve(null),
    legacyEntryPaymentId ? db.collection("challengeEntryPayments").doc(legacyEntryPaymentId).get() : Promise.resolve(null),
    user ? db.collection("submissions").doc(`${id}_${user.uid}`).get() : Promise.resolve(null),
    user ? db.collection("challengeEntryRequests").doc(`${id}_${user.uid}`).get() : Promise.resolve(null)
  ]);

  const sponsorships = sponsorshipsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>))
    .filter((item) => item.status === "approved")
    .map((item) => ({
      id: item.id,
      brandName: item.brandName ?? item.sponsorName ?? "Sponsor",
      packageName: item.packageName ?? null,
      ctaButtonText: item.ctaButtonText ?? null,
      ctaDestinationLink: item.ctaDestinationLink ?? null,
      status: item.status
    }));
  const publicParticipantStatuses = new Set(["approved", "active", "joined", "checked_in", "submitted"]);
  const participants = publicParticipantsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>))
    .filter((item) => publicParticipantStatuses.has(String(item.status ?? "joined")))
    .map((item) => ({
      id: String(item.id),
      displayName: String(item.displayName ?? item.name ?? item.userName ?? item.username ?? "Challenge Suite member"),
      username: typeof item.username === "string" ? item.username : typeof item.userName === "string" ? item.userName : null,
      avatarUrl: typeof item.avatarUrl === "string" ? item.avatarUrl : typeof item.photoURL === "string" ? item.photoURL : null,
      participantStatus: String(item.status ?? "joined"),
      entryStatus: typeof item.submissionStatus === "string" ? item.submissionStatus : null,
      profilePath: typeof item.username === "string" ? `/profile/${item.username}` : typeof item.userName === "string" ? `/profile/${item.userName}` : "/profile"
    }));
  const votes: Array<Record<string, unknown>> = votesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const userVotes = user ? votes.filter((vote) => vote.userId === user.uid || vote.voterId === user.uid) : [];
  const { challenge: _challenge, ...leaderboardPayload } = leaderboard;
  const topParticipants = await buildPublicChallengeParticipants(db, id, {
    sort: "highest_votes",
    page: 1,
    pageSize: 5
  });

  const publicChallenge = publicChallengeFields(challengeData);
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
  const phaseSummary = getChallengePhaseSummary({ id: challengeSnap.id, ...challengeData }, new Date(), { eligibleSubmissionCount: leaderboard.entries.length });
  const lifecycle = getChallengeLifecycleState({ id: challengeSnap.id, ...challengeData });
  const sponsorAccount = isSponsorProfile(requestProfile);
  const ownerAccount = Boolean(user && userOwnsChallenge({ id: challengeSnap.id, ...challengeData }, user.uid));
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
  const viewerState = resolveChallengeViewerState({ challenge: { id: challengeSnap.id, ...challengeData }, userId: user?.uid ?? null, profile: requestProfile, participant: participantData, submission: userSubmissionSnap?.exists ? userSubmissionSnap.data() ?? {} : null, entryPayment, entryRequest: entryRequestData, hasPrivateAccess, participantCount: publicParticipantsSnap.size, eligibleSubmissionCount: leaderboard.entries.length });
  const submissionAccess = resolveChallengeSubmissionAccess({ challenge: { id: challengeSnap.id, ...challengeData }, userId: user?.uid ?? null, profile: requestProfile, participant: participantData, submission: userSubmissionSnap?.exists ? userSubmissionSnap.data() ?? {} : null, entryPayment, hasPrivateAccess, participantCount: publicParticipantsSnap.size, eligibleSubmissionCount: leaderboard.entries.length });
  const participantJourney = getParticipantJourneyState({ challenge: { id: challengeSnap.id, ...challengeData }, userId: user?.uid ?? null, profile: requestProfile, participant: participantData, entryRequest: entryRequestData, payment: entryPayment, submission: userSubmissionSnap?.exists ? { id: userSubmissionSnap.id, ...userSubmissionSnap.data() } : null, phaseSummary });
  const eligibleSubmissionCount = leaderboard.entries.length;
  const approvedSubmissionCount = leaderboard.entries.filter((entry) => String(entry.status ?? "").toLowerCase() === "approved").length;
  const activeSubmissionCount = leaderboard.entries.filter((entry) => ["active", "winner"].includes(String(entry.status ?? "").toLowerCase())).length;
  const votingAccess = {
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
    loginPath: `/auth/login?next=${encodeURIComponent(`/challenges/${id}`)}`
  };
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
    phaseSummary,
    challenge: { id: challengeSnap.id, ...publicChallenge, paidEntry: { required: paidEntryState.required, amountCents: paidEntryState.amountCents, currency: paidEntryState.currency, joinWindowOpen: paidEntryState.joinWindowOpen } },
    submissions: leaderboard.entries,
    topParticipants: topParticipants.entries,
    leaderboard: leaderboardPayload,
    sponsorships,
    participants,
    prizePool: publicPrizePoolFields(prizePoolSnap.exists ? prizePoolSnap.data() : null),
    voteCount: votes.length,
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
      votingAccess,
      participation: participationState,
      submitted,
      submissionId: userSubmissionSnap?.id ?? null,
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
      votingAccess,
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














