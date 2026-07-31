import type { ChallengePhaseSummary } from "@/lib/challenge-status";
import { paidEntryAmountCents, isPaidEntryChallenge } from "@/lib/server/monetization-payments";
import { isEnteredParticipantStatus, isSponsorProfile } from "@/lib/server/submission-lifecycle";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { formatChallengeDateTime } from "@/lib/challenge-date-time";

export type ParticipantJourneyStep =
  | "auth_required"
  | "blocked_owner"
  | "blocked_sponsor"
  | "registration_closed"
  | "register"
  | "registered_not_entered"
  | "request_entry"
  | "request_pending"
  | "request_rejected"
  | "payment_required"
  | "payment_pending"
  | "entered_waiting_submission"
  | "can_submit"
  | "already_submitted"
  | "submission_closed"
  | "fix_and_resubmit"
  | "voting_open"
  | "results_pending"
  | "completed"
  | "timeline_needs_review";

export type ParticipantJourneyAction =
  | "sign_in"
  | "register"
  | "enter_challenge"
  | "request_entry"
  | "pay_entry_fee"
  | "refresh_payment"
  | "submit_entry"
  | "fix_and_resubmit"
  | "view_entry"
  | "view_voting"
  | "view_winners"
  | "view_results"
  | "manage_challenge"
  | "wait_for_submission"
  | "back_to_challenge"
  | null;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isPaid(status: unknown) {
  return ["paid", "confirmed"].includes(text(status).toLowerCase());
}

function isPendingPayment(status: unknown) {
  return ["pending", "processing"].includes(text(status).toLowerCase());
}

function isRejectedSubmission(status: unknown) {
  return ["rejected", "requires_changes", "changes_required"].includes(text(status).toLowerCase());
}

function isSubmitted(status: unknown) {
  return ["submitted", "pending_review", "approved", "active", "winner"].includes(text(status).toLowerCase());
}

function manualApprovalRequired(challenge: Record<string, unknown>) {
  return challenge.participantApprovalMode === "manual" || challenge.requiresParticipantApproval === true || challenge.privateApprovalRequired === true;
}

function result(step: ParticipantJourneyStep, label: string, message: string, primaryAction: ParticipantJourneyAction, input: JourneyInput, flags: Record<string, boolean>, blockerCode: string | null) {
  const challengeId = String(input.challenge.id ?? input.challengeId ?? "");
  const submissionId = String(input.submission?.id ?? input.participant?.submissionId ?? "");
  const primaryHref = primaryAction === "sign_in" ? `/auth/login?next=${encodeURIComponent(`/challenges/${challengeId}`)}`
    : primaryAction === "submit_entry" || primaryAction === "fix_and_resubmit" ? `/challenges/${challengeId}/join`
    : primaryAction === "view_entry" && submissionId ? `/submissions/${submissionId}`
    : primaryAction === "view_voting" ? `/challenges/${challengeId}/votes`
    : primaryAction === "view_winners" || primaryAction === "view_results" ? "/winners"
    : primaryAction === "manage_challenge" ? "/challenges"
    : primaryAction === "wait_for_submission" ? null
    : primaryAction === "back_to_challenge" ? `/challenges/${challengeId}`
    : null;
  return {
    step,
    label,
    message,
    primaryAction,
    primaryHref,
    checklist: {
      authenticated: flags.authenticated,
      allowedRole: flags.allowedRole,
      registered: flags.registered,
      approvalRequired: flags.approvalRequired,
      approvalGranted: flags.approvalGranted,
      paymentRequired: flags.paymentRequired,
      paymentConfirmed: flags.paymentConfirmed,
      entered: flags.entered,
      submissionOpen: flags.submissionOpen,
      registrationClosesAt: input.phaseSummary.registrationEndAt,
      submissionOpensAt: input.phaseSummary.submissionStartAt,
      submissionDeadline: input.phaseSummary.submissionDeadline,
      timeZone: input.phaseSummary.timeZone,
      timelineNeedsReview: input.phaseSummary.phase === "timeline_needs_review",
      alreadySubmitted: flags.alreadySubmitted
    },
    canRegister: step === "register",
    canEnter: step === "registered_not_entered",
    canPay: step === "payment_required",
    canSubmit: step === "can_submit" || step === "fix_and_resubmit",
    blockerCode
  };
}

