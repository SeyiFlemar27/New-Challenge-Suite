import type { Challenge } from "./types";

export type ChallengeDisplayStatus = "Open" | "Active" | "Closing Soon" | "Closed" | "Voting Open" | "Voting Closed";

export function getChallengeDisplayStatus(challenge: Challenge, now = new Date()): ChallengeDisplayStatus {
  const registrationDeadline = endOfDay(challenge.registrationDeadline);
  const startsAt = startOfDay(challenge.startsAt);
  const endsAt = endOfDay(challenge.endsAt);
  const votingEndsAt = addDays(endsAt, 7);

  if (now <= registrationDeadline) return "Open";
  if (now >= startsAt && now <= endsAt) {
    const msUntilClose = endsAt.getTime() - now.getTime();
    return msUntilClose <= 1000 * 60 * 60 * 24 * 2 ? "Closing Soon" : "Active";
  }
  if (now > endsAt && now <= votingEndsAt) return "Voting Open";
  if (now > votingEndsAt) return "Voting Closed";
  return "Closed";
}

export function canJoinChallenge(challenge: Challenge, now = new Date()) {
  const status = getChallengeDisplayStatus(challenge, now);
  return status === "Open" || status === "Active" || status === "Closing Soon";
}

export function canVoteOnChallenge(challenge: Challenge, now = new Date()) {
  const status = getChallengeDisplayStatus(challenge, now);
  return status === "Active" || status === "Closing Soon" || status === "Voting Open";
}

export function statusClassName(status: ChallengeDisplayStatus) {
  if (status === "Open" || status === "Active") return "bg-emerald-500 text-black";
  if (status === "Closing Soon") return "bg-yellow-400 text-black";
  if (status === "Voting Open") return "bg-indigo-500 text-white";
  return "bg-slate-700 text-white";
}

function startOfDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return date;
}

function endOfDay(value: string) {
  const date = new Date(`${value}T23:59:59`);
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
