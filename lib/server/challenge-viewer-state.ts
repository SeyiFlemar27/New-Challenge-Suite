import { canAccessChallenge } from "@/lib/plan-access";
import { getChallengeLifecycleState } from "@/lib/challenge-status";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { isPaidEntryChallenge, paidEntryAmountCents } from "@/lib/server/monetization-payments";
import { isSponsorProfile } from "@/lib/server/submission-lifecycle";

export type ChallengeBlockerCode =
  | "AUTH_REQUIRED"
  | "SPONSOR_NOT_ALLOWED"
  | "SELF_ENTRY_NOT_ALLOWED"
  | "CHALLENGE_NOT_FOUND"
  | "CHALLENGE_NOT_OPEN"
  | "REGISTRATION_NOT_STARTED"
  | "REGISTRATION_CLOSED"
  | "CHALLENGE_FULL"
  | "INVITATION_REQUIRED"
  | "INVALID_INVITATION"
  | "INVITATION_EXPIRED"
  | "AGE_RESTRICTION"
  | "REGION_RESTRICTED"
  | "PLAN_REQUIRED"
  | "KYC_REQUIRED"
  | "ALREADY_JOINED"
  | "ENTRY_REQUEST_PENDING"
  | "ENTRY_REQUEST_REJECTED"
  | "PAYMENT_REQUIRED"
  | "PAYMENT_EXPIRED"
  | "NOT_A_PARTICIPANT"
  | "SUBMISSION_NOT_OPEN"
  | "SUBMISSION_CLOSED"
  | "SUBMISSION_ALREADY_EXISTS"
  | "MEDIA_NOT_READY"
  | "INVALID_MEDIA_TYPE"
  | "VOTING_NOT_OPEN"
  | "VOTING_CLOSED"
  | "SELF_VOTING_NOT_ALLOWED"
  | "DAILY_FREE_VOTE_USED"
  | "NOT_ELIGIBLE_TO_VOTE";

export type ChallengeNextAction =
  | "SIGN_IN"
  | "ENTER_INVITE_CODE"
  | "COMPLETE_VERIFICATION"
  | "REQUEST_ENTRY"
  | "WAIT_FOR_ENTRY_APPROVAL"
  | "PAY_ENTRY_FEE"
  | "JOIN"
  | "WAIT_FOR_APPROVAL"
  | "SUBMIT_ENTRY"
  | "RESUBMIT_ENTRY"
  | "WAIT_FOR_SUBMISSION_REVIEW"
  | "VIEW_ENTRY"
  | "VOTE"
  | "VIEW_LEADERBOARD"
  | "WAIT_FOR_RESULTS"
  | "VIEW_WINNERS"
  | "CLAIM_PRIZE"
  | "VIEW_RESULTS"
  | "NONE";

export interface EligibilityBlocker { code: ChallengeBlockerCode; message: string; }

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isActiveParticipant(status: unknown) {
  return ["registered", "approved", "active", "joined", "checked_in", "submitted", "winner"].includes(text(status).toLowerCase());
}

function isTerminalSubmission(status: unknown) {
  return ["submitted", "pending_review", "approved", "active", "winner"].includes(text(status).toLowerCase());
}

function capacity(challenge: Record<string, unknown>) {
  const value = Math.trunc(Number(challenge.maxParticipants ?? challenge.participantLimit ?? 0) || 0);
  return value > 0 ? value : null;
}

export function evaluateChallengeEligibility(input: {
  challenge: Record<string, unknown>;
  userId?: string | null;
  profile?: Record<string, unknown> | null;
  participant?: Record<string, unknown> | null;
  submission?: Record<string, unknown> | null;
  hasPrivateAccess?: boolean;
  participantCount?: number;
  now?: Date;
}) {
  const blockers: EligibilityBlocker[] = [];
  const challenge = input.challenge;
  const lifecycle = getChallengeLifecycleState(challenge, input.now ?? new Date());
  const profile = input.profile ?? {};
  const userId = input.userId ?? null;
  if (!userId) blockers.push({ code: "AUTH_REQUIRED", message: "Sign in to enter this challenge." });
  if (isSponsorProfile(profile)) blockers.push({ code: "SPONSOR_NOT_ALLOWED", message: "Sponsor accounts cannot enter challenges." });
  if (userId && userOwnsChallenge(challenge, userId)) blockers.push({ code: "SELF_ENTRY_NOT_ALLOWED", message: "Creators and hosts cannot compete in their own challenge." });
  if (userId) {
    const access = canAccessChallenge(profile, challenge);
    if (!access.allowed) blockers.push({ code: "PLAN_REQUIRED", message: "Your plan does not allow access to this challenge." });
  }
  const visibility = text(challenge.visibility ?? challenge.type).toLowerCase();
  if ((visibility.includes("private") || visibility.includes("exclusive")) && !input.hasPrivateAccess && !(userId && userOwnsChallenge(challenge, userId))) {
    blockers.push({ code: "INVITATION_REQUIRED", message: "A valid invite is required." });
  }
  if (!lifecycle.canJoin && !input.participant) {
    const code = lifecycle.reasonCode === "registration_closed" ? "REGISTRATION_CLOSED" : lifecycle.reasonCode === "registration_not_open" ? "REGISTRATION_NOT_STARTED" : "CHALLENGE_NOT_OPEN";
    blockers.push({ code, message: lifecycle.disabledReason ?? lifecycle.userFacingMessage ?? "Registration is not open." });
  }
  const max = capacity(challenge);
  if (max !== null && !input.participant && Number(input.participantCount ?? challenge.participantCount ?? 0) >= max) {
    blockers.push({ code: "CHALLENGE_FULL", message: "This challenge is full." });
  }
  return { eligible: blockers.length === 0, blockers };
}

