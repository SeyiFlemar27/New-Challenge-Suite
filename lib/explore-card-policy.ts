type Row = Record<string, unknown>;

/** Select only a real, future milestone. Never substitute publication time for a deadline. */
export function exploreNextMilestone(record: Row, now = Date.now()): { label: string; at: string } | null {
  const kind = String(record.challengeType ?? record.type ?? "").toLowerCase();
  const candidates: Array<[string, unknown]> = kind.includes("live") || record.isLiveEvent === true
    ? [["Event starts", record.eventStartsAt ?? record.startsAt ?? record.eventDate]]
    : kind.includes("tournament") || record._tournamentSource === true
      ? [["Submissions due", record.nextSubmissionDeadlineAt], ["Voting ends", record.nextVotingClosesAt], ["Starts", record.activationWindowEndsAt]]
      : [["Registration ends", record.registrationDeadline ?? record.registrationEndAt ?? record.registrationClosesAt], ["Submissions open", record.submissionStartsAt ?? record.submissionStartAt], ["Submissions due", record.submissionDeadline ?? record.submissionEndAt ?? record.submissionClosesAt], ["Voting opens", record.votingStartsAt ?? record.votingStartAt], ["Voting ends", record.votingDeadline ?? record.votingEndsAt]];
  return candidates.flatMap(([label, value]) => {
    if (!value) return [];
    const instant = value instanceof Date ? value.getTime() : Date.parse(String(value));
    return Number.isFinite(instant) && instant > now ? [{ label, at: new Date(instant).toISOString() }] : [];
  }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0] ?? null;
}