export interface JourneyInput {
  challenge: Record<string, unknown>;
  challengeId?: string;
  userId?: string | null;
  profile?: Record<string, unknown> | null;
  participant?: Record<string, unknown> | null;
  entryRequest?: Record<string, unknown> | null;
  payment?: Record<string, unknown> | null;
  submission?: Record<string, unknown> | null;
  phaseSummary: ChallengePhaseSummary;
  participantCount?: number;
}

export function getParticipantJourneyState(input: JourneyInput) {
  const challenge = input.challenge;
  const phase = input.phaseSummary;
  const profile = input.profile ?? {};
  const participant = input.participant ?? null;
  const request = input.entryRequest ?? null;
  const payment = input.payment ?? null;
  const submission = input.submission ?? null;
  const participantStatus = text(participant?.status).toLowerCase();
  const requestStatus = text(request?.status).toLowerCase();
  const paymentStatus = text(payment?.status ?? participant?.entryPaymentStatus).toLowerCase() || "not_started";
  const paymentRequired = isPaidEntryChallenge(challenge);
  const paymentConfirmed = !paymentRequired || isPaid(paymentStatus);
  const authenticated = Boolean(input.userId);
  const allowedRole = !isSponsorProfile(profile) && !(input.userId && userOwnsChallenge(challenge, input.userId));
  const registered = Boolean(participant) || Boolean(request) || Boolean(payment);
  const approvalRequired = manualApprovalRequired(challenge);
  const approvalGranted = !approvalRequired || requestStatus === "approved" || ["approved", "active", "entered", "enrolled"].includes(participantStatus);
  const entered = Boolean(participant && isEnteredParticipantStatus(participantStatus) && paymentConfirmed && approvalGranted);
  const alreadySubmitted = Boolean(submission && (isSubmitted(submission.status) || isRejectedSubmission(submission.status)));
  const flags = { authenticated, allowedRole, registered, approvalRequired, approvalGranted, paymentRequired, paymentConfirmed, entered, submissionOpen: phase.canSubmit, alreadySubmitted };
  const fee = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(paidEntryAmountCents(challenge) / 100);
  const submissionOpenAt = formatChallengeDateTime(phase.submissionStartAt, phase.timeZone);
  const submissionDeadline = formatChallengeDateTime(phase.submissionDeadline, phase.timeZone);
  const registrationClosesAt = formatChallengeDateTime(phase.registrationEndAt, phase.timeZone);
  const maxParticipants = Math.max(0, Math.trunc(Number(challenge.maxParticipants ?? challenge.participantLimit ?? 0) || 0));
  const challengeFull = maxParticipants > 0 && Number(input.participantCount ?? challenge.participantCount ?? 0) >= maxParticipants;

  if (input.userId && userOwnsChallenge(challenge, input.userId)) return result("blocked_owner", "You created this challenge", "Creators cannot participate in their own challenge.", "manage_challenge", input, flags, "self_entry_not_allowed");
  if (phase.phase === "cancelled") return result("registration_closed", "Challenge cancelled", "Participation is no longer available.", null, input, flags, "challenge_cancelled");
  if (phase.phase === "winners_announced") return result("completed", "Winners announced", "Results are available for this challenge.", "view_winners", input, flags, null);
  if (phase.phase === "completed") return result("completed", "Challenge completed", "Final results are available.", "view_results", input, flags, null);
  if (!authenticated) return result("auth_required", "Sign in to continue", "Sign in before participating in this challenge.", "sign_in", input, flags, "auth_required");
  if (isSponsorProfile(profile)) return result("blocked_sponsor", "Sponsors cannot participate as competitors", "Use sponsor tools for funding, messaging, and campaign activity.", null, input, flags, "sponsor_blocked");
  if (phase.phase === "timeline_needs_review") return result("timeline_needs_review", "Schedule pending", "The organizer is confirming the challenge schedule.", null, input, flags, "timeline_needs_review");
  if (submission && isRejectedSubmission(submission.status) && phase.canSubmit && entered) return result("fix_and_resubmit", "Fix and resubmit", `Update your entry before ${submissionDeadline ?? "the deadline"}.`, "fix_and_resubmit", input, flags, null);
  if (submission && isSubmitted(submission.status)) return result("already_submitted", "Entry submitted", "Your entry has been submitted for this challenge.", "view_entry", input, flags, "already_submitted");
  if (requestStatus === "pending") return result("request_pending", "Approval pending", "The host is reviewing your registration.", null, input, flags, "request_pending");
  if (requestStatus === "rejected") return result("request_rejected", "Request rejected", "Your entry request was not approved.", "back_to_challenge", input, flags, "request_rejected");
  if (approvalRequired && !registered) return result("request_entry", "Request Entry", "This challenge requires approval before you can enter.", "request_entry", input, flags, null);
  if (approvalRequired && !approvalGranted) return result("request_pending", "Approval pending", "The host is reviewing your registration.", null, input, flags, "request_pending");
  if (paymentRequired && isPendingPayment(paymentStatus)) return result("payment_pending", "Payment processing", "We are confirming your payment. This page will update after confirmation.", "refresh_payment", input, flags, "payment_pending");
  if (paymentRequired && !paymentConfirmed) {
    const canCompleteExisting = registered && phase.phase !== "submission_closed";
    if (!phase.canJoin && !canCompleteExisting) return result("registration_closed", "Registration closed", "Registration is closed for this challenge.", "back_to_challenge", input, flags, "registration_closed");
    return result("payment_required", "Complete payment", "Your registration is incomplete until payment succeeds.", "pay_entry_fee", input, flags, null);
  }
  if (!registered) {
    if (challengeFull) return result("registration_closed", "Challenge full", "Maximum participant capacity has been reached.", null, input, flags, "challenge_full");
    if (!phase.canJoin) return result("registration_closed", "Registration closed", registrationClosesAt ? `Registration ended ${registrationClosesAt}.` : "Registration is closed for this challenge.", null, input, flags, "registration_closed");
    return result("register", "Join Challenge", registrationClosesAt ? `Registration closes ${registrationClosesAt}.` : "Registration is open.", "register", input, flags, null);
  }
  if (!entered) return result("registered_not_entered", "Registration complete", submissionDeadline ? `Complete your submission before ${submissionDeadline}.` : "Complete your submission before the deadline.", "enter_challenge", input, flags, null);
  if (phase.canSubmit) return result("can_submit", "Ready to submit", "You can submit now.", "submit_entry", input, flags, null);
  if (phase.phase === "voting_pending") return result("submission_closed", "Voting unavailable", "No eligible submissions are available for voting yet.", null, input, flags, "no_eligible_submissions");
  if (phase.votingOpen && Number(phase.eligibleSubmissionCount ?? 0) > 0) return result("voting_open", "Voting open", "Registration has closed, but voting is now active.", "view_voting", input, flags, null);
  if (phase.phase === "voting_closed") return result("submission_closed", "Submission closed", "New submissions are no longer accepted.", null, input, flags, "submission_closed");
  if (phase.phase === "under_review") return result("results_pending", "Results pending", "Entries are under review.", null, input, flags, "results_pending");
  if (phase.phase === "submission_closed") return result("submission_closed", "Submission closed", "New submissions are no longer accepted.", null, input, flags, "submission_closed");
  return result("entered_waiting_submission", "You're entered", submissionOpenAt ? `Submissions open at ${submissionOpenAt}.` : "Waiting for submissions to open.", "wait_for_submission", input, flags, "submission_not_open");
}