export function resolveChallengeViewerState(input: {
  challenge: Record<string, unknown>;
  userId?: string | null;
  profile?: Record<string, unknown> | null;
  participant?: Record<string, unknown> | null;
  submission?: Record<string, unknown> | null;
  entryPayment?: Record<string, unknown> | null;
  entryRequest?: Record<string, unknown> | null;
  hasPrivateAccess?: boolean;
  participantCount?: number;
  now?: Date;
}) {
  const lifecycle = getChallengeLifecycleState(input.challenge, input.now ?? new Date());
  const authenticated = Boolean(input.userId);
  const relationship = input.userId && userOwnsChallenge(input.challenge, input.userId) ? "owner" : input.participant ? "participant" : input.submission ? "submitted" : "viewer";
  const eligibility = evaluateChallengeEligibility(input);
  const paidEntryRequired = isPaidEntryChallenge(input.challenge);
  const paymentStatus = text(input.entryPayment?.status ?? input.participant?.entryPaymentStatus ?? "not_started").toLowerCase() || "not_started";
  const paymentPaid = ["paid", "confirmed"].includes(paymentStatus);
  const participantStatus = text(input.participant?.status ?? "not_started") || "not_started";
  const submissionStatus = text(input.submission?.status ?? "not_started") || "not_started";
  const entryRequestStatus = text(input.entryRequest?.status ?? "not_started") || "not_started";
  const blockers = [...eligibility.blockers];
  if (paidEntryRequired && !paymentPaid && authenticated && eligibility.eligible) blockers.push({ code: "PAYMENT_REQUIRED" as const, message: "Entry fee payment is required." });
  if (input.submission && isTerminalSubmission(input.submission.status)) blockers.push({ code: "SUBMISSION_ALREADY_EXISTS" as const, message: "You already submitted an entry." });
  let nextAction: ChallengeNextAction = "NONE";
  if (!authenticated) nextAction = "SIGN_IN";
  else if (relationship === "owner") nextAction = "NONE";
  else if (blockers.some((item) => item.code === "INVITATION_REQUIRED")) nextAction = "ENTER_INVITE_CODE";
  else if (entryRequestStatus === "pending") nextAction = "WAIT_FOR_ENTRY_APPROVAL";
  else if (paidEntryRequired && !paymentPaid) nextAction = paymentStatus === "pending" ? "PAY_ENTRY_FEE" : "PAY_ENTRY_FEE";
  else if (!input.participant && eligibility.eligible) nextAction = "JOIN";
  else if (input.submission && submissionStatus === "rejected" && lifecycle.canSubmit) nextAction = "RESUBMIT_ENTRY";
  else if (input.submission && ["submitted", "pending_review"].includes(submissionStatus)) nextAction = "WAIT_FOR_SUBMISSION_REVIEW";
  else if (input.submission) nextAction = lifecycle.canVote ? "VOTE" : "VIEW_ENTRY";
  else if (input.participant && lifecycle.canSubmit) nextAction = "SUBMIT_ENTRY";
  else if (input.participant && lifecycle.canVote) nextAction = "VOTE";
  else if (lifecycle.primaryStatus === "completed" || lifecycle.primaryStatus === "winners_announced") nextAction = "VIEW_RESULTS";
  return {
    authenticated,
    relationship,
    eligibility,
    participantStatus,
    submissionStatus,
    entryRequestStatus,
    payment: { required: paidEntryRequired, amountCents: paidEntryRequired ? paidEntryAmountCents(input.challenge) : 0, status: paymentStatus, paid: paymentPaid },
    permissions: {
      canJoin: eligibility.eligible && !input.participant && !paidEntryRequired && lifecycle.canJoin,
      canPay: eligibility.eligible && paidEntryRequired && !paymentPaid && lifecycle.canJoin,
      canSubmit: Boolean(input.participant && lifecycle.canSubmit && (!paidEntryRequired || paymentPaid) && !input.submission),
      canVote: Boolean(lifecycle.canVote && relationship !== "owner")
    },
    ranking: null,
    winner: null,
    payout: { kycRequiredBeforeWithdrawal: true, withdrawable: false },
    nextAction,
    blockers
  };
}


