export type ChallengeDisplayStatus = "Draft" | "Pending Review" | "Scheduled" | "Open" | "Active" | "Closing Soon" | "Closed" | "Voting Open" | "Voting Closed" | "Under Review" | "Winners Announced" | "Completed" | "Cancelled" | "Paused";

const statusLabels: Record<string, ChallengeDisplayStatus> = {
  draft: "Draft",
  pending_review: "Pending Review",
  scheduled: "Scheduled",
  active: "Active",
  submission_open: "Open",
  voting_open: "Voting Open",
  voting_closed: "Voting Closed",
  under_review: "Under Review",
  winners_announced: "Winners Announced",
  completed: "Completed",
  cancelled: "Cancelled",
  paused: "Paused"
};

export function getChallengeDisplayStatus(challenge: Record<string, any>, now = new Date()): ChallengeDisplayStatus {
  const rawStatus = String(challenge.status ?? "").toLowerCase();
  if (["draft", "pending_review", "cancelled", "paused", "under_review", "winners_announced", "completed"].includes(rawStatus)) {
    return statusLabels[rawStatus];
  }

  const submissionDeadlineValue = challenge.submissionDeadline ?? challenge.registrationDeadline;
  const votingDeadlineValue = challenge.votingDeadline ?? challenge.votingEndsAt;
  const startsAt = parseDate(challenge.startsAt, "start");
  const endsAt = parseDate(challenge.endsAt, "end");
  const submissionDeadline = parseDate(submissionDeadlineValue, "end");
  const votingDeadline = parseDate(votingDeadlineValue, "end");

  if (rawStatus === "scheduled" && startsAt && startsAt > now) return "Scheduled";
  if (rawStatus === "submission_open") return "Open";
  if (rawStatus === "voting_open") return "Voting Open";
  if (rawStatus === "voting_closed") return "Voting Closed";

  if (startsAt && now < startsAt) return "Scheduled";
  if (submissionDeadline && now <= submissionDeadline) return "Open";
  if (votingDeadline && now <= votingDeadline) return "Voting Open";
  if (endsAt && now > endsAt) return "Closed";
  if (endsAt && now <= endsAt) {
    const msUntilClose = endsAt.getTime() - now.getTime();
    return msUntilClose <= 1000 * 60 * 60 * 24 * 2 ? "Closing Soon" : "Active";
  }
  return "Closed";
}

export function canJoinChallenge(challenge: Record<string, any>, now = new Date()) {
  const status = String(challenge.status ?? "").toLowerCase();
  if (["draft", "pending_review", "voting_open", "voting_closed", "under_review", "winners_announced", "completed", "cancelled", "paused"].includes(status)) return false;
  const displayStatus = getChallengeDisplayStatus(challenge, now);
  return displayStatus === "Open" || displayStatus === "Active" || displayStatus === "Closing Soon";
}

export function canVoteOnChallenge(challenge: Record<string, any>, now = new Date()) {
  const status = String(challenge.status ?? "").toLowerCase();
  if (["draft", "pending_review", "scheduled", "submission_open", "under_review", "winners_announced", "completed", "cancelled", "paused"].includes(status)) return false;
  const displayStatus = getChallengeDisplayStatus(challenge, now);
  return displayStatus === "Active" || displayStatus === "Closing Soon" || displayStatus === "Voting Open";
}

export function statusClassName(status: ChallengeDisplayStatus) {
  if (status === "Open" || status === "Active") return "bg-emerald-500 text-black";
  if (status === "Closing Soon" || status === "Scheduled") return "bg-yellow-400 text-black";
  if (status === "Voting Open") return "bg-indigo-500 text-white";
  if (status === "Pending Review" || status === "Under Review") return "bg-purple-600 text-white";
  if (status === "Draft" || status === "Paused") return "bg-slate-700 text-white";
  return "bg-slate-800 text-white";
}

function parseDate(value: unknown, mode: "start" | "end") {
  if (typeof value !== "string" || !value) return null;
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T${mode === "start" ? "00:00:00" : "23:59:59"}`);
  return Number.isNaN(date.getTime()) ? null : date;
}