export type ChallengeSubmissionAccessReason =
  | "auth_required"
  | "registration_open"
  | "submission_not_open"
  | "payment_required"
  | "payment_pending"
  | "not_enrolled"
  | "self_entry_not_allowed"
  | "sponsor_blocked"
  | "already_submitted"
  | "submission_closed"
  | "ineligible"
  | null;

export type ChallengeSubmissionAccessAction =
  | "sign_in"
  | "back_to_challenge"
  | "pay_entry_fee"
  | "join"
  | "refresh_status"
  | "view_entry"
  | "manage_challenge"
  | "submit"
  | null;

export interface ChallengeSubmissionAccess {
  canSubmit: boolean;
  reason: ChallengeSubmissionAccessReason;
  action: ChallengeSubmissionAccessAction;
  title: string;
  message: string;
}

export function resolveChallengeSubmissionAccess(input: {
  challenge: Record<string, unknown>;
  userId?: string | null;
  profile?: Record<string, unknown> | null;
  participant?: Record<string, unknown> | null;
  submission?: Record<string, unknown> | null;
  entryPayment?: Record<string, unknown> | null;
  hasPrivateAccess?: boolean;
  participantCount?: number;
  now?: Date;
}): ChallengeSubmissionAccess {
  const challenge = input.challenge;
  const lifecycle = getChallengeLifecycleState(challenge, input.now ?? new Date());
  const profile = input.profile ?? {};
  const userId = input.userId ?? null;
  const paidEntryRequired = isPaidEntryChallenge(challenge);
  const paymentStatus = text(input.entryPayment?.status ?? input.participant?.entryPaymentStatus ?? "not_started").toLowerCase() || "not_started";
  const paymentPaid = ["paid", "confirmed"].includes(paymentStatus);
  const participantActive = Boolean(input.participant && isActiveParticipant(input.participant.status));

  if (!userId) return { canSubmit: false, reason: "auth_required", action: "sign_in", title: "Sign in required", message: "Sign in before submitting to this challenge." };
  if (userOwnsChallenge(challenge, userId)) return { canSubmit: false, reason: "self_entry_not_allowed", action: "manage_challenge", title: "You created this challenge", message: "Creators cannot submit entries to their own challenge." };
  if (isSponsorProfile(profile)) return { canSubmit: false, reason: "sponsor_blocked", action: "back_to_challenge", title: "Sponsors cannot submit entries", message: "Use a competitor account to participate." };
  if (input.submission && isTerminalSubmission(input.submission.status)) return { canSubmit: false, reason: "already_submitted", action: "view_entry", title: "Entry already submitted", message: "You have already submitted your entry for this challenge." };
  if (paidEntryRequired && paymentStatus === "pending") return { canSubmit: false, reason: "payment_pending", action: "refresh_status", title: "Payment processing", message: "We are confirming your payment." };
  if (paidEntryRequired && !paymentPaid) return { canSubmit: false, reason: "payment_required", action: lifecycle.canJoin ? "pay_entry_fee" : "back_to_challenge", title: "Entry fee required", message: `Pay the $${(paidEntryAmountCents(challenge) / 100).toFixed(2)} entry fee before submitting.` };
  if (!participantActive && !paymentPaid) return { canSubmit: false, reason: "not_enrolled", action: lifecycle.canJoin ? "join" : "back_to_challenge", title: "Enrollment required", message: "Join this challenge before submitting." };
  if (!lifecycle.canSubmit && lifecycle.participationStatus === "registration_open") return { canSubmit: false, reason: "registration_open", action: "back_to_challenge", title: "Registration still open", message: "You can submit after registration closes." };
  if (!lifecycle.canSubmit && lifecycle.submissionStatus === "submissions_not_open") return { canSubmit: false, reason: "submission_not_open", action: "back_to_challenge", title: "Waiting for submissions", message: participantActive || paymentPaid ? "You are enrolled. Submission opens after registration closes." : "Submission is not open yet." };
  if (!lifecycle.canSubmit && lifecycle.submissionStatus === "submissions_closed") return { canSubmit: false, reason: "submission_closed", action: "back_to_challenge", title: "Submissions closed", message: "The submission deadline has passed." };
  if (!lifecycle.canSubmit) return { canSubmit: false, reason: "ineligible", action: "back_to_challenge", title: "Submission unavailable", message: lifecycle.disabledReason ?? lifecycle.userFacingMessage ?? "This challenge is not accepting submissions." };

  return { canSubmit: true, reason: null, action: "submit", title: "Submit Entry", message: "Upload your entry and submit it before the deadline." };
}
